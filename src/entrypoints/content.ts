import '~/ui/content.css';
import { CEFR_LEVELS, INTENSITY_CONFIG, SKIP_TAGS, SKIP_CLASSES } from '~/constants';
import { CACHE_CONFIG, DEFAULT_THEME, normalizeCacheMaxSize, normalizeConcurrencyLimit, normalizeMaxBatchSize } from '~/core/config';
import { storage } from '~/core/storage/StorageService';
import { initLanguageDetector, detectLanguage } from '~/utils/language-detector';
import { isDifficultyCompatible, isCodeText, isNonLearningWord } from '~/utils/word-filters';
import { isInAllowedContentEditableRegion } from '~/utils/dom-utils';
import { applyThemeVariables } from '~/utils/color-utils';
import { TooltipManager } from '~/ui/tooltip';
import { showToast } from '~/ui/toast';
import { apiService } from '~/services/api-service';
import { contentSegmenter } from '~/services/content-segmenter';
import { textReplacer, type ReplacementItem } from '~/services/text-replacer';
import type {
  ClearCacheOrResetAllResponse,
  ContentRequest,
  GetStatusResponse,
  ProcessPageResponse,
  ProcessSpecificWordsResponse,
  RestorePageResponse
} from '~/types/messages';
import type { ApiProfile, CefrLevel, IntensityKey, OutputFormat, SaplingConfig, ThemeConfig, TranslationStyle } from '~/types/config';
import type { LearnedWord, MemorizeItem, WordCacheItem } from '~/types/storage';

// ============ 状态管理 ============

type ReplaceScope = 'all' | 'direct';

interface BatchTranslateInput {
  text: string;
  paragraphIndex: number;
}

interface BatchTranslateItem {
  paragraphIndex: number;
  immediate: ReplacementItem[];
  async: Promise<ReplacementItem[]> | null;
}

interface BatchTranslateResult {
  results: BatchTranslateItem[];
}

interface StatsDelta {
  newWords?: number;
  cacheHits?: number;
  cacheMisses?: number;
}

interface QueueResult {
  count: number;
  error: boolean;
  aborted?: boolean;
}

interface PageSegment {
  element: Element;
  text: string;
  fingerprint: string;
  scope: ReplaceScope;
  path?: string;
}

type ValidSegment = PageSegment & { filteredText: string; sourceLang: string; langKey: string };
type ProcessBatchFn = (segments: ValidSegment[]) => Promise<QueueResult>;

const API_ERROR_CODES = new Set([
  'API_NOT_CONFIGURED',
  'API_REQUEST_FAILED',
  'NETWORK_ERROR',
  'INVALID_API_KEY',
  'FORBIDDEN',
  'RATE_LIMIT',
  'SERVER_ERROR'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  return fallback;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function getErrorCode(error: unknown): string | null {
  if (!isRecord(error)) return null;
  const code = error.code;
  return typeof code === 'string' ? code : null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return String(error ?? '');
}

function isApiError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code != null && API_ERROR_CODES.has(code);
}

function normalizeDifficultyLevel(value: unknown, fallback: CefrLevel): CefrLevel {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim().toUpperCase();
  return (CEFR_LEVELS as readonly string[]).includes(candidate) ? (candidate as CefrLevel) : fallback;
}

function normalizeIntensity(value: unknown, fallback: IntensityKey): IntensityKey {
  if (typeof value === 'string' && value in INTENSITY_CONFIG) return value as IntensityKey;
  return fallback;
}

function normalizeTranslationStyle(value: unknown, fallback: TranslationStyle): TranslationStyle {
  if (value === 'translation-only' || value === 'original-translation' || value === 'translation-original') {
    return value;
  }
  return fallback;
}

function normalizeOutputFormat(value: unknown, fallback: OutputFormat): OutputFormat {
  if (value === 'standard' || value === 'toon') return value;
  return fallback;
}

function normalizeTheme(value: unknown): Partial<ThemeConfig> {
  if (!isRecord(value)) return {};
  const result: Partial<ThemeConfig> = {};
  for (const key of ['brand', 'background', 'card', 'highlight', 'underline', 'text'] as const) {
    const v = value[key];
    if (typeof v === 'string') result[key] = v;
  }
  return result;
}

function normalizeApiProfiles(value: unknown): ApiProfile[] {
  if (!Array.isArray(value)) return [];
  const profiles: ApiProfile[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = toNonEmptyString(item.id);
    const name = toNonEmptyString(item.name) ?? '未命名';
    const apiEndpoint = toNonEmptyString(item.apiEndpoint) ?? '';
    const apiKey = typeof item.apiKey === 'string' ? item.apiKey : '';
    const modelName = toNonEmptyString(item.modelName) ?? '';
    if (!id) continue;
    profiles.push({ id, name, apiEndpoint, apiKey, modelName });
  }
  return profiles;
}

function normalizeLearnedWords(value: unknown): LearnedWord[] {
  if (!Array.isArray(value)) return [];
  const result: LearnedWord[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const original = toNonEmptyString(item.original);
    const word = toNonEmptyString(item.word) ?? toNonEmptyString(item.translation);
    if (!original || !word) continue;
    result.push({
      original,
      word,
      addedAt: toNumber(item.addedAt, Date.now())
    });
  }
  return result;
}

function normalizeMemorizeList(value: unknown): MemorizeItem[] {
  if (!Array.isArray(value)) return [];
  const result: MemorizeItem[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const word = toNonEmptyString(item.word);
    if (!word) continue;
    result.push({
      word,
      addedAt: toNumber(item.addedAt, Date.now())
    });
  }
  return result;
}

type ContentConfig = SaplingConfig & {
  learnedWords: LearnedWord[];
  memorizeList: MemorizeItem[];
  blacklistNormalized?: string[];
};

type WordCacheValue = Omit<WordCacheItem, 'key'>;

let config: ContentConfig | null = null;
let isProcessing = false;
let isPageActivated = false;  // 跟踪页面是否已被激活处理（手动或自动）
const WORD_CACHE_STORAGE_KEY = 'Sapling_word_cache' as const;
let wordCache = new Map<string, WordCacheValue>();
const tooltipManager = new TooltipManager();
let processingGeneration = 0;
let restoreGeneration = 0;  // 仅在 restoreAll() 时递增，用于区分「还原」和「滚动」

// ============ 语言队列批量处理 ============
const DEFAULT_LANG_BATCH_SIZE = 3;  // 默认批量大小
const LANG_DEBOUNCE_DELAY = 2000;   // 2秒 debounce

// 全局语言队列 Map<langKey, { segments: [], timer: null }>
type LangQueue = { segments: ValidSegment[]; timer: ReturnType<typeof setTimeout> | null };
const langBatchQueue = new Map<string, LangQueue>();

// 队列处理函数引用（在 processPage 中设置）
let queueProcessBatchFn: ProcessBatchFn | null = null;
let queueRunGeneration = 0;

function normalizeDomainEntry(entry: unknown): string {
  if (!entry) return '';
  const trimmed = String(entry).trim().toLowerCase();
  if (!trimmed) return '';
  // 尝试用 URL 解析（支持用户粘贴完整链接）
  try {
    const url = new URL(trimmed);
    return url.hostname;
  } catch (_) { }
  // 去掉常见前缀
  return trimmed
    .replace(/^https?:\/\//, '')
	    .replace(/^www\./, '')
	    .replace(/\/.*$/, '');
}

function normalizeBlacklist(list: unknown): string[] {
  const items = Array.isArray(list) ? list : [];
  return items
    .map(normalizeDomainEntry)
    .filter(Boolean);
}

function isHostnameBlacklisted(hostname: unknown, blacklistList: unknown): boolean {
  const normalizedHost = String(hostname || '').toLowerCase();
  const normalizedList = normalizeBlacklist(blacklistList);
  return normalizedList.some(domain => normalizedHost === domain || normalizedHost.endsWith('.' + domain));
}

// ============ 配置加载 ============

async function loadConfig(): Promise<ContentConfig> {
  return new Promise<ContentConfig>((resolve) => {
    const applyConfig = (result: unknown = {}) => {
      const safeResult: Record<string, unknown> = isRecord(result) ? result : {};
      const apiProfiles = normalizeApiProfiles(safeResult.apiProfiles);
      const activeApiProfileId = toNonEmptyString(safeResult.activeApiProfileId);
      const activeApiProfile = activeApiProfileId
        ? apiProfiles.find(profile => profile.id === activeApiProfileId) ?? null
        : null;

      const nativeLanguage = toNonEmptyString(safeResult.nativeLanguage) ?? 'zh-CN';
      const targetLanguage = toNonEmptyString(safeResult.targetLanguage) ?? 'en';

      config = {
        apiEndpoint: activeApiProfile?.apiEndpoint || toNonEmptyString(safeResult.apiEndpoint) || 'https://api.deepseek.com/chat/completions',
        apiKey: activeApiProfile?.apiKey ?? (typeof safeResult.apiKey === 'string' ? safeResult.apiKey : ''),
        modelName: activeApiProfile?.modelName || toNonEmptyString(safeResult.modelName) || 'deepseek-chat',
        apiProfiles,
        activeApiProfileId: activeApiProfileId ?? null,

        nativeLanguage,
        targetLanguage,
        difficultyLevel: normalizeDifficultyLevel(safeResult.difficultyLevel, 'B1'),
        intensity: normalizeIntensity(safeResult.intensity, 'medium'),

        autoProcess: toBoolean(safeResult.autoProcess, false),
        showPhonetic: toBoolean(safeResult.showPhonetic, true),
        allowLeftClickPronunciation: toBoolean(safeResult.allowLeftClickPronunciation, true),
        restoreAllSameWordsOnLearned: toBoolean(safeResult.restoreAllSameWordsOnLearned, true),
        pronunciationProvider: (toNonEmptyString(safeResult.pronunciationProvider) as ContentConfig['pronunciationProvider'] | null) ?? 'wiktionary',
        youdaoPronunciationType: Number(safeResult.youdaoPronunciationType) === 1 ? 1 : 2,
        translationStyle: normalizeTranslationStyle(safeResult.translationStyle, 'original-translation'),

        blacklist: Array.isArray(safeResult.blacklist) ? safeResult.blacklist.filter((v) => typeof v === 'string') : [],
        blacklistNormalized: normalizeBlacklist(safeResult.blacklist),
        whitelist: Array.isArray(safeResult.whitelist) ? safeResult.whitelist.filter((v) => typeof v === 'string') : [],

        totalWords: toNumber(safeResult.totalWords, 0),
        todayWords: toNumber(safeResult.todayWords, 0),
        lastResetDate: toNonEmptyString(safeResult.lastResetDate) ?? new Date().toISOString().split('T')[0],
        cacheHits: toNumber(safeResult.cacheHits, 0),
        cacheMisses: toNumber(safeResult.cacheMisses, 0),

        cacheMaxSize: normalizeCacheMaxSize(safeResult.cacheMaxSize, CACHE_CONFIG.maxSize),
        concurrencyLimit: normalizeConcurrencyLimit(safeResult.concurrencyLimit),
        maxBatchSize: normalizeMaxBatchSize(safeResult.maxBatchSize),
        maxTokens: toNumber(safeResult.maxTokens, 16384),
        processFullPage: toBoolean(safeResult.processFullPage, false),

        outputFormat: normalizeOutputFormat(safeResult.outputFormat, 'standard'),
        theme: { ...DEFAULT_THEME, ...normalizeTheme(safeResult.theme) },
        enabled: toBoolean(safeResult.enabled, true),

        learnedWords: normalizeLearnedWords(safeResult.learnedWords),
        memorizeList: normalizeMemorizeList(safeResult.memorizeList),

        vocabTestCompleted: toBoolean(safeResult.vocabTestCompleted, false),
        vocabTestSkipped: toBoolean(safeResult.vocabTestSkipped, false),
        vocabTestResult: safeResult.vocabTestResult
      };

      // 测试模式：URL 参数 ?sapling-mock=1 时自动切换到本地 Mock 服务器
      if (window.location.search.includes('sapling-mock=1')) {
        config.apiEndpoint = 'http://localhost:3000/chat/completions';
        console.log('[Sapling] 测试模式: API 端点已切换到', config.apiEndpoint);
      }

      applyThemeVariables(config.theme, DEFAULT_THEME, true); // contentScriptMode = true，避免污染网页
      tooltipManager.setConfig(config);
      textReplacer.setConfig(config);
      resolve(config);
    };

    if (!globalThis.chrome?.storage?.sync?.get) {
      applyConfig({});
      return;
    }

    try {
      // 从 sync 获取配置
      storage.remote.get(null, (syncResult) => {
        const syncError = chrome?.runtime?.lastError;
        if (syncError) {
          if (!isContextInvalidated(syncError)) {
            console.warn('[Sapling] Config read failed:', syncError);
          }
          return applyConfig(config || {});
        }

        // 从 local 获取词汇列表（避免 sync 配额限制）
        storage.local.get(['learnedWords', 'memorizeList'], (localResult) => {
          const localError = chrome?.runtime?.lastError;
          if (localError && !isContextInvalidated(localError)) {
            console.warn('[Sapling] Local storage read failed:', localError);
          }

          // 合并配置和词汇列表
          const mergedResult: Record<string, unknown> = {
            ...(syncResult as unknown as Record<string, unknown>),
            learnedWords: localResult?.learnedWords,
            memorizeList: localResult?.memorizeList
          };
          applyConfig(mergedResult);
        });
      });
    } catch (error) {
      if (!isContextInvalidated(error)) {
        console.warn('[Sapling] Config read threw:', error);
      }
      applyConfig(config || {});
    }
  });
}

async function loadWordCache(): Promise<Map<string, WordCacheValue>> {
  return new Promise<Map<string, WordCacheValue>>((resolve) => {
    if (!globalThis.chrome?.storage?.local?.get) {
      return resolve(wordCache);
    }

    try {
      storage.local.get(WORD_CACHE_STORAGE_KEY, (result) => {
        const lastError = chrome?.runtime?.lastError;
        if (lastError) {
          if (!isContextInvalidated(lastError)) {
            console.warn('[Sapling] Cache read failed:', lastError);
          }
          return resolve(wordCache);
        }

        const cached = result?.[WORD_CACHE_STORAGE_KEY];
        if (cached && Array.isArray(cached)) {
          for (const item of cached) {
            if (!isRecord(item)) continue;
            const key = toNonEmptyString(item.key);
            if (!key) continue;
            wordCache.set(key, {
              translation: typeof item.translation === 'string' ? item.translation : '',
              phonetic: typeof item.phonetic === 'string' ? item.phonetic : '',
              difficulty: typeof item.difficulty === 'string' ? item.difficulty : 'B1',
              partOfSpeech: typeof item.partOfSpeech === 'string' ? item.partOfSpeech : '',
              shortDefinition: typeof item.shortDefinition === 'string' ? item.shortDefinition : '',
              example: typeof item.example === 'string' ? item.example : ''
            });
          }
        }
        resolve(wordCache);
      });
    } catch (error) {
      if (!isContextInvalidated(error)) {
        console.warn('[Sapling] Cache read threw:', error);
      }
      resolve(wordCache);
    }
  });
}

async function saveWordCache(): Promise<void> {
  const data: WordCacheItem[] = [];
  for (const [key, value] of wordCache) {
    data.push({ key, ...value });
  }
  return new Promise<void>((resolve, reject) => {
    if (!globalThis.chrome?.storage?.local?.set) return resolve();

    try {
      storage.local.set({ [WORD_CACHE_STORAGE_KEY]: data }, () => {
        const lastError = chrome?.runtime?.lastError;
          if (lastError) {
            if (isContextInvalidated(lastError)) {
              return resolve();
            }
            console.error('[Sapling] Failed to save cache:', lastError);
            return reject(lastError);
          }
          resolve();
        });
      } catch (error) {
        if (isContextInvalidated(error)) {
          return resolve();
        }
        console.error('[Sapling] Failed to save cache (threw):', error);
        reject(error);
      }
    });
  }

// Debounced cache persistence: avoid writing the full cache for every paragraph/API response.
let wordCacheSaveRequested = false;
let wordCacheSaveTimer: ReturnType<typeof setTimeout> | null = null;
let wordCacheSaveInFlight: Promise<void> = Promise.resolve();
let wordCacheClearInFlight: Promise<void> | null = null;

function removeWordCacheFromStorage() {
  return new Promise<void>((resolve) => {
    if (!globalThis.chrome?.storage?.local?.remove) return resolve();
    try {
      storage.local.remove(WORD_CACHE_STORAGE_KEY, () => resolve());
    } catch (error) {
      if (!isContextInvalidated(error)) {
        console.warn('[Sapling] Cache remove threw:', error);
      }
      resolve();
    }
  });
}

async function clearWordCache({ removeStorage = true }: { removeStorage?: boolean } = {}): Promise<void> {
  if (wordCacheClearInFlight) return wordCacheClearInFlight;

  wordCacheClearInFlight = (async () => {
    wordCacheSaveRequested = false;
    if (wordCacheSaveTimer) {
      clearTimeout(wordCacheSaveTimer);
      wordCacheSaveTimer = null;
    }

    const pending = wordCacheSaveInFlight.catch(() => { });
    wordCache.clear();
    await pending;

    if (removeStorage) {
      await removeWordCacheFromStorage();
    }
  })().finally(() => {
    wordCacheClearInFlight = null;
  });

  return wordCacheClearInFlight;
}

async function runWordCacheSaveLoop(): Promise<void> {
  while (wordCacheSaveRequested) {
    wordCacheSaveRequested = false;
    wordCacheSaveInFlight = wordCacheSaveInFlight
      .catch(() => { })
      .then(() => saveWordCache());
    await wordCacheSaveInFlight;
  }
}

function scheduleWordCacheSave(delay = 800): void {
  wordCacheSaveRequested = true;
  if (wordCacheSaveTimer) return;

  wordCacheSaveTimer = setTimeout(() => {
    wordCacheSaveTimer = null;
    void runWordCacheSaveLoop();
  }, delay);
}

async function flushWordCacheSave(): Promise<void> {
  wordCacheSaveRequested = true;
  if (wordCacheSaveTimer) {
    clearTimeout(wordCacheSaveTimer);
    wordCacheSaveTimer = null;
  }
  await runWordCacheSaveLoop();
}

function isContextInvalidated(error: unknown): boolean {
  const message = (isRecord(error) && typeof error.message === 'string') ? error.message : String(error || '');
  return message.includes('Extension context invalidated');
}

async function updateStats(stats: StatsDelta): Promise<Pick<ContentConfig, 'totalWords' | 'todayWords' | 'lastResetDate' | 'cacheHits' | 'cacheMisses'> | null> {
  return new Promise((resolve) => {
    if (!globalThis.chrome?.storage?.sync?.get || !globalThis.chrome?.storage?.sync?.set) {
      return resolve(null);
    }

    try {
      storage.remote.get(['totalWords', 'todayWords', 'lastResetDate', 'cacheHits', 'cacheMisses'], (current) => {
        const readError = chrome?.runtime?.lastError;
        if (readError) {
          if (!isContextInvalidated(readError)) {
            console.warn('[Sapling] Stats read failed:', readError);
          }
          return resolve(null);
        }

        const today = new Date().toISOString().split('T')[0];
        if (current.lastResetDate !== today) {
          current.todayWords = 0;
          current.lastResetDate = today;
        }
        const updated = {
          totalWords: (current.totalWords || 0) + (stats.newWords || 0),
          todayWords: (current.todayWords || 0) + (stats.newWords || 0),
          lastResetDate: today,
          cacheHits: (current.cacheHits || 0) + (stats.cacheHits || 0),
          cacheMisses: (current.cacheMisses || 0) + (stats.cacheMisses || 0)
        };

        try {
          storage.remote.set(updated, () => {
            const writeError = chrome?.runtime?.lastError;
            if (writeError) {
              if (!isContextInvalidated(writeError)) {
                console.warn('[Sapling] Stats write failed:', writeError);
              }
              return resolve(null);
            }
            resolve(updated);
          });
        } catch (error) {
          if (!isContextInvalidated(error)) {
            console.warn('[Sapling] Stats write threw:', error);
          }
          resolve(null);
        }
      });
    } catch (error) {
      if (!isContextInvalidated(error)) {
        console.warn('[Sapling] Stats read threw:', error);
      }
      resolve(null);
    }
  });
}

async function addToWhitelist(original: string, translation: string, difficulty: string): Promise<void> {
  if (!config) return;
  const whitelist = config.learnedWords || [];
  const exists = whitelist.some(w => w.original === original || w.word === translation);
  if (!exists) {
    whitelist.push({
      original,
      word: translation,
      addedAt: Date.now(),
      difficulty: difficulty || 'B1'
    });
    config.learnedWords = whitelist;
    await new Promise<void>((resolve) => {
      // 使用 local 存储避免 sync 配额限制
      if (!globalThis.chrome?.storage?.local?.set) return resolve();
      try {
        storage.local.set({ learnedWords: whitelist }, () => resolve());
      } catch (error) {
        if (!isContextInvalidated(error)) {
          console.warn('[Sapling] Whitelist save threw:', error);
        }
        resolve();
      }
    });
  }
}

async function addToMemorizeList(word: string): Promise<void> {
  if (!config) return;
  if (!word || !word.trim()) {
    console.warn('[Sapling] Invalid word for memorize list:', word);
    return;
  }

  const trimmedWord = word.trim();
  const list = config.memorizeList || [];
  const exists = list.some(w => w.word === trimmedWord);

  if (!exists) {
    list.push({ word: trimmedWord, addedAt: Date.now() });
    config.memorizeList = list;
    await new Promise<void>((resolve) => {
      // 使用 local 存储避免 sync 配额限制
      if (!globalThis.chrome?.storage?.local?.set) return resolve();
      try {
        storage.local.set({ memorizeList: list }, () => resolve());
      } catch (error) {
        if (!isContextInvalidated(error)) {
          console.warn('[Sapling] Memorize list save threw:', error);
        }
        resolve();
      }
    });

    if (!config.enabled) {
      showToast(`Sapling: "${trimmedWord}" 已添加到记忆列表`);
      return;
    }

    try {
      const count = await processSpecificWords([trimmedWord]);

      if (count > 0) {
        showToast(`Sapling: "${trimmedWord}" 已添加到记忆列表并翻译`);
      } else {
        try {
          await translateSpecificWords([trimmedWord]);
          showToast(`Sapling: "${trimmedWord}" 已添加到记忆列表`);
        } catch (error) {
          console.error('[Sapling] Error translating word:', trimmedWord, error);

          // 如果是 API 相关错误，显示详细的错误信息
          if (isApiError(error)) {
            showToast(`Sapling: ${getErrorMessage(error)}`, { type: 'error', duration: 3000 });
          } else {
            showToast(`Sapling: "${trimmedWord}" 已添加到记忆列表（翻译失败）`);
          }
        }
      }
    } catch (error) {
      console.error('[Sapling] Error processing word:', trimmedWord, error);

      // 如果是 API 相关错误，显示详细的错误信息
      if (isApiError(error)) {
        showToast(`Sapling: ${getErrorMessage(error)}`, { type: 'error', duration: 3000 });
      } else {
        showToast(`Sapling: "${trimmedWord}" 添加失败`);
      }
    }
  } else {
    showToast(`Sapling: "${trimmedWord}" 已在记忆列表中`);
  }
}

// ============ DOM 处理（使用 content-segmenter 服务） ============

function getPageSegments(viewportOnly = false): PageSegment[] {
  // margin 为视口高度的 30%，确保预加载足够的后续内容
  const margin = Math.max(300, Math.round(window.innerHeight * 0.3));
  return contentSegmenter.getPageSegments(document.body, { viewportOnly, margin }) as PageSegment[];
}

function getTextContent(element: Element): string {
  return contentSegmenter.getTextContent(element);
}

function getElementPath(element: Element): string {
  return contentSegmenter.getElementPath(element);
}

function generateFingerprint(text: string, path = ''): string {
  return contentSegmenter.generateFingerprint(text, path);
}

// ============ 文本替换（使用 text-replacer 服务） ============

function applyReplacements(element: Element, replacements: ReplacementItem[], options?: { scope?: ReplaceScope }): number {
  return textReplacer.applyReplacements(element, replacements, options);
}

function restoreOriginal(element: Element): void {
  return textReplacer.restoreOriginal(element);
}

function restoreAllMatchingOriginal(original: string): number {
  const normalized = String(original || '').trim().toLowerCase();
  if (!normalized) return 0;

  let restored = 0;
  document.querySelectorAll('.Sapling-translated').forEach((el) => {
    const dataOriginal = el.getAttribute('data-original') || '';
    if (dataOriginal.trim().toLowerCase() !== normalized) return;
    restoreOriginal(el);
    restored += 1;
  });

  return restored;
}

// ============ 语言队列管理 ============

/**
 * 将段落加入语言队列
 * @returns {Promise|null} 如果触发了批量发送，返回 Promise
 */
function enqueueSegment(segment: ValidSegment, langKey: string): Promise<QueueResult> | null {
  // 首先检查是否已被处理或正在处理中
  if (contentSegmenter.isProcessedOrPending(segment.fingerprint)) {
    return null;
  }

  if (!langBatchQueue.has(langKey)) {
    langBatchQueue.set(langKey, { segments: [], timer: null });
  }

  const queue = langBatchQueue.get(langKey);
  if (!queue) return null;

  // 检查队列中是否已存在（通过 fingerprint 去重）
  if (queue.segments.some(s => s.fingerprint === segment.fingerprint)) {
    return null;
  }

  queue.segments.push(segment);

  // 清除旧的 debounce 定时器
  if (queue.timer) {
    clearTimeout(queue.timer);
    queue.timer = null;
  }

  // 检查是否达到批量阈值
  const batchSize = config?.maxBatchSize || DEFAULT_LANG_BATCH_SIZE;
  if (queue.segments.length >= batchSize) {
    return flushLangQueue(langKey);
  } else {
    // 设置 debounce 定时器
    queue.timer = setTimeout(() => {
      flushLangQueue(langKey);
    }, LANG_DEBOUNCE_DELAY);
    return null;
  }
}

/**
 * 发送指定语言队列中的所有段落
 */
async function flushLangQueue(langKey: string): Promise<QueueResult> {
  const queue = langBatchQueue.get(langKey);
  if (!queue || queue.segments.length === 0) return { count: 0, error: false };

  // 取出所有段落并清空队列
  const segments = queue.segments.splice(0);
  if (queue.timer) {
    clearTimeout(queue.timer);
    queue.timer = null;
  }

  // 检查处理函数是否存在
  if (!queueProcessBatchFn) {
    return { count: 0, error: true };
  }

  // 检查 generation
  if (queueRunGeneration !== processingGeneration) {
    return { count: 0, error: false, aborted: true };
  }

  // 调用批量处理
  const result = await queueProcessBatchFn(segments);
  return result;
}

/**
 * 发送所有语言队列（页面处理结束时调用）
 */
async function flushAllLangQueues(): Promise<QueueResult[]> {
  const promises: Array<Promise<QueueResult>> = [];
  for (const [langKey] of langBatchQueue) {
    promises.push(flushLangQueue(langKey));
  }
  return Promise.all(promises);
}

/**
 * 清空所有语言队列（页面重置时调用）
 */
function clearAllLangQueues(): void {
  for (const [, queue] of langBatchQueue) {
    if (queue.timer) {
      clearTimeout(queue.timer);
    }
  }
  langBatchQueue.clear();
}

function restoreAll(): void {
  processingGeneration++;
  restoreGeneration++;  // 标记这是一次「还原」操作
  isPageActivated = false;  // 重置激活状态
  clearAllLangQueues();  // 清空语言队列
  document.querySelectorAll('.Sapling-processing').forEach(el => {
    el.classList.remove('Sapling-processing');
  });
  textReplacer.restoreAll();
  contentSegmenter.clearProcessed();
}

// ============ 翻译逻辑（调用 api-service） ============
async function translateText(text: string): Promise<{ immediate: ReplacementItem[]; async: Promise<ReplacementItem[]> | null }> {
  if (wordCache.size === 0) {
    await loadWordCache();
  }

  return await apiService.translateText(text, config, wordCache, updateStats, scheduleWordCacheSave) as {
    immediate: ReplacementItem[];
    async: Promise<ReplacementItem[]> | null;
  };
}

async function translateTexts(texts: BatchTranslateInput[]): Promise<BatchTranslateResult> {
  if (wordCache.size === 0) {
    await loadWordCache();
  }

  return await apiService.translateTexts(texts, config, wordCache, updateStats, scheduleWordCacheSave) as BatchTranslateResult;
}

async function translateSpecificWords(targetWords: string[]): Promise<ReplacementItem[]> {
  if (wordCache.size === 0) {
    await loadWordCache();
  }

  return await apiService.translateSpecificWords(targetWords, config, wordCache, updateStats, scheduleWordCacheSave) as ReplacementItem[];
}

async function processSpecificWords(targetWords: string[]): Promise<number> {
  if (!config?.enabled || !targetWords?.length) {
    return 0;
  }

  const targetWordSet = new Set(targetWords.map(w => w.toLowerCase()));
  let processed = 0;

  // 检查已翻译的元素
  const alreadyTranslated: string[] = [];
  document.querySelectorAll('.Sapling-translated').forEach((el) => {
    const original = el.getAttribute('data-original');
    if (original && targetWordSet.has(original.toLowerCase())) {
      alreadyTranslated.push(original.toLowerCase());
    }
  });

  // 查找包含目标单词的文本节点
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      // 跳过典型 UI 区域（导航/菜单/工具栏等），避免记忆词处理污染站点 UI
      try {
        if (parent.closest?.(
          'header,nav,aside,footer,' +
          '[role="navigation"],[role="banner"],[role="contentinfo"],[role="complementary"],' +
          '[role="menu"],[role="menubar"],[role="tablist"],[role="tab"],[role="toolbar"],[role="button"],' +
          'button,select,option,' +
          '.nav,.navbar,.nav-bar,.navigation,.menu,.menubar,.tabs,.tab,.tabbar,.dropdown,.filter,.breadcrumb,.pagination'
        )) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.tagName === 'LI' && parent.closest?.('nav,[role="navigation"],.nav,.navbar,.menu,.menubar,.tabs,.tabbar')) {
          return NodeFilter.FILTER_REJECT;
        }
        const cls = parent.className || '';
        if (typeof cls === 'string') {
          const lower = cls.toLowerCase();
          if (['nav', 'menu', 'tab', 'dropdown', 'filter', 'breadcrumb', 'pagination', 'toolbar', 'header'].some(sub => lower.includes(sub))) {
            return NodeFilter.FILTER_REJECT;
          }
        }
      } catch (e) { }

      if (SKIP_TAGS.includes(parent.tagName)) return NodeFilter.FILTER_REJECT;

      const classList = parent.classList;
      if (classList && SKIP_CLASSES.some(cls => cls !== 'Sapling-translated' && classList.contains(cls))) {
        return NodeFilter.FILTER_REJECT;
      }

      try {
        const style = window.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
      } catch (e) { }

      if (parent.isContentEditable && !isInAllowedContentEditableRegion(parent)) {
        return NodeFilter.FILTER_REJECT;
      }

      const text = (node.textContent ?? '').trim();
      if (text.length === 0) return NodeFilter.FILTER_REJECT;

      if (isCodeText(text)) return NodeFilter.FILTER_REJECT;

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent ?? '';
    const words = text.match(/\b[a-zA-Z]{5,}\b/g) || [];
    const chineseWords = text.match(/[\u4e00-\u9fff]{2,4}/g) || [];
    const allWords = [...words, ...chineseWords];

    const containsTarget = allWords.some(word => {
      const lowerWord = word.toLowerCase();
      return targetWordSet.has(lowerWord) && !alreadyTranslated.includes(lowerWord);
    });

    if (containsTarget) {
      textNodes.push(node);
    }
  }

  if (textNodes.length === 0) {
    return 0;
  }

  // 构造包含目标单词的文本段落
  const segments: Array<{ element: Element; text: string; fingerprint: string; isProcessed: boolean }> = [];
  for (const textNode of textNodes) {
    const container = textNode.parentElement;
    if (!container) continue;

    const containerText = getTextContent(container);

    let contextText = containerText;
    if (contextText.length < 30) {
      const grandParent = container.parentElement;
      if (grandParent) {
        contextText = getTextContent(grandParent);
      }
    }

    if (contextText.length >= 10) {
      const path = getElementPath(container);
      const fingerprint = generateFingerprint(contextText, path);

      const isProcessed = container.hasAttribute('data-Sapling-processed') ||
        container.closest('[data-Sapling-processed]');

      segments.push({
        element: container,
        text: contextText,
        fingerprint: fingerprint,
        isProcessed: !!isProcessed
      });
    }
  }

  // 去重
  const uniqueSegments = segments.filter((segment, index, self) =>
    index === self.findIndex(s => s.fingerprint === segment.fingerprint)
  );

  // 获取目标单词的翻译
  let translations: ReplacementItem[];
  try {
    translations = await translateSpecificWords(targetWords);
  } catch (e) {
    console.error('[Sapling] Error translating specific words:', e);

    // 如果是 API 相关错误，显示友好的提示
    if (isApiError(e)) {
      showToast(`Sapling: ${getErrorMessage(e)}`, { type: 'error', duration: 3000 });
    }

    return 0;
  }

  if (translations.length === 0) {
    return 0;
  }

  // 应用到每个段落
  for (const segment of uniqueSegments) {
    const replacements: ReplacementItem[] = translations.map((translation) => {
      const position = segment.text.toLowerCase().indexOf(translation.original.toLowerCase());
      return {
        original: translation.original,
        translation: translation.translation,
        phonetic: translation.phonetic,
        difficulty: translation.difficulty,
        partOfSpeech: translation.partOfSpeech || '',
        shortDefinition: translation.shortDefinition || '',
        position: position >= 0 ? position : 0
      };
    }).filter(r => r.position >= 0 || segment.text.toLowerCase().includes(r.original.toLowerCase()));

    if (replacements.length === 0) continue;

    const count = applyReplacements(segment.element, replacements);
    processed += count;
  }

  return processed;
}

async function processPage(viewportOnly = false): Promise<{ processed: number; skipped?: boolean; disabled?: boolean; blacklisted?: boolean; errors?: number }> {
  if (isProcessing) return { processed: 0, skipped: true };
  if (!config?.enabled) return { processed: 0, disabled: true };

  const hostname = window.location.hostname;
  if (isHostnameBlacklisted(hostname, config.blacklistNormalized || config.blacklist)) {
    // 保险：如果进入这里且已被替换过，先还原
    restoreAll();
    return { processed: 0, blacklisted: true };
  }

  if (wordCache.size === 0) {
    await loadWordCache();
  }

  const runGeneration = ++processingGeneration;
  isProcessing = true;
  let processed = 0, errors = 0;

  try {
    // 首先处理记忆列表中的单词
    const memorizeWords = (config.memorizeList || []).map(w => w.word).filter(w => w && w.trim());
    if (memorizeWords.length > 0 && !viewportOnly) {
      try {
        const memorizeCount = await processSpecificWords(memorizeWords);
        processed += memorizeCount;
      } catch (e) {
        console.error('[Sapling] Error processing memorize list:', e);

        // 显示错误提示
        if (isApiError(e)) {
          showToast(`Sapling: ${getErrorMessage(e)}`, { type: 'error', duration: 3000 });
        } else {
          showToast(`Sapling: 处理记忆列表时出错`, { type: 'error', duration: 3000 });
        }

        errors++;
      }
    }

    const segments = getPageSegments(viewportOnly);
    const whitelistWords = new Set((config.learnedWords || []).map(w => w.original.toLowerCase()));

    // 预处理：过滤有效的 segments 并检测语言
    const validSegments: ValidSegment[] = [];
    for (const segment of segments) {
      let text = segment.text;
      for (const word of whitelistWords) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        text = text.replace(regex, '');
      }
      if (text.trim().length >= 30) {
        // 检测语言并计算 langKey
        const sourceLang = await detectLanguage(text);
        const langKey = `${sourceLang}:${config.nativeLanguage}`;
        validSegments.push({ ...segment, filteredText: text, sourceLang, langKey });
      }
    }

    // 批量处理参数
    const MAX_CONCURRENT_BATCHES = normalizeConcurrencyLimit(config.concurrencyLimit);

    // 批量处理函数
    async function processBatch(batchSegments: ValidSegment[]): Promise<QueueResult> {
      // 捕获当前的 restoreGeneration，用于区分「还原」和「滚动」
      const runRestoreGen = restoreGeneration;

      // 标记所有段落为正在处理中
      batchSegments.forEach((seg) => contentSegmenter.markPending(seg.fingerprint));

      const batchInput: BatchTranslateInput[] = batchSegments.map((segment, idx) => ({
        text: segment.filteredText,
        paragraphIndex: idx
      }));

      try {
        const batchResult = await translateTexts(batchInput);

        if (runGeneration !== processingGeneration) {
          // 处理被中止，取消 pending 状态，允许重新处理
          batchSegments.forEach((seg) => {
            contentSegmenter.unmarkPending(seg.fingerprint);
            seg.element.classList.remove('Sapling-processing');
          });
          return { count: 0, error: false, aborted: true };
        }

        let totalCount = 0;

        // 处理每个段落的结果
        for (const { paragraphIndex, immediate, async: asyncPromise } of batchResult.results) {
          const segment = batchSegments[paragraphIndex];
          if (!segment) continue;

          const el = segment.element;

          // 先应用缓存结果（立即显示）
          let immediateCount = 0;
          if (immediate?.length) {
            const filtered = immediate.filter(r => !whitelistWords.has(r.original.toLowerCase()));
            immediateCount = applyReplacements(el, filtered, { scope: segment.scope });
          }

          totalCount += immediateCount;

          // 如果有异步结果，等待并更新
          if (asyncPromise) {
            // 只有在没有立即替换结果时，才显示"处理中"高亮
            if (immediateCount === 0) {
              el.classList.add('Sapling-processing');
            } else {
              el.classList.remove('Sapling-processing');
            }

            asyncPromise.then(async (asyncReplacements: ReplacementItem[]) => {
              try {
                // 如果元素已被移除，标记为已处理
                if (!el.isConnected) {
                  contentSegmenter.markProcessed(segment.fingerprint);
                  return;
                }

                // 如果是「还原」操作，丢弃结果并标记为已处理
                if (runRestoreGen !== restoreGeneration) {
                  contentSegmenter.markProcessed(segment.fingerprint);
                  return;
                }

                if (asyncReplacements?.length) {
                  // 获取已替换的词汇，避免重复
                  const alreadyReplaced = new Set<string>();
                  el.querySelectorAll('.Sapling-translated').forEach((transEl) => {
                    const original = transEl.getAttribute('data-original');
                    if (original) {
                      alreadyReplaced.add(original.toLowerCase());
                    }
                  });

                  const filtered = asyncReplacements.filter((r) =>
                    !whitelistWords.has(r.original.toLowerCase()) &&
                    !alreadyReplaced.has(r.original.toLowerCase())
                  );

                  if (filtered.length > 0) {
                    applyReplacements(el, filtered, { scope: segment.scope });
                  }
                }

                // 处理完成：无论 generation 是否变化，工作已完成，标记为已处理
                contentSegmenter.markProcessed(segment.fingerprint);
              } finally {
                el.classList.remove('Sapling-processing');
              }
            }).catch((error: unknown) => {
              // 出错时也标记为已处理，避免重复尝试
              contentSegmenter.markProcessed(segment.fingerprint);
              console.error('[Sapling] Async translation error:', error);
              el.classList.remove('Sapling-processing');

              // 显示错误提示
              if (isApiError(error) && !window.__saplingApiErrorShown) {
                window.__saplingApiErrorShown = true;
                showToast(`Sapling: ${getErrorMessage(error)}`, { type: 'error', duration: 3000 });
                setTimeout(() => {
                  window.__saplingApiErrorShown = false;
                }, 5000);
              }
            });
          } else {
            // 没有异步结果（只有缓存或无结果），立即标记为已处理
            contentSegmenter.markProcessed(segment.fingerprint);
            el.classList.remove('Sapling-processing');
          }
        }

        return { count: totalCount, error: false };
      } catch (e) {
        console.error('[Sapling] Batch error:', e);
        // 出错时也标记所有段落为已处理，避免重复尝试
        batchSegments.forEach((seg) => {
          contentSegmenter.markProcessed(seg.fingerprint);
          seg.element.classList.remove('Sapling-processing');
        });

        // 如果是 API 相关错误，显示友好的提示
        if (isApiError(e) && !window.__saplingApiErrorShown) {
          window.__saplingApiErrorShown = true;
          showToast(`Sapling: ${getErrorMessage(e)}`, { type: 'error', duration: 3000 });
          setTimeout(() => {
            window.__saplingApiErrorShown = false;
          }, 5000);
        }

        return { count: 0, error: true };
      }
    }

    // 设置队列处理函数引用
    queueProcessBatchFn = processBatch;
    queueRunGeneration = runGeneration;

    // 使用语言队列批量处理
    const batchPromises: Array<Promise<QueueResult>> = [];

    for (const segment of validSegments) {
      if (runGeneration !== processingGeneration) break;

      // 将段落加入语言队列
      const promise = enqueueSegment(segment, segment.langKey);
      if (promise) {
        batchPromises.push(promise);
      }

      // 控制并发：当累积的 Promise 达到并发上限时，等待它们完成
      if (batchPromises.length >= MAX_CONCURRENT_BATCHES) {
        const results = await Promise.all(batchPromises.splice(0));
        for (const result of results) {
          processed += result.count;
          if (result.error) errors++;
        }
      }
    }

    // 发送所有剩余队列（无论 viewportOnly 与否，都统一 flush）
    const finalResults = await flushAllLangQueues();
    for (const result of finalResults) {
      processed += result.count;
      if (result.error) errors++;
    }

    // 等待剩余的 Promise
    if (batchPromises.length > 0) {
      const results = await Promise.all(batchPromises);
      for (const result of results) {
        processed += result.count;
        if (result.error) errors++;
      }
    }

    return { processed, errors };
  } finally {
    isProcessing = false;
    clearAllLangQueues();  // 清理所有队列和定时器，防止跨调用污染
  }
}

// ============ 事件处理 ============
function setupEventListeners(): void {
  console.log('[Sapling] setupEventListeners() started');
  // 悬停显示提示
  document.addEventListener('mouseover', (e: MouseEvent) => {
    const targetEl = e.target instanceof Element ? e.target : null;
    if (!targetEl) return;

    const target = targetEl.closest('.Sapling-translated');
    if (target) {
      tooltipManager.show(target);
    }
    if (targetEl.closest('.Sapling-tooltip')) {
      tooltipManager.cancelHide();
    }
  });

  document.addEventListener('mouseout', (e: MouseEvent) => {
    const targetEl = e.target instanceof Element ? e.target : null;
    const relatedEl = e.relatedTarget instanceof Element ? e.relatedTarget : null;
    if (!targetEl) return;

    const target = targetEl.closest('.Sapling-translated');

    if (target &&
      !relatedEl?.closest('.Sapling-translated') &&
      !relatedEl?.closest('.Sapling-tooltip')) {
      tooltipManager.hide();
    }
  });

  document.addEventListener('mouseout', (e: MouseEvent) => {
    const targetEl = e.target instanceof Element ? e.target : null;
    const relatedEl = e.relatedTarget instanceof Element ? e.relatedTarget : null;
    if (!targetEl) return;

    if (targetEl.closest('.Sapling-tooltip') &&
      !relatedEl?.closest('.Sapling-tooltip') &&
      !relatedEl?.closest('.Sapling-translated')) {
      tooltipManager.hide();
    }
  });

  // 处理 tooltip 按钮点击事件
  document.addEventListener('click', async (e: MouseEvent) => {
    if (e.button !== 0) return;

    const targetEl = e.target instanceof Element ? e.target : null;
    if (!targetEl) return;

    const actionBtn = targetEl.closest('button[data-action]');
    const currentElement = tooltipManager.getCurrentElement();

    if (actionBtn && currentElement && actionBtn.closest('.Sapling-tooltip')) {
      e.preventDefault();
      e.stopPropagation();

      const action = actionBtn.getAttribute('data-action');
      const original = currentElement.getAttribute('data-original') || '';
      const translation = currentElement.getAttribute('data-translation') || '';
      const difficulty = currentElement.getAttribute('data-difficulty') || 'B1';

      if (!original) return;

      switch (action) {
        case 'speak':
          await tooltipManager.playAudio(currentElement);
          break;
        case 'memorize':
          await addToMemorizeList(original);
          showToast(`Sapling: "${original}" 已添加到记忆列表`);
          break;
        case 'learned':
          if (!translation) return;
          await addToWhitelist(original, translation, difficulty);
          if (config?.restoreAllSameWordsOnLearned ?? true) {
            restoreAllMatchingOriginal(original);
          } else {
            restoreOriginal(currentElement);
          }
          tooltipManager.hide(true);
          showToast(`Sapling: "${original}" 已标记为已学会`);
          break;
      }

      return;
    }

    // 左键点击被替换的单词：直接发音（无需点击 tooltip 的发音按钮）
    if (config?.allowLeftClickPronunciation === false) return;
    const clickedWord = targetEl.closest('.Sapling-translated');
    if (!clickedWord) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    // 避免干扰页面交互元素（链接/表单控件等）
    if (clickedWord.closest('a[href], button, input, textarea, select, label, summary')) return;

    await tooltipManager.playAudio(clickedWord);
  });

  // 滚动处理
  const handleScroll = debounce(() => {
    if (isHostnameBlacklisted(window.location.hostname, config?.blacklistNormalized ?? config?.blacklist ?? [])) return;
    // 当页面已激活（手动触发过）或开启了自动处理时，滚动继续处理
    if ((isPageActivated || config?.autoProcess) && config?.enabled) {
      const viewportOnly = !(config.processFullPage ?? false);
      void processPage(viewportOnly);
    }
  }, 500);
  window.addEventListener('scroll', handleScroll, { passive: true });

  // 监听配置变化
  type StorageChange = { oldValue?: unknown; newValue?: unknown };
  type StorageChanges = Record<string, StorageChange>;

  storage.addChangeListener((changes: StorageChanges, areaName: 'sync' | 'local') => {
    if (areaName === 'sync') {
      // 统计字段变更不需要重载配置
      const statsKeys = ['totalWords', 'todayWords', 'lastResetDate', 'cacheHits', 'cacheMisses'];
      const changedKeys = Object.keys(changes);
      const isOnlyStatsChange = changedKeys.every(key => statsKeys.includes(key));

      if (isOnlyStatsChange) {
        return; // 跳过配置重载
      }

      loadConfig().then(async () => {
        if (!config) return;
        // 检查是否在黑名单中（动态变更）
        const hostname = window.location.hostname;
        if (isHostnameBlacklisted(hostname, config.blacklistNormalized || config.blacklist)) {
          console.log('[Sapling] Site added to blacklist, restoring original content.');
          restoreAll();
          return;
        }

        if (changes.enabled?.newValue === false) {
          restoreAll();
        }
        if (changes.difficultyLevel || changes.intensity || changes.translationStyle || changes.processFullPage) {
          restoreAll();
          if (config.enabled) {
            const viewportOnly = !config.processFullPage;
            void processPage(viewportOnly);
          }
        }
        if (changes.cacheMaxSize) {
          const maxSize = normalizeCacheMaxSize(changes.cacheMaxSize.newValue, CACHE_CONFIG.maxSize);
          if (wordCache.size === 0) await loadWordCache();
          while (wordCache.size > maxSize) {
            const firstKey = wordCache.keys().next().value;
            if (firstKey == null) break;
            wordCache.delete(firstKey);
          }
          await saveWordCache();
        }
        if (changes.memorizeList) {
          const oldList = normalizeMemorizeList(changes.memorizeList.oldValue);
          const newList = normalizeMemorizeList(changes.memorizeList.newValue);
          const oldWords = new Set(oldList.map(w => w.word.toLowerCase()));
          const newWords = newList
            .filter(w => !oldWords.has(w.word.toLowerCase()))
            .map(w => w.word);

          if (newWords.length > 0 && config.enabled) {
            setTimeout(() => {
              void processSpecificWords(newWords);
            }, 200);
          }
        }
      });
    }

    // 本地缓存变化（例如：从 options 页清空缓存/重置所有数据）
    if (areaName === 'local') {
      if (wordCacheClearInFlight) return;
      const cacheChange = changes?.[WORD_CACHE_STORAGE_KEY];
      if (!cacheChange) return;

      const next = cacheChange.newValue;
      if (next == null || (Array.isArray(next) && next.length === 0)) {
        void clearWordCache({ removeStorage: true });
      }
    }
  });

  // 监听来自 popup/background 的消息
  chrome.runtime.onMessage.addListener((message: ContentRequest, sender, sendResponse: (response: unknown) => void) => {
    console.log('[Sapling] Received message:', message);
    if (message.action === 'processPage') {
      if (isHostnameBlacklisted(window.location.hostname, config?.blacklistNormalized ?? config?.blacklist ?? [])) {
        console.log('[Sapling] Ignoring processPage request for blacklisted site');
        sendResponse({ processed: 0, blacklisted: true } satisfies ProcessPageResponse);
        return true;
      }
      isPageActivated = true;  // 激活页面处理，滚动时继续处理
      const viewportOnly = !(config?.processFullPage ?? false);
      processPage(viewportOnly).then((result) => sendResponse(result satisfies ProcessPageResponse));
      return true;
    }
    if (message.action === 'restorePage') {
      restoreAll();
      sendResponse({ success: true } satisfies RestorePageResponse);
    }
    if (message.action === 'processSpecificWords') {
      const words = Array.isArray(message.words) ? message.words.filter((w): w is string => typeof w === 'string') : [];
      if (words.length > 0) {
        processSpecificWords(words).then(count => {
          sendResponse({ success: true, count } satisfies ProcessSpecificWordsResponse);
        }).catch(error => {
          console.error('[Sapling] Error processing specific words:', error);

          // 显示错误提示
          if (isApiError(error)) {
            showToast(`Sapling: ${getErrorMessage(error)}`, { type: 'error', duration: 3000 });
          } else {
            showToast(`Sapling: 处理单词时出错 - ${getErrorMessage(error)}`, { type: 'error', duration: 3000 });
          }

          sendResponse({ success: false, error: getErrorMessage(error) } satisfies ProcessSpecificWordsResponse);
        });
        return true;
      } else {
        sendResponse({ success: false, error: 'No words provided' } satisfies ProcessSpecificWordsResponse);
      }
    }
    if (message.action === 'getStatus') {
      const hasTranslations = !!document.querySelector('.Sapling-translated');
      const hasProcessedMarkers = !!document.querySelector('[data-Sapling-processed]');
      sendResponse({
        processed: contentSegmenter.getProcessedCount(),
        hasTranslations,
        hasProcessedMarkers,
        isProcessing,
        enabled: config?.enabled
      } satisfies GetStatusResponse);
    }
    if (message.action === 'clearCache' || message.action === 'resetAllData') {
      clearWordCache({ removeStorage: true })
        .then(() => sendResponse({ success: true } satisfies ClearCacheOrResetAllResponse))
        .catch((error) => {
          console.error('[Sapling] Error clearing cache:', error);
          showToast(`Sapling: 清空缓存失败 - ${getErrorMessage(error)}`, { type: 'error', duration: 3000 });
          sendResponse({ success: false, message: getErrorMessage(error) } satisfies ClearCacheOrResetAllResponse);
        });
      return true;
    }
  });
}

function debounce<TArgs extends unknown[]>(func: (...args: TArgs) => void, wait: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: TArgs) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// ============ 初始化 ============
async function init(): Promise<void> {
  console.log('[Sapling] init() started');
  try {
    const loadedConfig = await loadConfig();
    console.log('[Sapling] loadConfig() completed', loadedConfig);
  } catch (e) {
    console.error('[Sapling] loadConfig() failed', e);
    return;
  }

  const hostname = window.location.hostname;
  if (isHostnameBlacklisted(hostname, config?.blacklistNormalized ?? config?.blacklist ?? [])) {
    // 如果之前已经被替换过，确保还原
    restoreAll();
    console.log('[Sapling] Current site is blacklisted, stopping initialization.');
    return;
  }

  await loadWordCache();
  await initLanguageDetector();

  tooltipManager.createTooltip();
  setupEventListeners();
  console.log('[Sapling] setupEventListeners() completed');

  // Best-effort flush pending cache writes when leaving the page.
  window.addEventListener('beforeunload', () => {
    void flushWordCacheSave();
  }, { capture: true });

  if (config?.autoProcess && config.enabled && config.apiKey) {
    isPageActivated = true;  // 自动处理时也激活状态
    const viewportOnly = !config.processFullPage;
    setTimeout(() => void processPage(viewportOnly), 1000);
  }
}

// ============ WXT Content Script Entry Point ============
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',  // 强制将CSS添加到manifest
  registration: 'manifest',      // 确保注册到manifest.json而非动态注册

  main() {
    console.log('[Sapling] defineContentScript main() executed');
    void init();
  }
});
