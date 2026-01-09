/**
 * Storage Adapter 接口
 * 定义存储后端实现的契约（Chrome Storage、WebDAV 等）
 */
import type { GetResult, Keys, StorageChanges } from '~/types/storage';

export abstract class IStorageAdapter<T extends Record<string, unknown>> {
  /**
   * 从存储中获取数据
   * @param {string|string[]|null} keys - 要获取的键，null 表示获取全部
   * @param {function(object): void} callback - 回调函数，接收结果对象
   */
  abstract get<K extends Keys<T>>(keys: K, callback: (result: GetResult<T, K>) => void): void;

  /**
   * 设置存储数据
   * @param {object} items - 要存储的键值对
   * @param {function(): void} callback - 完成回调
   */
  abstract set(items: Partial<T>, callback: () => void): void;

  /**
   * 从存储中删除数据
   * @param {string|string[]} keys - 要删除的键
   * @param {function(): void} callback - 完成回调
   */
  abstract remove(keys: keyof T | readonly (keyof T)[], callback: () => void): void;

  /**
   * 监听存储变化
   * @param {function(object): void} callback - 变化回调，接收 changes 对象
   * @returns {function} 取消监听的函数
   */
  abstract onChanged(callback: (changes: StorageChanges<T>) => void): () => void;
}
