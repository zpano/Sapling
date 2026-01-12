interface ExtensionLastError {
  message?: string;
}

interface StorageChangeRecord {
  oldValue?: unknown;
  newValue?: unknown;
}

type StorageChangesRecord = Record<string, StorageChangeRecord>;

interface ChromeStorageArea {
  get(keys: unknown, callback: (items: Record<string, unknown>) => void): void;
  set(items: Record<string, unknown>, callback?: () => void): void;
  remove(keys: unknown, callback?: () => void): void;
}

interface ChromeStorageOnChanged {
  addListener(callback: (changes: StorageChangesRecord, areaName: string) => void): void;
  removeListener(callback: (changes: StorageChangesRecord, areaName: string) => void): void;
}

interface ChromeStorage {
  sync: ChromeStorageArea;
  local: ChromeStorageArea;
  onChanged: ChromeStorageOnChanged;
  [key: string]: ChromeStorageArea | ChromeStorageOnChanged;
}

interface ChromeMessageSender {
  tab?: { id?: number };
  id?: string;
  url?: string;
}

interface ChromeRuntimeOnMessage {
  addListener(
    callback: (
      message: unknown,
      sender: ChromeMessageSender,
      sendResponse: (response: unknown) => void,
    ) => void | boolean,
  ): void;
  removeListener(
    callback: (
      message: unknown,
      sender: ChromeMessageSender,
      sendResponse: (response: unknown) => void,
    ) => void | boolean,
  ): void;
}

interface ChromeRuntime {
  lastError?: ExtensionLastError;
  getURL(path: string): string;
  openOptionsPage(): void;
  getPlatformInfo(callback: (info: Record<string, unknown>) => void): void;
  sendMessage(message: unknown): Promise<unknown>;
  sendMessage(message: unknown, responseCallback: (response: unknown) => void): void;
  onMessage: ChromeRuntimeOnMessage;
}

interface ChromeTab {
  id?: number;
}

interface ChromeTabs {
  query(queryInfo: Record<string, unknown>): Promise<ChromeTab[]>;
  query(queryInfo: Record<string, unknown>, callback: (tabs: ChromeTab[]) => void): void;
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
  sendMessage(tabId: number, message: unknown, options: unknown, responseCallback: (response: unknown) => void): void;
  create(createProperties: { url: string }): void;
}

interface ChromeLike {
  storage: ChromeStorage;
  runtime: ChromeRuntime;
  tabs: ChromeTabs;
}

interface BrowserRuntime {
  onInstalled: { addListener(callback: (details: unknown) => void): void };
  onMessage: {
    addListener(
      callback: (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => void | boolean,
    ): void;
  };
  getURL(path: string): string;
}

interface BrowserTabs {
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
  create(createProperties: { url: string }): void;
}

interface BrowserContextMenus {
  update(menuItemId: string, updateProperties: Record<string, unknown>, callback?: () => void): void;
  removeAll(callback?: () => void): void;
  create(createProperties: Record<string, unknown>): void;
  refresh?: () => void;
  onClicked: { addListener(callback: (info: Record<string, unknown>, tab: Record<string, unknown> | undefined) => void): void };
  onShown?: { addListener(callback: (info: Record<string, unknown>, tab: Record<string, unknown> | undefined) => void): void };
}

interface BrowserCommands {
  onCommand: { addListener(callback: (command: string, tab: Record<string, unknown> | undefined) => void): void };
}

interface BrowserLike {
  runtime: BrowserRuntime;
  tabs: BrowserTabs;
  contextMenus: BrowserContextMenus;
  commands: BrowserCommands;
}

declare const chrome: ChromeLike;
declare const browser: BrowserLike;

interface Window {
  __saplingApiErrorShown?: boolean;
}

declare function defineBackground<T>(main: T): T;
declare function defineContentScript<T>(options: T): T;
