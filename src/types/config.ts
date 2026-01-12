import type { CEFR_LEVELS, INTENSITY_CONFIG } from '~/constants';

export type CefrLevel = (typeof CEFR_LEVELS)[number];
export type IntensityKey = keyof typeof INTENSITY_CONFIG;

export type TranslationStyle = 'translation-only' | 'original-translation' | 'translation-original';
export type OutputFormat = 'standard' | 'toon';

export type PronunciationProvider = 'wiktionary' | 'youdao' | 'google';
export type YoudaoPronunciationType = 1 | 2;

export interface ThemeConfig {
  brand: string;
  background: string;
  card: string;
  highlight: string;
  underline: string;
  text: string;
}

export interface ApiProfile {
  id: string;
  name: string;
  apiEndpoint: string;
  apiKey: string;
  modelName: string;
}

export interface SaplingConfig {
  apiEndpoint: string;
  apiKey: string;
  modelName: string;
  apiProfiles: ApiProfile[];
  activeApiProfileId: string | null;

  nativeLanguage: string;
  targetLanguage: string;
  difficultyLevel: CefrLevel;
  intensity: IntensityKey;

  autoProcess: boolean;
  showPhonetic: boolean;
  allowLeftClickPronunciation: boolean;
  restoreAllSameWordsOnLearned: boolean;
  pronunciationProvider: PronunciationProvider;
  youdaoPronunciationType: YoudaoPronunciationType;
  enabled: boolean;

  blacklist: string[];
  whitelist: string[];

  totalWords: number;
  todayWords: number;
  lastResetDate: string;

  cacheMaxSize: number;
  concurrencyLimit: number;
  maxBatchSize: number;
  maxTokens: number;
  processFullPage: boolean;

  outputFormat: OutputFormat;
  theme: ThemeConfig;

  cacheHits: number;
  cacheMisses: number;

  translationStyle?: TranslationStyle;
  vocabTestCompleted?: boolean;
  vocabTestSkipped?: boolean;
  vocabTestResult?: unknown;
}
