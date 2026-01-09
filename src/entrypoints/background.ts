/**
 * Sapling Background Script (WXT Version)
 * 处理扩展级别的事件和消息
 */

import { CACHE_CONFIG, DEFAULT_THEME, normalizeCacheMaxSize } from '~/core/config';
import { storage } from '~/core/storage/StorageService';
import type {
    BackgroundRequest,
    ContentRequestFor,
    ContentResponseFor,
    FetchAudioDataResponse,
    GetCacheStatsResponse,
    GetStatsResponse,
    RefreshTogglePageMenuTitleResponse,
    SimpleSuccessResponse,
    TestApiResponse,
    TogglePageProcessingResponse
} from '~/types/messages';

const MENU_ID_ADD_MEMORIZE = 'Sapling-add-memorize';
const MENU_ID_TOGGLE_PAGE = 'Sapling-process-page';

function isPageProcessed(status: ContentResponseFor<'getStatus'> | null) {
    if (!status) return false;
    return Boolean(
        status.hasTranslations ||
        status.hasProcessedMarkers ||
        (Number(status.processed) || 0) > 0
    );
}

function getTogglePageMenuTitle(processed) {
    return processed ? '还原当前页面' : '处理当前页面';
}

async function getTabStatus(tabId: number) {
    if (!tabId) return null;
    try {
        return await browser.tabs.sendMessage(tabId, { action: 'getStatus' } satisfies ContentRequestFor<'getStatus'>) as ContentResponseFor<'getStatus'>;
    } catch {
        return null;
    }
}

function updateTogglePageMenuTitle(tabId, processed) {
    browser.contextMenus.update(
        MENU_ID_TOGGLE_PAGE,
        { title: getTogglePageMenuTitle(processed) },
        () => {
            browser.contextMenus.refresh?.();
        }
    );
}

async function refreshTogglePageMenuTitle(tabId) {
    const status = await getTabStatus(tabId);
    updateTogglePageMenuTitle(tabId, isPageProcessed(status));
}

async function togglePageProcessing(tabId) {
    const status = await getTabStatus(tabId);
    const processed = isPageProcessed(status);
    const action = processed ? 'restorePage' : 'processPage';
    let ok = true;
    try {
        await browser.tabs.sendMessage(tabId, { action });
    } catch {
        ok = false;
    }

    updateTogglePageMenuTitle(tabId, ok ? !processed : false);
    return { success: ok, processedBefore: processed, processedAfter: ok ? !processed : processed };
}

// 创建右键菜单
function createContextMenus() {
    browser.contextMenus.removeAll(() => {
        browser.contextMenus.create({
            id: MENU_ID_ADD_MEMORIZE,
            title: '添加到需记忆列表',
            contexts: ['selection']
        });

        browser.contextMenus.create({
            id: MENU_ID_TOGGLE_PAGE,
            title: getTogglePageMenuTitle(false),
            contexts: ['page']
        });
    });
}

// ArrayBuffer 转 Base64
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// 测试 API 连接
async function testApiConnection(endpoint, apiKey, model) {
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: 'Say OK' }],
                max_tokens: 10
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.choices && data.choices[0]) {
            return { success: true, message: '连接成功！' };
        }

        throw new Error('Invalid response');
    } catch (error) {
        return { success: false, message: error.message };
    }
}

export default defineBackground(() => {
    // 安装/更新时初始化
    browser.runtime.onInstalled.addListener(async (details) => {
        console.log('[Sapling] Extension installed/updated:', details.reason);

        // 设置默认配置
        if (details.reason === 'install') {
            // sync 存储：配置项（避免存储大数组以防超过 100KB 配额）
            storage.remote.set({
                apiEndpoint: 'https://api.deepseek.com/chat/completions',
                apiKey: '',
                modelName: 'deepseek-chat',
                nativeLanguage: 'zh-CN',
                targetLanguage: 'en',
                difficultyLevel: 'B1',
                intensity: 'medium',
                autoProcess: false,
                showPhonetic: true,
                allowLeftClickPronunciation: true,
                restoreAllSameWordsOnLearned: true,
                pronunciationProvider: 'wiktionary',
                youdaoPronunciationType: 2,
                translationStyle: 'original-translation',
                enabled: true,
                blacklist: [],
                whitelist: [],
                cacheMaxSize: CACHE_CONFIG.maxSize,
                theme: { ...DEFAULT_THEME },
                totalWords: 0,
                todayWords: 0,
                lastResetDate: new Date().toISOString().split('T')[0],
                cacheHits: 0,
                cacheMisses: 0,
                vocabTestCompleted: false
            }, () => { });

            // local 存储：词汇列表（可能很大，避免 sync 配额限制）
            storage.local.set({
                learnedWords: [],
                memorizeList: []
            }, () => { });

            // 打开词汇量测试页面
            browser.tabs.create({
                url: browser.runtime.getURL('vocab-test.html')
            });
        } else {
            storage.remote.get('cacheMaxSize', (result) => {
                if (result.cacheMaxSize == null) storage.remote.set({ cacheMaxSize: CACHE_CONFIG.maxSize }, () => { });
            });
        }

        // 创建右键菜单
        createContextMenus();
    });

    // 右键菜单显示时更新标题（仅部分浏览器支持）
    if (browser.contextMenus?.onShown?.addListener) {
        browser.contextMenus.onShown.addListener((info, tab) => {
            if (!tab?.id) return;
            if (!info?.contexts?.includes?.('page')) return;
            refreshTogglePageMenuTitle(tab.id);
        });
    }

    // 右键菜单点击处理
    browser.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId === MENU_ID_ADD_MEMORIZE && info.selectionText) {
            const word = info.selectionText.trim();
            if (word && word.length < 50) {
                storage.local.get('memorizeList', (result) => {
                    const list = result.memorizeList || [];
                    if (!list.some(w => w.word === word)) {
                        list.push({ word, addedAt: Date.now() });
                        storage.local.set({ memorizeList: list }, () => {
                            // 通知 content script 处理特定单词
                            browser.tabs.sendMessage(tab.id, {
                                action: 'processSpecificWords',
                                words: [word]
                            }).catch(err => {
                                console.log('[Sapling] Content script not ready, word will be processed on next page load');
                            });
                        });
                    }
                });
            }
        }

        if (info.menuItemId === MENU_ID_TOGGLE_PAGE && tab?.id) {
            togglePageProcessing(tab.id).catch(() => { });
        }
    });

    // 快捷键处理
    browser.commands.onCommand.addListener((command, tab) => {
        if (command === 'toggle-translation') {
            if (tab?.id) {
                togglePageProcessing(tab.id).catch(() => { });
            }
        }
    });

    // 消息处理
    browser.runtime.onMessage.addListener((message: BackgroundRequest, sender, sendResponse: (response: unknown) => void) => {
        // 代理 fetch 音频数据（绕过页面 CSP 限制）
        if (message.action === 'fetchAudioData') {
            (async () => {
                try {
                    const { url } = message;
                    if (!url) {
                        sendResponse({ success: false, message: 'No URL provided' } satisfies FetchAudioDataResponse);
                        return;
                    }

                    const response = await fetch(url);
                    if (!response.ok) {
                        sendResponse({ success: false, message: `HTTP ${response.status}` } satisfies FetchAudioDataResponse);
                        return;
                    }

                    const arrayBuffer = await response.arrayBuffer();
                    const base64 = arrayBufferToBase64(arrayBuffer);
                    const contentType = response.headers.get('content-type') || 'audio/mpeg';
                    sendResponse({ success: true, data: base64, contentType } satisfies FetchAudioDataResponse);
                } catch (error) {
                    sendResponse({ success: false, message: (error as Error | null)?.message || String(error) } satisfies FetchAudioDataResponse);
                }
            })();
            return true;
        }

        if (message?.action === 'togglePageProcessing') {
            (async () => {
                const tabId = message.tabId;
                if (!tabId) return sendResponse({ success: false, message: 'No tabId provided' } satisfies TogglePageProcessingResponse);
                const result = await togglePageProcessing(tabId);
                sendResponse(result as TogglePageProcessingResponse);
            })();
            return true;
        }

        if (message?.action === 'refreshTogglePageMenuTitle') {
            (async () => {
                const tabId = message.tabId;
                if (!tabId) return sendResponse({ success: false, message: 'No tabId provided' } satisfies RefreshTogglePageMenuTitleResponse);
                await refreshTogglePageMenuTitle(tabId);
                sendResponse({ success: true } satisfies RefreshTogglePageMenuTitleResponse);
            })();
            return true;
        }

        // 测试 API 连接
        if (message.action === 'testApi') {
            testApiConnection(message.endpoint, message.apiKey, message.model)
                .then((result) => sendResponse(result satisfies TestApiResponse))
                .catch((error) => sendResponse({ success: false, message: (error as Error).message } satisfies TestApiResponse));
            return true;
        }

        // 获取统计数据
        if (message.action === 'getStats') {
            storage.remote.get([
                'totalWords', 'todayWords', 'lastResetDate',
                'cacheHits', 'cacheMisses'
            ], (syncResult) => {
                // 检查是否需要重置今日统计
                const today = new Date().toISOString().split('T')[0];
                if (syncResult.lastResetDate !== today) {
                    syncResult.todayWords = 0;
                    syncResult.lastResetDate = today;
                    storage.remote.set({ todayWords: 0, lastResetDate: today }, () => { });
                }

                // 从 local 获取词汇列表
                storage.local.get(['learnedWords', 'memorizeList'], (localResult) => {
                    sendResponse({
                        totalWords: syncResult.totalWords || 0,
                        todayWords: syncResult.todayWords || 0,
                        learnedCount: (localResult.learnedWords || []).length,
                        memorizeCount: (localResult.memorizeList || []).length,
                        cacheHits: syncResult.cacheHits || 0,
                        cacheMisses: syncResult.cacheMisses || 0
                    } satisfies GetStatsResponse);
                });
            });
            return true;
        }

        // 获取缓存统计
        if (message.action === 'getCacheStats') {
            storage.local.get('Sapling_word_cache', (result) => {
                const cache = result.Sapling_word_cache || [];
                storage.remote.get('cacheMaxSize', (cfg) => {
                    const maxSize = normalizeCacheMaxSize(cfg.cacheMaxSize, CACHE_CONFIG.maxSize);
                    sendResponse({
                        size: cache.length,
                        maxSize
                    } satisfies GetCacheStatsResponse);
                });
            });
            return true;
        }

        // 清空缓存
        if (message.action === 'clearCache') {
            storage.local.remove('Sapling_word_cache', () => {
                storage.remote.set({ cacheHits: 0, cacheMisses: 0 }, () => {
                    sendResponse({ success: true } satisfies SimpleSuccessResponse);
                });
            });
            return true;
        }

        // 清空已学会词汇（使用 local 存储）
        if (message.action === 'clearLearnedWords') {
            storage.local.set({ learnedWords: [] }, () => {
                sendResponse({ success: true } satisfies SimpleSuccessResponse);
            });
            return true;
        }

        // 清空需记忆列表（使用 local 存储）
        if (message.action === 'clearMemorizeList') {
            storage.local.set({ memorizeList: [] }, () => {
                sendResponse({ success: true } satisfies SimpleSuccessResponse);
            });
            return true;
        }
    });

    // 标签页更新时检查是否需要注入脚本
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
            // 可以在这里做额外的初始化
        }

        // Keep context menu title in sync with the active tab
        if (!tab?.active) return;
        if (changeInfo.status === 'loading') {
            updateTogglePageMenuTitle(tabId, false);
        }
        if (changeInfo.status === 'complete') {
            refreshTogglePageMenuTitle(tabId);
        }
    });

    // 标签页激活时更新菜单
    browser.tabs.onActivated.addListener((activeInfo) => {
        if (!activeInfo?.tabId) return;
        refreshTogglePageMenuTitle(activeInfo.tabId);
    });

    console.log('[Sapling] Background script loaded');
});
