/**
 * Chrome Storage API 适配器
 * 封装 chrome.storage.sync 或 chrome.storage.local
 */
import { IStorageAdapter } from '~/core/storage/IStorageAdapter';
import type { GetResult, Keys, StorageChanges } from '~/types/storage';
import type { SaplingStorageArea } from '~/types/storage';

export class ChromeStorageAdapter<T extends Record<string, unknown>> extends IStorageAdapter<T> {
  private area: SaplingStorageArea;
  private storageArea: ChromeStorageArea;

  /**
   * @param {string} area - 存储区域: 'sync' 或 'local'
   */
  constructor(area: SaplingStorageArea) {
    super();
    this.area = area;
    this.storageArea = chrome.storage[area];
  }

  /**
   * 从 Chrome 存储获取数据
   * @param {string|string[]|null} keys - 要获取的键
   * @param {function(object): void} callback - 结果回调
   */
  get<K extends Keys<T>>(keys: K, callback: (result: GetResult<T, K>) => void) {
    this.storageArea.get(keys as unknown, (items) => {
      callback(items as unknown as GetResult<T, K>);
    });
  }

  /**
   * 设置 Chrome 存储数据
   * @param {object} items - 键值对
   * @param {function(): void} callback - 完成回调
   */
  set(items: Partial<T>, callback: () => void) {
    this.storageArea.set(items as unknown as Record<string, unknown>, callback);
  }

  /**
   * 从 Chrome 存储删除数据
   * @param {string|string[]} keys - 要删除的键
   * @param {function(): void} callback - 完成回调
   */
  remove(keys: keyof T | readonly (keyof T)[], callback: () => void) {
    this.storageArea.remove(keys as unknown, callback);
  }

  /**
   * 监听此存储区域的变化
   * @param {function(object): void} callback - 变化回调
   * @returns {function} 取消监听的函数
   */
  onChanged(callback: (changes: StorageChanges<T>) => void) {
    const listener = (changes: StorageChangesRecord, areaName: string) => {
      if (areaName === this.area) {
        callback(changes as unknown as StorageChanges<T>);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
}
