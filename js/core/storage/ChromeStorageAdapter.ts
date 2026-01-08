/**
 * Chrome Storage API 适配器
 * 封装 chrome.storage.sync 或 chrome.storage.local
 */
import type { IStorageAdapter, StorageAdapter, StorageChangeCallback, StorageGetCallback, StorageGetKeys } from './IStorageAdapter';

export class ChromeStorageAdapter implements StorageAdapter {
  private readonly storageArea: chrome.storage.StorageArea;
  private readonly area: 'sync' | 'local';

  /**
   * @param area - 存储区域: 'sync' 或 'local'
   */
  constructor(area: 'sync' | 'local') {
    this.area = area;
    this.storageArea = chrome.storage[area];
  }

  get(keys: StorageGetKeys, callback: StorageGetCallback): void {
    this.storageArea.get(keys, callback);
  }

  set(items: Record<string, unknown>, callback: () => void): void {
    this.storageArea.set(items, callback);
  }

  remove(keys: string | string[], callback: () => void): void {
    this.storageArea.remove(keys, callback);
  }

  onChanged(callback: StorageChangeCallback): () => void {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === this.area) {
        callback(changes);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
}

export type { IStorageAdapter };
