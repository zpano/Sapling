import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const STATIC_DIR = path.join(ROOT_DIR, 'test');
const MOCK_PORT = 3000;
const API_PROFILE_ID = 'sapling_api_profile_custom_1';
const TODAY = new Date().toISOString().split('T')[0];
const ENV_API_ENDPOINT = process.env.SAPLING_API_ENDPOINT;
const ENV_API_KEY = process.env.SAPLING_API_KEY;
const ENV_MODEL_NAME = process.env.SAPLING_MODEL_NAME;
const USE_REAL_API = process.env.SAPLING_USE_REAL_API === '1';
const HAS_REAL_API_CONFIG = Boolean(ENV_API_ENDPOINT || ENV_API_KEY || ENV_MODEL_NAME);
let previousSyncData: Record<string, unknown> | null = null;
let previousLocalData: Record<string, unknown> | null = null;

function resolveExtensionPath() {
  const fromEnv = process.env.EXTENSION_PATH;
  if (fromEnv) {
    const resolved = path.resolve(ROOT_DIR, fromEnv);
    if (!fs.existsSync(resolved)) {
      throw new Error(`EXTENSION_PATH does not exist: ${resolved}`);
    }
    return resolved;
  }

  const prodPath = path.join(ROOT_DIR, '.output', 'chrome-mv3');
  if (fs.existsSync(prodPath)) return prodPath;

  const devPath = path.join(ROOT_DIR, '.output', 'chrome-mv3-dev');
  if (fs.existsSync(devPath)) return devPath;

  throw new Error('Extension build not found. Run "npm run build" first or set EXTENSION_PATH.');
}

function isPortOpen(port: number, host = '127.0.0.1') {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ port, host }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

async function waitForPort(port: number, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for port ${port}`);
}

async function startMockServer() {
  if (await isPortOpen(MOCK_PORT)) {
    return { process: null as ChildProcessWithoutNullStreams | null, started: false };
  }

  const child = spawn(process.execPath, [path.join(ROOT_DIR, 'test', 'mock-server.js')], {
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const exitPromise = new Promise<void>((_, reject) => {
    child.once('exit', (code) => reject(new Error(`Mock server exited early with code ${code}`)));
  });

  await Promise.race([waitForPort(MOCK_PORT), exitPromise]);
  return { process: child, started: true };
}

async function startStaticServer(rootDir: string) {
  const resolvedRoot = path.resolve(rootDir);
  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/automation.html';
    const safePath = pathname.replace(/^\/+/, '');
    const filePath = path.resolve(resolvedRoot, safePath);

    if (!filePath.startsWith(rootWithSep)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    try {
      const data = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath);
      const contentType = ext === '.html'
        ? 'text/html'
        : ext === '.css'
          ? 'text/css'
          : 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end('Not Found');
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function getServiceWorker(context: BrowserContext) {
  return context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
}

async function getExtensionId(context: BrowserContext) {
  const serviceWorker = await getServiceWorker(context);
  return new URL(serviceWorker.url()).host;
}

async function waitForContentReady(context: BrowserContext, targetUrl: string, timeoutMs = 10_000) {
  const serviceWorker = await getServiceWorker(context);
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = await serviceWorker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find(t => t.url === url) ?? tabs.find(t => t.active && t.currentWindow);
      if (!tab?.id) return { ok: false };
      try {
        const status = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });
        return { ok: true, status };
      } catch {
        return { ok: false };
      }
    }, targetUrl);

    if (result.ok && typeof result.status?.enabled === 'boolean') {
      return result.status;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  throw new Error('Timed out waiting for content script readiness');
}

function getApiConfig() {
  if (USE_REAL_API) {
    if (!HAS_REAL_API_CONFIG || !ENV_API_ENDPOINT || !ENV_API_KEY) {
      throw new Error('SAPLING_API_ENDPOINT and SAPLING_API_KEY are required when using real API mode');
    }
    return {
      endpoint: ENV_API_ENDPOINT,
      apiKey: ENV_API_KEY,
      modelName: ENV_MODEL_NAME ?? ''
    };
  }
  return {
    endpoint: `http://127.0.0.1:${MOCK_PORT}/chat/completions`,
    apiKey: 'mock-key',
    modelName: 'mock-model'
  };
}

async function setStorageSync(context: BrowserContext, values: Record<string, unknown>) {
  const serviceWorker = await getServiceWorker(context);
  await serviceWorker.evaluate(async (payload) => {
    await chrome.storage.sync.set(payload);
  }, values);
}

async function getStorageSync(context: BrowserContext, keys: string[] | string | null = null) {
  const serviceWorker = await getServiceWorker(context);
  return await serviceWorker.evaluate(async (storageKeys) => {
    return await chrome.storage.sync.get(storageKeys ?? null);
  }, keys);
}

async function getStorageLocal(context: BrowserContext, keys: string[] | string | null = null) {
  const serviceWorker = await getServiceWorker(context);
  return await serviceWorker.evaluate(async (storageKeys) => {
    return await chrome.storage.local.get(storageKeys ?? null);
  }, keys);
}

async function setStorageLocal(context: BrowserContext, values: Record<string, unknown>) {
  const serviceWorker = await getServiceWorker(context);
  await serviceWorker.evaluate(async (payload) => {
    await chrome.storage.local.set(payload);
  }, values);
}

async function removeStorageLocal(context: BrowserContext, keys: string[]) {
  if (!keys.length) return;
  const serviceWorker = await getServiceWorker(context);
  await serviceWorker.evaluate(async (removeKeys) => {
    await chrome.storage.local.remove(removeKeys);
  }, keys);
}

async function snapshotStorage(context: BrowserContext) {
  const serviceWorker = await getServiceWorker(context);
  const snapshot = await serviceWorker.evaluate(async () => {
    const sync = await chrome.storage.sync.get(null);
    const local = await chrome.storage.local.get(null);
    return { sync, local };
  });
  previousSyncData = snapshot?.sync ?? {};
  previousLocalData = snapshot?.local ?? {};
}

async function restoreStorage(context: BrowserContext) {
  const serviceWorker = await getServiceWorker(context);
  const sync = previousSyncData ?? {};
  const local = previousLocalData ?? {};
  await serviceWorker.evaluate(async ({ syncData, localData }) => {
    await chrome.storage.sync.clear();
    await chrome.storage.local.clear();
    if (Object.keys(syncData).length) {
      await chrome.storage.sync.set(syncData);
    }
    if (Object.keys(localData).length) {
      await chrome.storage.local.set(localData);
    }
  }, { syncData: sync, localData: local });
}

type TestConfigOverrides = {
  sync?: Record<string, unknown>;
  local?: Record<string, unknown>;
  removeLocalKeys?: string[];
};

async function resetTestState(context: BrowserContext, overrides: TestConfigOverrides = {}) {
  const { endpoint, apiKey, modelName } = getApiConfig();
  const profile = {
    id: API_PROFILE_ID,
    name: 'Playwright',
    apiEndpoint: endpoint,
    apiKey,
    modelName
  };

  const baseSync: Record<string, unknown> = {
    apiEndpoint: endpoint,
    apiKey,
    modelName,
    apiProfiles: [profile],
    activeApiProfileId: profile.id,
    outputFormat: 'standard',
    enabled: true,
    blacklist: [],
    whitelist: [],
    nativeLanguage: 'zh-CN',
    targetLanguage: 'en',
    difficultyLevel: 'B1',
    intensity: 'medium',
    translationStyle: 'original-translation',
    allowLeftClickPronunciation: true,
    pronunciationProvider: 'wiktionary',
    youdaoPronunciationType: 2,
    restoreAllSameWordsOnLearned: true,
    autoProcess: false,
    processFullPage: false,
    totalWords: 0,
    todayWords: 0,
    lastResetDate: TODAY,
    cacheHits: 0,
    cacheMisses: 0,
    vocabTestCompleted: false,
    vocabTestSkipped: false
  };

  const baseLocal: Record<string, unknown> = {
    learnedWords: [],
    memorizeList: []
  };

  await setStorageSync(context, { ...baseSync, ...(overrides.sync || {}) });
  await setStorageLocal(context, { ...baseLocal, ...(overrides.local || {}) });
  const removeKeys = overrides.removeLocalKeys ?? ['Sapling_word_cache', 'Sapling_wiktionary_cache'];
  await removeStorageLocal(context, removeKeys);
}

async function sendProcessPage(context: BrowserContext, targetUrl: string) {
  const serviceWorker = await getServiceWorker(context);
  return await serviceWorker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find(t => t.url === url) ?? tabs.find(t => t.active && t.currentWindow);
    if (!tab?.id) throw new Error('No target tab to process');
    return await chrome.tabs.sendMessage(tab.id, { action: 'processPage' });
  }, targetUrl);
}

test.describe.serial('Sapling extension', () => {
  let context: BrowserContext | null = null;
  let extensionId = '';
  let baseUrl = '';
  let staticServer: http.Server | null = null;
  let mockProcess: ChildProcessWithoutNullStreams | null = null;
  let startedMock = false;

  test.beforeAll(async () => {
    if (!USE_REAL_API) {
      const mock = await startMockServer();
      mockProcess = mock.process;
      startedMock = mock.started;
    }

    const staticResult = await startStaticServer(STATIC_DIR);
    staticServer = staticResult.server;
    baseUrl = staticResult.baseUrl;

    const extensionPath = resolveExtensionPath();
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ],
      ignoreDefaultArgs: ['--disable-extensions']
    });

    extensionId = await getExtensionId(context);
    await snapshotStorage(context);
  });

  test.afterAll(async () => {
    if (context) {
      await restoreStorage(context);
      await context.close();
    }
    if (staticServer) {
      await new Promise<void>(resolve => staticServer?.close(() => resolve()));
    }
    if (mockProcess && startedMock) {
      mockProcess.kill();
    }
  });

  test('options page renders and navigation switches sections', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context);
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await expect(page.locator('#api')).toHaveClass(/active/);
    await page.click('[data-section="learning"]');
    await expect(page.locator('#learning')).toHaveClass(/active/);
    await page.close();
  });

  test('options auto-saves translation style changes', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: { translationStyle: 'original-translation' }
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.click('[data-section="learning"]');
    await expect(page.locator('#learning')).toHaveClass(/active/);
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>(
        'input[name="translationStyle"][value="translation-only"]'
      );
      if (!input) throw new Error('translation style input not found');
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await expect.poll(async () => {
      const sync = await getStorageSync(context, ['translationStyle']);
      return sync.translationStyle;
    }).toBe('translation-only');

    await page.close();
  });

  test('options word lists support search and reveal translation', async () => {
    if (!context) throw new Error('Browser context not initialized');
    const timestamp = Date.now();
    await resetTestState(context, {
      local: {
        learnedWords: [
          { original: 'alpha', word: '阿尔法', addedAt: timestamp, difficulty: 'A2' },
          { original: 'bravo', word: '布拉沃', addedAt: timestamp, difficulty: 'B1' }
        ],
        memorizeList: [
          { word: 'delta', translation: '德尔塔', addedAt: timestamp, difficulty: 'B2' },
          { word: 'echo', translation: '回声', addedAt: timestamp, difficulty: 'B1' }
        ],
        Sapling_word_cache: [
          {
            key: 'cacheword:en:zh-CN',
            translation: '缓存词',
            phonetic: '/kæʃ/',
            difficulty: 'B1',
            timestamp
          }
        ]
      },
      removeLocalKeys: []
    });

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.click('[data-section="words"]');

    const learnedList = page.locator('#learnedList');
    await expect(learnedList).toContainText('alpha');
    await expect(learnedList).toContainText('bravo');
    await page.fill('#learnedSearchInput', 'alpha');
    await expect(learnedList).toContainText('alpha');
    await expect(learnedList).not.toContainText('bravo');
    await page.fill('#learnedSearchInput', '');
    await page.click('.difficulty-filter-btn[data-tab="learned"][data-difficulty="B1"]');
    await expect(learnedList).toContainText('bravo');
    await expect(learnedList).not.toContainText('alpha');

    await page.click('.word-tab[data-tab="memorize"]');
    const memorizeList = page.locator('#memorizeList');
    await expect(memorizeList).toContainText('delta');
    await page.fill('#memorizeSearchInput', 'echo');
    await expect(memorizeList).toContainText('echo');
    await expect(memorizeList).not.toContainText('delta');
    const translationSpan = memorizeList.locator('.memorize-translation').first();
    await expect(translationSpan).toHaveClass(/memorize-translation--masked/);
    await translationSpan.click();
    await expect(translationSpan).toHaveClass(/memorize-translation--revealed/);

    await page.click('.word-tab[data-tab="cached"]');
    await expect(page.locator('#cachedList')).toContainText('cacheword');
    await page.close();
  });

  test('options word list actions move and remove entries', async () => {
    if (!context) throw new Error('Browser context not initialized');
    const timestamp = Date.now();
    await resetTestState(context, {
      local: {
        learnedWords: [
          { original: 'alpha', word: '阿尔法', addedAt: timestamp, difficulty: 'A2' }
        ],
        memorizeList: [
          { word: 'delta', translation: '德尔塔', addedAt: timestamp, difficulty: 'B2' },
          { word: 'echo', translation: '回声', addedAt: timestamp, difficulty: 'B1' }
        ],
        Sapling_word_cache: [
          {
            key: 'cacheword:en:zh-CN',
            translation: '缓存词',
            phonetic: '/kæʃ/',
            difficulty: 'B1',
            timestamp
          }
        ]
      },
      removeLocalKeys: []
    });

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.click('[data-section="words"]');

    await page.click('#learnedList .word-mark-memorize[data-word="alpha"]');
    await expect(page.locator('#learnedList')).not.toContainText('alpha');
    await page.click('.word-tab[data-tab="memorize"]');
    await expect(page.locator('#memorizeList')).toContainText('alpha');

    await page.click('#memorizeList .word-mark-learned[data-word="echo"]');
    await page.click('.word-tab[data-tab="learned"]');
    await expect(page.locator('#learnedList')).toContainText('echo');

    await page.click('.word-tab[data-tab="cached"]');
    await page.click('#cachedList .word-remove[data-type="cached"]');
    await expect(page.locator('#cachedList .empty-list')).toBeVisible();
    await page.close();
  });

  test('options clear buttons reset word lists and cache', async () => {
    if (!context) throw new Error('Browser context not initialized');
    const timestamp = Date.now();
    await resetTestState(context, {
      sync: {
        cacheHits: 4,
        cacheMisses: 2,
        cacheMaxSize: 2048
      },
      local: {
        learnedWords: [
          { original: 'alpha', word: '阿尔法', addedAt: timestamp, difficulty: 'A2' }
        ],
        memorizeList: [
          { word: 'delta', translation: '德尔塔', addedAt: timestamp, difficulty: 'B2' }
        ],
        Sapling_word_cache: [
          {
            key: 'cacheword:en:zh-CN',
            translation: '缓存词',
            phonetic: '/kæʃ/',
            difficulty: 'B1',
            timestamp
          }
        ]
      },
      removeLocalKeys: []
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.click('[data-section="words"]');

    const confirmModal = async () => {
      const overlay = page.locator('#saplingModalOverlay');
      await expect(overlay).toBeVisible();
      await page.click('#saplingModalConfirmBtn');
      await expect(overlay).toBeHidden();
    };

    await page.click('#clearLearnedBtn');
    await confirmModal();
    await expect(page.locator('#learnedList .empty-list')).toBeVisible();

    await page.click('.word-tab[data-tab="memorize"]');
    await page.click('#clearMemorizeBtn');
    await confirmModal();
    await expect(page.locator('#memorizeList .empty-list')).toBeVisible();

    await page.click('.word-tab[data-tab="cached"]');
    await page.click('#clearCacheBtn');
    await confirmModal();
    await expect(page.locator('#cachedList .empty-list')).toBeVisible();

    await expect.poll(async () => {
      const local = await getStorageLocal(context, ['learnedWords']);
      return Array.isArray(local.learnedWords) ? local.learnedWords.length : 0;
    }).toBe(0);

    await expect.poll(async () => {
      const local = await getStorageLocal(context, ['memorizeList']);
      return Array.isArray(local.memorizeList) ? local.memorizeList.length : 0;
    }).toBe(0);

    await expect.poll(async () => {
      const local = await getStorageLocal(context, ['Sapling_word_cache']);
      return Array.isArray(local.Sapling_word_cache) ? local.Sapling_word_cache.length : 0;
    }).toBe(0);

    await expect.poll(async () => {
      const sync = await getStorageSync(context, ['cacheHits', 'cacheMisses']);
      return `${sync.cacheHits ?? 0}:${sync.cacheMisses ?? 0}`;
    }).toBe('0:0');

    await page.close();
  });

  test('options retest vocab opens test and resets flag', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: { vocabTestCompleted: true, vocabTestSkipped: false }
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.click('[data-section="learning"]');

    const [vocabPage] = await Promise.all([
      context.waitForEvent('page'),
      page.click('#retestVocabBtn')
    ]);
    await vocabPage.waitForLoadState();
    expect(vocabPage.url()).toContain('vocab-test.html');

    await expect.poll(async () => {
      const sync = await getStorageSync(context, ['vocabTestCompleted']);
      return sync.vocabTestCompleted;
    }).toBe(false);

    await vocabPage.close();
    await page.close();
  });

  test('popup shows stats and opens options', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: {
        totalWords: 12,
        todayWords: 3,
        cacheHits: 5,
        cacheMisses: 5,
        cacheMaxSize: 2048
      },
      local: {
        learnedWords: [{ original: 'alpha', word: '阿尔法', addedAt: Date.now(), difficulty: 'B1' }],
        memorizeList: [{ word: 'beta', addedAt: Date.now() }],
        Sapling_word_cache: [{
          key: 'alpha:en:zh-CN',
          translation: '阿尔法',
          phonetic: '',
          difficulty: 'B1',
          timestamp: Date.now()
        }]
      },
      removeLocalKeys: []
    });

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(popupPage.locator('#totalWords')).toHaveText('12');
    await expect(popupPage.locator('#todayWords')).toHaveText('3');
    await expect(popupPage.locator('#learnedCount')).toHaveText('1');
    await expect(popupPage.locator('#memorizeCount')).toHaveText('1');
    await expect(popupPage.locator('#cacheSize')).toHaveText('1/2048');
    await expect(popupPage.locator('#hitRate')).toHaveText('50%');

    const [optionsPage] = await Promise.all([
      context.waitForEvent('page'),
      popupPage.click('#settingsBtn')
    ]);
    await optionsPage.waitForLoadState();
    expect(optionsPage.url()).toContain('options.html');
    await optionsPage.close();
    await popupPage.close();
  });

  test('popup toggle updates enabled state', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: { enabled: true }
    });

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popupPage.locator('#enableToggle')).toBeChecked();
    await expect(popupPage.locator('#toggleLabel')).toHaveText('已启用');

    await popupPage.locator('label.toggle-switch .toggle-slider').click();
    await expect(popupPage.locator('#enableToggle')).not.toBeChecked();
    await expect(popupPage.locator('#toggleLabel')).toHaveText('已禁用');

    await expect.poll(async () => {
      const sync = await getStorageSync(context, ['enabled']);
      return sync.enabled;
    }).toBe(false);

    await popupPage.close();
  });

  test('vocab-test starts and shows a word', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: { vocabTestCompleted: false, vocabTestSkipped: false }
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/vocab-test.html`);

    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await page.click('#startTestBtn');
    await expect(page.locator('#testScreen')).toBeVisible();
    await expect(page.locator('#wordDisplay')).not.toHaveText('');
    await page.close();
  });

  test('vocab-test skip sets defaults and redirects', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: { vocabTestCompleted: false, vocabTestSkipped: false }
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/vocab-test.html`);

    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await page.click('#skipTestBtn');
    await expect(page.locator('#saplingModalOverlay')).toBeVisible();
    await page.click('#saplingModalConfirmBtn');
    await page.waitForURL(/options\.html/);

    const sync = await getStorageSync(context, ['vocabTestCompleted', 'vocabTestSkipped', 'difficultyLevel']);
    expect(sync.vocabTestCompleted).toBe(true);
    expect(sync.vocabTestSkipped).toBe(true);
    expect(sync.difficultyLevel).toBe('B1');
    await page.close();
  });

  test('vocab-test completes and saves result', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: { vocabTestCompleted: false, vocabTestSkipped: false }
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/vocab-test.html`);

    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await page.click('#startTestBtn');
    await expect(page.locator('#testScreen')).toBeVisible();

    for (let i = 0; i < 20; i += 1) {
      if (await page.locator('#resultScreen').isVisible()) break;
      await page.click('#dontKnowBtn');
    }

    await expect(page.locator('#resultScreen')).toBeVisible();
    await expect(page.locator('#resultLevel')).not.toHaveText('');
    await page.click('#finishBtn');
    await page.waitForURL(/options\.html/);

    const sync = await getStorageSync(context, ['vocabTestCompleted', 'difficultyLevel', 'vocabTestResult']);
    expect(sync.vocabTestCompleted).toBe(true);
    expect(sync.difficultyLevel).toBeTruthy();
    expect(sync.vocabTestResult).toBeTruthy();
    await page.close();
  });

  test('blacklisted sites skip processing', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: { blacklist: ['127.0.0.1'] }
    });
    const page = await context.newPage();
    const targetUrl = USE_REAL_API
      ? `${baseUrl}/automation.html`
      : `${baseUrl}/automation.html?sapling-mock=1`;
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.bringToFront();

    await waitForContentReady(context, targetUrl);
    const response = await sendProcessPage(context, targetUrl);
    expect(response?.blacklisted).toBe(true);
    await expect(page.locator('.Sapling-translated')).toHaveCount(0);
    await page.close();
  });

  test('processPage returns disabled when extension is off', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: { enabled: false }
    });
    const page = await context.newPage();
    const targetUrl = USE_REAL_API
      ? `${baseUrl}/automation.html`
      : `${baseUrl}/automation.html?sapling-mock=1`;
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.bringToFront();

    const status = await waitForContentReady(context, targetUrl);
    expect(status.enabled).toBe(false);
    const response = await sendProcessPage(context, targetUrl);
    if (response) {
      const disabledOrNoop = response.disabled === true || response.processed === 0;
      expect(disabledOrNoop).toBe(true);
    }
    await expect(page.locator('.Sapling-translated')).toHaveCount(0);
    await page.close();
  });

  test('autoProcess translates without manual trigger', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: { autoProcess: true }
    });
    const page = await context.newPage();
    const targetUrl = USE_REAL_API
      ? `${baseUrl}/automation.html`
      : `${baseUrl}/automation.html?sapling-mock=1`;
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.bringToFront();

    await waitForContentReady(context, targetUrl);
    const autoTranslated = await page.waitForSelector('.Sapling-translated', { timeout: 8_000 }).catch(() => null);
    if (!autoTranslated) {
      const response = await sendProcessPage(context, targetUrl);
      if (response?.disabled) throw new Error('Extension disabled or config not loaded');
      if (response?.blacklisted) throw new Error('Test page was unexpectedly blacklisted');
      await page.waitForSelector('.Sapling-translated', { timeout: 30_000 });
    }
    await page.close();
  });

  test('TOON output format still renders translations', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: { outputFormat: 'toon' }
    });
    const page = await context.newPage();
    const targetUrl = USE_REAL_API
      ? `${baseUrl}/automation.html`
      : `${baseUrl}/automation.html?sapling-mock=1`;
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.bringToFront();

    await waitForContentReady(context, targetUrl);
    const response = await sendProcessPage(context, targetUrl);
    if (response?.disabled) throw new Error('Extension disabled or config not loaded');
    if (response?.blacklisted) throw new Error('Test page was unexpectedly blacklisted');

    await page.waitForSelector('.Sapling-translated', { timeout: 30_000 });
    const first = page.locator('.Sapling-translated').first();
    await expect(first).toHaveAttribute('data-original', /.+/);
    await expect(first).toHaveAttribute('data-translation', /.+/);
    await page.close();
  });

  test('translation style updates reprocess content', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: { translationStyle: 'translation-only' }
    });
    const page = await context.newPage();
    const targetUrl = USE_REAL_API
      ? `${baseUrl}/automation.html`
      : `${baseUrl}/automation.html?sapling-mock=1`;
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.bringToFront();

    await waitForContentReady(context, targetUrl);
    const response = await sendProcessPage(context, targetUrl);
    if (response?.disabled) throw new Error('Extension disabled or config not loaded');
    if (response?.blacklisted) throw new Error('Test page was unexpectedly blacklisted');

    await page.waitForSelector('.Sapling-translated', { timeout: 30_000 });
    await expect(page.locator('.Sapling-translated').first()).toHaveAttribute('data-style', 'translation-only');

    await setStorageSync(context, { translationStyle: 'original-translation' });
    await expect.poll(async () => {
      return await page.evaluate(() => document.querySelector('.Sapling-translated')?.getAttribute('data-style') || '');
    }).toBe('original-translation');
    await expect(page.locator('.Sapling-translated .Sapling-original').first()).toBeVisible();
    await page.close();
  });

  test('storage blacklist update restores content', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context);
    const page = await context.newPage();
    const targetUrl = USE_REAL_API
      ? `${baseUrl}/automation.html`
      : `${baseUrl}/automation.html?sapling-mock=1`;
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.bringToFront();

    await waitForContentReady(context, targetUrl);
    const response = await sendProcessPage(context, targetUrl);
    if (response?.disabled) throw new Error('Extension disabled or config not loaded');
    if (response?.blacklisted) throw new Error('Test page was unexpectedly blacklisted');

    await page.waitForSelector('.Sapling-translated', { timeout: 30_000 });
    await setStorageSync(context, { blacklist: ['127.0.0.1'] });
    await page.waitForFunction(() => document.querySelectorAll('.Sapling-translated').length === 0);
    await page.close();
  });

  test('processes a page and replaces words', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context);
    const page = await context.newPage();
    const consoleMessages: Array<{ type: string; text: string }> = [];
    page.on('console', (msg) => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
      if (consoleMessages.length > 50) consoleMessages.shift();
    });
    const targetUrl = USE_REAL_API
      ? `${baseUrl}/automation.html`
      : `${baseUrl}/automation.html?sapling-mock=1`;
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.bringToFront();

    const statusBefore = await waitForContentReady(context, targetUrl);
    const response = await sendProcessPage(context, targetUrl);
    if (response?.disabled) {
      throw new Error('Extension disabled or config not loaded');
    }
    if (response?.blacklisted) {
      throw new Error('Test page was unexpectedly blacklisted');
    }

    try {
      await page.waitForSelector('.Sapling-translated', { timeout: 30_000 });
    } catch (error) {
      const debug = await page.evaluate(() => ({
        translatedCount: document.querySelectorAll('.Sapling-translated').length,
        processedMarkers: document.querySelectorAll('[data-Sapling-processed]').length
      }));
      throw new Error(`No translations detected. statusBefore=${JSON.stringify(statusBefore)} response=${JSON.stringify(response)} debug=${JSON.stringify(debug)} console=${JSON.stringify(consoleMessages)}`);
    }
    const translated = page.locator('.Sapling-translated');
    const translatedCount = await translated.count();
    expect(translatedCount).toBeGreaterThan(0);
    const firstOriginal = await translated.first().getAttribute('data-original');
    expect(firstOriginal).not.toBeNull();
    await page.close();
  });

  test('translation replacements include metadata and style', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: { translationStyle: 'translation-original' }
    });
    const page = await context.newPage();
    const targetUrl = USE_REAL_API
      ? `${baseUrl}/automation.html`
      : `${baseUrl}/automation.html?sapling-mock=1`;
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.bringToFront();

    await waitForContentReady(context, targetUrl);
    const response = await sendProcessPage(context, targetUrl);
    if (response?.disabled) throw new Error('Extension disabled or config not loaded');
    if (response?.blacklisted) throw new Error('Test page was unexpectedly blacklisted');

    await page.waitForSelector('.Sapling-translated', { timeout: 30_000 });
    const first = page.locator('.Sapling-translated').first();
    await expect(first).toHaveAttribute('data-style', 'translation-original');
    await expect(first).toHaveAttribute('data-original', /.+/);
    await expect(first).toHaveAttribute('data-translation', /.+/);
    await expect(first).toHaveAttribute('data-phonetic', /.+/);
    await expect(first).toHaveAttribute('data-difficulty', /.+/);
    await expect(first).toHaveAttribute('data-part-of-speech', /.+/);
    await expect(first).toHaveAttribute('data-short-definition', /.+/);
    await expect(first).toHaveAttribute('data-example', /.+/);

    await expect(first.locator('.Sapling-word')).toBeVisible();
    await expect(first.locator('.Sapling-original')).toBeVisible();
    const originalText = (await first.locator('.Sapling-original').textContent())?.trim() || '';
    expect(originalText.startsWith('(')).toBeTruthy();
    expect(originalText.endsWith(')')).toBeTruthy();
    await page.close();
  });

  test('translation-only style omits original text', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: { translationStyle: 'translation-only' }
    });
    const page = await context.newPage();
    const targetUrl = USE_REAL_API
      ? `${baseUrl}/automation.html`
      : `${baseUrl}/automation.html?sapling-mock=1`;
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.bringToFront();

    await waitForContentReady(context, targetUrl);
    const response = await sendProcessPage(context, targetUrl);
    if (response?.disabled) throw new Error('Extension disabled or config not loaded');
    if (response?.blacklisted) throw new Error('Test page was unexpectedly blacklisted');

    await page.waitForSelector('.Sapling-translated', { timeout: 30_000 });
    const first = page.locator('.Sapling-translated').first();
    await expect(first).toHaveAttribute('data-style', 'translation-only');
    await expect(first.locator('.Sapling-original')).toHaveCount(0);
    await expect(first.locator('.Sapling-word')).toBeVisible();
    await page.close();
  });

  test('tooltip actions update word lists and options', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context);
    const page = await context.newPage();
    const targetUrl = USE_REAL_API
      ? `${baseUrl}/automation.html`
      : `${baseUrl}/automation.html?sapling-mock=1`;
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.bringToFront();

    await waitForContentReady(context, targetUrl);
    const response = await sendProcessPage(context, targetUrl);
    if (response?.disabled) throw new Error('Extension disabled or config not loaded');
    if (response?.blacklisted) throw new Error('Test page was unexpectedly blacklisted');

    await page.waitForSelector('.Sapling-translated', { timeout: 30_000 });
    const translated = page.locator('.Sapling-translated');
    const translatedCount = await translated.count();
    expect(translatedCount).toBeGreaterThan(0);

    const memorizeTarget = translated.first();
    const memorizeWord = (await memorizeTarget.getAttribute('data-original')) || '';
    expect(memorizeWord).not.toEqual('');
    await memorizeTarget.hover();
    await expect(page.locator('.Sapling-tooltip')).toBeVisible();
    await page.click('.Sapling-tooltip [data-action="memorize"]');
    await expect(page.locator('.Sapling-toast', { hasText: `Sapling: "${memorizeWord}" 已添加到记忆列表` }).first()).toBeVisible();

    const learnedTarget = translatedCount > 1 ? translated.nth(1) : translated.first();
    const learnedWord = (await learnedTarget.getAttribute('data-original')) || memorizeWord;
    await learnedTarget.hover();
    await expect(page.locator('.Sapling-tooltip')).toBeVisible();
    await page.click('.Sapling-tooltip [data-action="learned"]');
    await expect(page.locator('.Sapling-toast', { hasText: `Sapling: "${learnedWord}" 已标记为已学会` }).first()).toBeVisible();
    await expect(page.locator(`.Sapling-translated[data-original="${learnedWord}"]`)).toHaveCount(0);

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.click('[data-section="words"]');
    await expect(optionsPage.locator('#learnedList .word-original')).toContainText(learnedWord);
    await optionsPage.click('.word-tab[data-tab="memorize"]');
    await expect(optionsPage.locator('#memorizeList .word-original')).toContainText(memorizeWord);
    await optionsPage.close();
    await page.close();
  });

  test('learned action restores only one instance when configured', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: { restoreAllSameWordsOnLearned: false }
    });
    const page = await context.newPage();
    const targetUrl = USE_REAL_API
      ? `${baseUrl}/automation.html`
      : `${baseUrl}/automation.html?sapling-mock=1`;
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.bringToFront();

    await waitForContentReady(context, targetUrl);
    const response = await sendProcessPage(context, targetUrl);
    if (response?.disabled) throw new Error('Extension disabled or config not loaded');
    if (response?.blacklisted) throw new Error('Test page was unexpectedly blacklisted');

    await page.waitForSelector('.Sapling-translated', { timeout: 30_000 });
    const duplicateInfo = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('.Sapling-translated'));
      const map = new Map();
      elements.forEach((el, idx) => {
        const original = el.getAttribute('data-original') || '';
        if (!original) return;
        const entry = map.get(original) || [];
        entry.push(idx);
        map.set(original, entry);
      });
      for (const [original, indices] of map.entries()) {
        if (indices.length > 1) return { original, indices };
      }
      return null;
    });

    if (!duplicateInfo || duplicateInfo.indices.length < 2) {
      throw new Error('No duplicate translated words found');
    }

    const beforeCount = duplicateInfo.indices.length;
    const translated = page.locator('.Sapling-translated');
    await translated.nth(duplicateInfo.indices[0]).hover();
    await expect(page.locator('.Sapling-tooltip')).toBeVisible();
    await page.click('.Sapling-tooltip [data-action="learned"]');

    await page.waitForFunction(({ original, expected }) => {
      const count = Array.from(document.querySelectorAll('.Sapling-translated'))
        .filter(el => el.getAttribute('data-original') === original).length;
      return count === expected;
    }, { original: duplicateInfo.original, expected: beforeCount - 1 });

    await page.close();
  });

  test('tooltip renders metadata from translations', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: {
        nativeLanguage: 'en',
        targetLanguage: 'zh-CN'
      }
    });
    const page = await context.newPage();
    const targetUrl = USE_REAL_API
      ? `${baseUrl}/automation.html`
      : `${baseUrl}/automation.html?sapling-mock=1`;
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.bringToFront();

    await waitForContentReady(context, targetUrl);
    const response = await sendProcessPage(context, targetUrl);
    if (response?.disabled) throw new Error('Extension disabled or config not loaded');
    if (response?.blacklisted) throw new Error('Test page was unexpectedly blacklisted');

    await page.waitForSelector('.Sapling-translated', { timeout: 30_000 });
    const target = page.locator('.Sapling-translated').first();
    const original = (await target.getAttribute('data-original')) || '';
    const translation = (await target.getAttribute('data-translation')) || '';
    const phonetic = (await target.getAttribute('data-phonetic')) || '';
    const difficulty = (await target.getAttribute('data-difficulty')) || '';
    const partOfSpeech = (await target.getAttribute('data-part-of-speech')) || '';
    const shortDefinition = (await target.getAttribute('data-short-definition')) || '';
    const example = (await target.getAttribute('data-example')) || '';

    await target.hover();
    const tooltip = page.locator('.Sapling-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip.locator('.Sapling-tooltip-word')).toContainText(translation);
    await expect(tooltip.locator('.Sapling-tooltip-translation')).toContainText(original);
    await expect(tooltip.locator('.Sapling-tooltip-badge')).toHaveText(difficulty);
    await expect(tooltip.locator('.Sapling-tooltip-phonetic')).toContainText(phonetic);
    await expect(tooltip.locator('.Sapling-tooltip-pos')).toContainText(partOfSpeech);
    await expect(tooltip.locator('.Sapling-tooltip-definition')).toContainText(shortDefinition);
    await expect(tooltip.locator('.Sapling-tooltip-examples')).toContainText(example);
    await expect(tooltip.locator('.Sapling-tooltip-examples')).toContainText('(AI)');
    await page.close();
  });

  test('pronunciation shows unsupported provider toast', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context, {
      sync: {
        nativeLanguage: 'en',
        targetLanguage: 'zh-CN',
        pronunciationProvider: 'wiktionary'
      }
    });
    const page = await context.newPage();
    const targetUrl = USE_REAL_API
      ? `${baseUrl}/automation.html`
      : `${baseUrl}/automation.html?sapling-mock=1`;
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.bringToFront();

    await waitForContentReady(context, targetUrl);
    const response = await sendProcessPage(context, targetUrl);
    if (response?.disabled) throw new Error('Extension disabled or config not loaded');

    await page.waitForSelector('.Sapling-translated', { timeout: 30_000 });
    await page.locator('.Sapling-translated').first().hover();
    await expect(page.locator('.Sapling-tooltip')).toBeVisible();
    await page.click('.Sapling-tooltip [data-action="speak"]');
    await expect(page.locator('.Sapling-toast[data-type="error"]')).toContainText('你所选择的发音来源不支持你学习的语言');
    await page.close();
  });

  test('popup process button toggles processing state', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context);
    const page = await context.newPage();
    const targetUrl = USE_REAL_API
      ? `${baseUrl}/automation.html`
      : `${baseUrl}/automation.html?sapling-mock=1`;
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.bringToFront();

    await waitForContentReady(context, targetUrl);

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    const activateTargetTab = async () => {
      const serviceWorker = await getServiceWorker(context);
      await serviceWorker.evaluate(async (url) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find(t => t.url === url);
        if (tab?.id) {
          await chrome.tabs.update(tab.id, { active: true });
        }
      }, targetUrl);
    };

    await activateTargetTab();
    await popupPage.evaluate(() => {
      const btn = document.getElementById('processBtn');
      if (btn) (btn as HTMLButtonElement).click();
    });
    await page.waitForSelector('.Sapling-translated', { timeout: 30_000 });

    await activateTargetTab();
    await popupPage.evaluate(() => {
      const btn = document.getElementById('processBtn');
      if (btn) (btn as HTMLButtonElement).click();
    });
    await page.waitForFunction(() => document.querySelectorAll('.Sapling-translated').length === 0);

    await popupPage.close();
    await page.close();
  });

  test('translations are stored in local cache', async () => {
    if (!context) throw new Error('Browser context not initialized');
    await resetTestState(context);
    const page = await context.newPage();
    const targetUrl = USE_REAL_API
      ? `${baseUrl}/automation.html`
      : `${baseUrl}/automation.html?sapling-mock=1`;
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.bringToFront();

    await waitForContentReady(context, targetUrl);
    const response = await sendProcessPage(context, targetUrl);
    if (response?.disabled) throw new Error('Extension disabled or config not loaded');
    if (response?.blacklisted) throw new Error('Test page was unexpectedly blacklisted');

    await page.waitForSelector('.Sapling-translated', { timeout: 30_000 });
    await expect.poll(async () => {
      const local = await getStorageLocal(context, ['Sapling_word_cache']);
      return Array.isArray(local.Sapling_word_cache) ? local.Sapling_word_cache.length : 0;
    }).toBeGreaterThan(0);

    await page.close();
  });
});
