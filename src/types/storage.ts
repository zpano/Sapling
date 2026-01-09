import type { SaplingConfig } from '~/types/config';

export type SaplingStorageArea = 'sync' | 'local';

export interface MemorizeItem {
  word: string;
  addedAt: number;
}

export interface LearnedWord {
  original: string;
  word: string;
  addedAt: number;
}

export interface WordCacheItem {
  key: string;
  translation: string;
  phonetic: string;
  difficulty: string;
  partOfSpeech: string;
  shortDefinition: string;
  example: string;
}

export interface WiktionaryCacheItem {
  key: string;
  value: unknown;
  cachedAt: number;
}

export type RemoteStorageData = SaplingConfig;

export interface LocalStorageData {
  learnedWords: LearnedWord[];
  memorizeList: MemorizeItem[];
  Sapling_word_cache?: WordCacheItem[];
  Sapling_wiktionary_cache?: WiktionaryCacheItem[];
}

export type KeyList<T> = readonly (keyof T)[];
export type Keys<T> = keyof T | KeyList<T> | null;

export type GetResult<T, K extends Keys<T>> =
  K extends null
    ? T
    : K extends readonly (infer U)[]
      ? Pick<T, Extract<U, keyof T>>
      : K extends keyof T
        ? Pick<T, K>
        : never;

export type ChangeRecord<T> = { oldValue?: T; newValue?: T };
export type StorageChanges<T> = Partial<{ [K in keyof T]: ChangeRecord<T[K]> }>;

