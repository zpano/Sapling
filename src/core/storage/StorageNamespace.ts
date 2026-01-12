/**
 * Storage Namespace
 * 提供低级存储 API，支持回调和 Promise 风格
 */
import type { GetResult, Keys, StorageChanges } from '~/types/storage';
import type { IStorageAdapter } from '~/core/storage/IStorageAdapter';

export class StorageNamespace<T extends Record<string, unknown>> {
  private adapter: IStorageAdapter<T>;
  private shouldMergeDefaults: boolean;
  private defaultConfig: T | null;

  /**
   * @param {import('./IStorageAdapter').IStorageAdapter} adapter - 存储适配器
   * @param {boolean} shouldMergeDefaults - 是否与默认配置合并
   * @param {object|null} defaultConfig - 默认配置对象
   */
  constructor(adapter: IStorageAdapter<T>, shouldMergeDefaults = false, defaultConfig: T | null = null) {
    this.adapter = adapter;
    this.shouldMergeDefaults = shouldMergeDefaults;
    this.defaultConfig = defaultConfig;
  }

  /**
   * 从存储获取数据（回调风格）
   * @param {string|string[]|null} keys - 要获取的键，null 表示全部
   * @param {function(object): void} callback - 结果回调
   */
  get<K extends Keys<T>>(keys: K, callback: (result: GetResult<T, K>) => void) {
    this.adapter.get(keys, (result) => {
      if (!this.shouldMergeDefaults || !this.defaultConfig) {
        callback(result as GetResult<T, K>);
        return;
      }

      // 仅对 remote 存储合并默认配置
      if (keys === null) {
        callback({ ...this.defaultConfig, ...(result as object) } as GetResult<T, K>);
      } else if (typeof keys === 'string') {
        const key = keys as keyof T;
        callback({ [key]: (result as Record<string, unknown>)[key as string] ?? this.defaultConfig[key] } as GetResult<T, K>);
      } else {
        const merged: Partial<T> = {};
        (keys as readonly (keyof T)[]).forEach((key) => {
          (merged as Record<string, unknown>)[key as string] = (result as Record<string, unknown>)[key as string] ?? this.defaultConfig[key];
        });
        callback(merged as GetResult<T, K>);
      }
    });
  }

  /**
   * 设置存储数据（回调风格）
   * @param {object} items - 要存储的键值对
   * @param {function(): void} callback - 完成回调
   */
  set(items: Partial<T>, callback: () => void) {
    this.adapter.set(items, callback);
  }

  /**
   * 从存储删除数据（回调风格）
   * @param {string|string[]} keys - 要删除的键
   * @param {function(): void} callback - 完成回调
   */
  remove(keys: keyof T | readonly (keyof T)[], callback: () => void) {
    this.adapter.remove(keys, callback);
  }

  /**
   * 监听存储变化
   * @param {function(object): void} callback - 变化回调
   * @returns {function} 取消监听的函数
   */
  onChanged(callback: (changes: StorageChanges<T>) => void) {
    return this.adapter.onChanged(callback);
  }

  /**
   * 从存储获取数据（Promise 风格）
   * @param {string|string[]|null} keys - 要获取的键
   * @returns {Promise<object>}
   */
  getAsync<K extends Keys<T>>(keys: K = null as K) {
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

  /**
   * 设置存储数据（Promise 风格）
   * @param {object} items - 要存储的键值对
   * @returns {Promise<void>}
   */
  setAsync(items: Partial<T>) {
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

  /**
   * 从存储删除数据（Promise 风格）
   * @param {string|string[]} keys - 要删除的键
   * @returns {Promise<void>}
   */
  removeAsync(keys: keyof T | readonly (keyof T)[]) {
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
