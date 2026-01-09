export interface FetchAudioDataRequest {
  action: 'fetchAudioData';
  url: string;
}

export type FetchAudioDataResponse =
  | { success: true; data: string; contentType: string }
  | { success: false; message: string };

export interface TogglePageProcessingRequest {
  action: 'togglePageProcessing';
  tabId: number;
}

export type TogglePageProcessingResponse =
  | { success: true; processedBefore: boolean; processedAfter: boolean }
  | { success: false; message: string; processedBefore?: boolean; processedAfter?: boolean };

export interface RefreshTogglePageMenuTitleRequest {
  action: 'refreshTogglePageMenuTitle';
  tabId: number;
}

export type RefreshTogglePageMenuTitleResponse =
  | { success: true }
  | { success: false; message: string };

export interface TestApiRequest {
  action: 'testApi';
  endpoint: string;
  apiKey: string;
  model: string;
}

export type TestApiResponse = { success: boolean; message: string };

export interface GetStatsRequest {
  action: 'getStats';
}

export interface GetStatsResponse {
  totalWords: number;
  todayWords: number;
  learnedCount: number;
  memorizeCount: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface GetCacheStatsRequest {
  action: 'getCacheStats';
}

export interface GetCacheStatsResponse {
  size: number;
  maxSize: number;
}

export interface ClearCacheRequest {
  action: 'clearCache';
}

export interface ClearLearnedWordsRequest {
  action: 'clearLearnedWords';
}

export interface ClearMemorizeListRequest {
  action: 'clearMemorizeList';
}

export type SimpleSuccessResponse = { success: true };

export type BackgroundRequest =
  | FetchAudioDataRequest
  | TogglePageProcessingRequest
  | RefreshTogglePageMenuTitleRequest
  | TestApiRequest
  | GetStatsRequest
  | GetCacheStatsRequest
  | ClearCacheRequest
  | ClearLearnedWordsRequest
  | ClearMemorizeListRequest;

export type BackgroundResponse =
  | FetchAudioDataResponse
  | TogglePageProcessingResponse
  | RefreshTogglePageMenuTitleResponse
  | TestApiResponse
  | GetStatsResponse
  | GetCacheStatsResponse
  | SimpleSuccessResponse;

export type BackgroundAction = BackgroundRequest['action'];

export type BackgroundResponseFor<A extends BackgroundAction> =
  A extends FetchAudioDataRequest['action'] ? FetchAudioDataResponse
    : A extends TogglePageProcessingRequest['action'] ? TogglePageProcessingResponse
      : A extends RefreshTogglePageMenuTitleRequest['action'] ? RefreshTogglePageMenuTitleResponse
        : A extends TestApiRequest['action'] ? TestApiResponse
          : A extends GetStatsRequest['action'] ? GetStatsResponse
            : A extends GetCacheStatsRequest['action'] ? GetCacheStatsResponse
              : A extends ClearCacheRequest['action'] ? SimpleSuccessResponse
                : A extends ClearLearnedWordsRequest['action'] ? SimpleSuccessResponse
                  : A extends ClearMemorizeListRequest['action'] ? SimpleSuccessResponse
                    : never;

export type BackgroundRequestFor<A extends BackgroundAction> = Extract<BackgroundRequest, { action: A }>;

export interface ProcessPageRequest {
  action: 'processPage';
}

export type ProcessPageResponse =
  | { processed: number; skipped?: boolean; disabled?: boolean; blacklisted?: boolean }
  | { processed: 0; blacklisted: true };

export interface RestorePageRequest {
  action: 'restorePage';
}

export type RestorePageResponse = SimpleSuccessResponse;

export interface ProcessSpecificWordsRequest {
  action: 'processSpecificWords';
  words: string[];
}

export type ProcessSpecificWordsResponse =
  | { success: true; count: number }
  | { success: false; error: string };

export interface GetStatusRequest {
  action: 'getStatus';
}

export interface GetStatusResponse {
  processed: number;
  hasTranslations: boolean;
  hasProcessedMarkers: boolean;
  isProcessing: boolean;
  enabled: boolean;
}

export interface ResetAllDataRequest {
  action: 'resetAllData';
}

export type ClearCacheOrResetAllResponse =
  | SimpleSuccessResponse
  | { success: false; message: string };

export type ContentRequest =
  | ProcessPageRequest
  | RestorePageRequest
  | ProcessSpecificWordsRequest
  | GetStatusRequest
  | ClearCacheRequest
  | ResetAllDataRequest;

export type ContentResponse =
  | ProcessPageResponse
  | RestorePageResponse
  | ProcessSpecificWordsResponse
  | GetStatusResponse
  | ClearCacheOrResetAllResponse;

export type ContentAction = ContentRequest['action'];
export type ContentRequestFor<A extends ContentAction> = Extract<ContentRequest, { action: A }>;

export type ContentResponseFor<A extends ContentAction> =
  A extends ProcessPageRequest['action'] ? ProcessPageResponse
    : A extends RestorePageRequest['action'] ? RestorePageResponse
      : A extends ProcessSpecificWordsRequest['action'] ? ProcessSpecificWordsResponse
        : A extends GetStatusRequest['action'] ? GetStatusResponse
          : A extends ClearCacheRequest['action'] ? ClearCacheOrResetAllResponse
            : A extends ResetAllDataRequest['action'] ? ClearCacheOrResetAllResponse
              : never;
