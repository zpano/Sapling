/**
 * Storage Namespace
 * 提供低级存储 API，支持回调和 Promise 风格
 */
import type { StorageAdapter, StorageGetKeys } from './IStorageAdapter';

export class StorageNamespace<T extends Record<string, unknown> = Record<string, unknown>> {
  private readonly adapter: StorageAdapter;
  private readonly shouldMergeDefaults: boolean;
  private readonly defaultConfig: T | null;

  constructor(adapter: StorageAdapter, shouldMergeDefaults = false, defaultConfig: T | null = null) {
    this.adapter = adapter;
    this.shouldMergeDefaults = shouldMergeDefaults;
    this.defaultConfig = defaultConfig;
  }

  get(keys: StorageGetKeys, callback: (result: Record<string, unknown>) => void): void {
    this.adapter.get(keys, (result) => {
      if (!this.shouldMergeDefaults || !this.defaultConfig) {
        callback(result);
        return;
      }

      if (keys === null) {
        callback({ ...this.defaultConfig, ...result });
      } else if (typeof keys === 'string') {
        callback({ [keys]: (result as Record<string, unknown>)[keys] ?? (this.defaultConfig as Record<string, unknown>)[keys] });
      } else {
        const merged: Record<string, unknown> = {};
        keys.forEach((key) => {
          merged[key] = (result as Record<string, unknown>)[key] ?? (this.defaultConfig as Record<string, unknown>)[key];
        });
        callback(merged);
      }
    });
  }

  set(items: Record<string, unknown>, callback: () => void): void {
    this.adapter.set(items, callback);
  }

  remove(keys: string | string[], callback: () => void): void {
    this.adapter.remove(keys, callback);
  }

  onChanged(callback: (changes: Record<string, chrome.storage.StorageChange>) => void): () => void {
    return this.adapter.onChanged(callback);
  }

  getAsync(keys: StorageGetKeys = null): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      this.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
  }

  setAsync(items: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.set(items, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  removeAsync(keys: string | string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.remove(keys, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }
}
