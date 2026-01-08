/**
 * Sapling Storage Service (TypeScript)
 * 高级存储门面，提供领域特定方法
 */
import { DEFAULT_CONFIG, type SaplingConfig } from '../config';
import { ChromeStorageAdapter } from './ChromeStorageAdapter';
import { StorageNamespace } from './StorageNamespace';

interface WhitelistEntry {
  original?: string;
  word: string;
  addedAt: number;
}

interface MemorizeEntry {
  word: string;
  addedAt: number;
}

class StorageService {
  readonly remote: StorageNamespace<SaplingConfig>;
  readonly local: StorageNamespace<Record<string, unknown>>;

  constructor() {
    const remoteAdapter = new ChromeStorageAdapter('sync');
    const localAdapter = new ChromeStorageAdapter('local');

    this.remote = new StorageNamespace<SaplingConfig>(remoteAdapter, true, DEFAULT_CONFIG);
    this.local = new StorageNamespace<Record<string, unknown>>(localAdapter, false, null);
  }

  async get(keys: string | string[] | null = null): Promise<Record<string, unknown>> {
    return this.remote.getAsync(keys);
  }

  async set(items: Record<string, unknown>): Promise<void> {
    return this.remote.setAsync(items);
  }

  async getLocal(keys: string | string[] | null = null): Promise<Record<string, unknown>> {
    return this.local.getAsync(keys);
  }

  async setLocal(items: Record<string, unknown>): Promise<void> {
    return this.local.setAsync(items);
  }

  async removeLocal(keys: string | string[]): Promise<void> {
    return this.local.removeAsync(keys);
  }

  async getConfig(): Promise<Record<string, unknown>> {
    return this.get(null);
  }

  async updateStats(stats: Partial<{ newWords: number; cacheHits: number; cacheMisses: number }>): Promise<Record<string, number | string>> {
    const current = await this.get(['totalWords', 'todayWords', 'lastResetDate', 'cacheHits', 'cacheMisses']);
    const today = new Date().toISOString().split('T')[0];

    if (current.lastResetDate !== today) {
      current.todayWords = 0;
      current.lastResetDate = today;
    }

    const updated = {
      totalWords: Number(current.totalWords || 0) + (stats.newWords || 0),
      todayWords: Number(current.todayWords || 0) + (stats.newWords || 0),
      lastResetDate: today,
      cacheHits: Number(current.cacheHits || 0) + (stats.cacheHits || 0),
      cacheMisses: Number(current.cacheMisses || 0) + (stats.cacheMisses || 0),
    };

    await this.set(updated);
    return updated;
  }

  async getWhitelist(): Promise<WhitelistEntry[]> {
    const result = await this.getLocal('learnedWords');
    return (result.learnedWords as WhitelistEntry[] | undefined) || [];
  }

  async addToWhitelist(word: { original: string; word: string; addedAt?: number }): Promise<void> {
    const whitelist = await this.getWhitelist();
    const exists = whitelist.some((w) => w.original === word.original || w.word === word.word);
    if (!exists) {
      whitelist.push({
        original: word.original,
        word: word.word,
        addedAt: word.addedAt ?? Date.now(),
      });
      await this.setLocal({ learnedWords: whitelist });
    }
  }

  async removeFromWhitelist(word: string): Promise<void> {
    const whitelist = await this.getWhitelist();
    const filtered = whitelist.filter((w) => w.original !== word && w.word !== word);
    await this.setLocal({ learnedWords: filtered });
  }

  async getMemorizeList(): Promise<MemorizeEntry[]> {
    const result = await this.getLocal('memorizeList');
    return (result.memorizeList as MemorizeEntry[] | undefined) || [];
  }

  async addToMemorizeList(word: string): Promise<void> {
    const list = await this.getMemorizeList();
    const exists = list.some((w) => w.word === word);
    if (!exists) {
      list.push({ word, addedAt: Date.now() });
      await this.setLocal({ memorizeList: list });
    }
  }

  async removeFromMemorizeList(word: string): Promise<void> {
    const list = await this.getMemorizeList();
    const filtered = list.filter((w) => w.word !== word);
    await this.setLocal({ memorizeList: filtered });
  }

  async isBlacklisted(hostname: string): Promise<boolean> {
    const { blacklist } = (await this.get('blacklist')) as { blacklist?: string[] };
    return (blacklist || []).some((domain) => hostname.includes(domain));
  }

  async isWhitelisted(hostname: string): Promise<boolean> {
    const { whitelist } = (await this.get('whitelist')) as { whitelist?: string[] };
    return (whitelist || []).some((domain) => hostname.includes(domain));
  }

  addChangeListener(callback: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void): () => void {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'sync' || areaName === 'local') {
        callback(changes, areaName);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
}

export const storage = new StorageService();
export default storage;
