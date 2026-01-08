/**
 * Storage Adapter 接口
 * 定义存储后端实现的契约（Chrome Storage、WebDAV 等）
 */

export type StorageGetKeys = string | string[] | null;
export type StorageGetCallback<T = Record<string, unknown>> = (items: Partial<T> & Record<string, unknown>) => void;
export type StorageChangeCallback = (changes: Record<string, chrome.storage.StorageChange>) => void;

export interface StorageAdapter {
  get(keys: StorageGetKeys, callback: StorageGetCallback): void;
  set(items: Record<string, unknown>, callback: () => void): void;
  remove(keys: string | string[], callback: () => void): void;
  onChanged(callback: StorageChangeCallback): () => void;
}

export abstract class IStorageAdapter implements StorageAdapter {
  abstract get(keys: StorageGetKeys, callback: StorageGetCallback): void;
  abstract set(items: Record<string, unknown>, callback: () => void): void;
  abstract remove(keys: string | string[], callback: () => void): void;
  abstract onChanged(callback: StorageChangeCallback): () => void;
}
