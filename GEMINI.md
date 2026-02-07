# GEMINI.md

本文件提供在本仓库内进行开发/重构时的约定与定位入口（面向代码助手与维护者）。

## Project Overview

Sapling 是一个 Manifest V3 浏览器扩展，用于沉浸式语言学习：在网页中将部分词汇替换为翻译，并提供 tooltip/发音/词汇管理等能力。

基于「可理解性输入」理论，在用户浏览母语内容时将部分词汇智能替换为学习语言，反之亦然。

## Build Commands

```bash
# 安装依赖（会触发 postinstall: wxt prepare）
npm install

# 开发（Chrome）
npm run dev

# 开发（Firefox）
npm run dev:firefox

# 构建（Chrome）
npm run build

# 构建（Firefox）
npm run build:firefox

# 打包发布 zip
npm run zip
npm run zip:firefox
```

本项目已迁移到 **WXT** 框架（Vite 构建 + TS），不再使用 legacy 的 `js/` + 手工 `manifest.json` + `vendor/` 打包流程。

## Dev API 配置（仅 dev）

开发时可用 `.env.development.local` 强制覆盖 content script 运行时使用的 API 配置，避免反复去设置页修改。

```bash
cp .env.development.local.example .env.development.local
```

变量：
- `VITE_SAPLING_API_ENDPOINT`（非空才覆盖）
- `VITE_SAPLING_MODEL_NAME`（非空才覆盖）
- `VITE_SAPLING_API_KEY`（允许为空，若定义则覆盖）

优先级：`?sapling-mock=1` 测试模式 > `.env.development.local` > storage/默认值

## Testing

```bash
# E2E 测试（Playwright）
npm run test:e2e

# Mock 服务器（用于本地调试，端口 3456）
npm run mock
```

**测试资源**：
- `tests/e2e/` - Playwright E2E 测试
- `test/mock-server.js` - 模拟 OpenAI 兼容 API 的响应
- `test/*.html` - 手工测试用的 HTML 页面

**手工验证**：加载 `.output/*/manifest.json` 到浏览器扩展管理页。

## Architecture

```
WXT 结构（`~` 导入别名指向 `src/`）

入口（src/entrypoints/）
    background.ts       - 后台 service worker：安装初始化、右键菜单、消息代理
    content.ts          - content script：DOM 分段/翻译/替换/交互
    popup/*             - popup 页面（HTML + TS）
    options/*           - options 页面（HTML + TS）
    vocab-test/*        - 词汇量测试页（HTML + TS）

核心模块（src/）
    core/*              - 配置与 storage 抽象
    services/*          - API/缓存/分段/替换/音频 等服务
    prompts/*           - AI 提示词模板（CEFR/翻译策略）
    ui/*                - tooltip/modal/toast 等 UI
    utils/*             - 语言检测/文本处理/过滤/TOON 等工具
    types/*             - TypeScript 类型定义
    constants.ts        - 全局常量（强度/跳过规则/停用词等）

静态资源（public/）
    _locales/*          - i18n 资源
    css/*               - options/popup 等页面样式
    icons/*             - 图标
    wordlist/*          - CEFR 词表

根目录类型（types/）
    env.d.ts            - Vite 环境变量类型
    globals.d.ts        - 全局类型声明（Chrome API 扩展）
```

## Dependencies

| Package | 用途 |
|---------|------|
| `@toon-format/toon` | TOON 格式解析（结构化翻译响应，避免 JSON 解析失败） |
| `segmentit` | 中日韩文本分词 |

## Key Technical Details

- **WXT + Vite**：构建与入口发现由 WXT 管理；`wxt.config.ts` 生成 manifest。
- **TypeScript**：以"能跑"为目标（未开启严格模式），逐步补类型。
- **导入别名**：统一使用 `~/...`，对应 `src/`（见 `wxt.config.ts` 的 `srcDir`）。
- **存储分层**：`IStorageAdapter -> ChromeStorageAdapter -> StorageNamespace -> StorageService`；区分 sync/local。
- **消息通信**：background ↔ content 通过 `chrome.runtime.sendMessage` / `tabs.sendMessage`。
- **发音**：通过 background 代理 fetch + Web Audio 解码播放，绕过页面 CSP。

## Message Types

消息类型定义在 `src/types/messages.ts`，分为两类：

### Background Actions（background 处理）

| Action | 说明 | 请求类型 | 响应类型 |
|--------|------|----------|----------|
| `fetchAudioData` | 代理 fetch 音频（绕过 CSP） | `{ url }` | `{ data, contentType }` |
| `togglePageProcessing` | 切换页面处理状态 | `{ tabId }` | `{ processedBefore, processedAfter }` |
| `refreshTogglePageMenuTitle` | 刷新右键菜单标题 | `{ tabId }` | `{ success }` |
| `testApi` | 测试 API 连接 | `{ endpoint, apiKey, model }` | `{ success, message }` |
| `getStats` | 获取学习统计 | `{}` | `{ totalWords, todayWords, ... }` |
| `getCacheStats` | 获取缓存统计 | `{}` | `{ size, maxSize }` |
| `clearCache` | 清空翻译缓存 | `{}` | `{ success }` |
| `clearLearnedWords` | 清空已学会词汇 | `{}` | `{ success }` |
| `clearMemorizeList` | 清空需记忆列表 | `{}` | `{ success }` |

### Content Actions（content script 处理）

| Action | 说明 | 请求类型 | 响应类型 |
|--------|------|----------|----------|
| `processPage` | 处理当前页面 | `{}` | `{ processed, skipped?, ... }` |
| `restorePage` | 还原页面 | `{}` | `{ success }` |
| `processSpecificWords` | 处理特定单词 | `{ words[] }` | `{ count }` |
| `getStatus` | 获取页面状态 | `{}` | `{ processed, hasTranslations, ... }` |
| `resetAllData` | 重置所有数据 | `{}` | `{ success }` |

## Core Algorithms

**难度过滤**：CEFR 6 级（A1 → C2），只选择/显示难度 >= 用户设置的词。

**替换强度**：低/中/高（每段落 4/8/14）。

**内容处理**：分段（50-2000 字符）、指纹去重、视口优先、并发批处理。

**LRU 缓存**：默认 2000 容量，按最近使用淘汰，跨会话持久化。

**翻译展示样式**：
- `translation-only`: 仅显示翻译
- `original-translation`: 原文(翻译)
- `translation-original`: 翻译(原文)

## Supported Languages

- **母语**：中文（简/繁）、英语、日语、韩语
- **目标语言**：英语、中文、日语、韩语、法语、德语、西语
- **AI Provider**：任意 OpenAI 兼容接口（OpenAI/Gemini/DeepSeek/Moonshot/Groq/Ollama）

## Localization

使用扩展 i18n：`public/_locales/{locale}/messages.json`，默认 `zh_CN`。

## Storage Architecture

存储系统为 4 层结构，便于替换后端与保持兼容：

### Layer 1: IStorageAdapter (Interface)
- 定义 `get/set/remove/onChanged` 契约
- 允许未来替换后端（Chrome Storage/WebDAV/其他）

### Layer 2: ChromeStorageAdapter (Implementation)
- 包装 `chrome.storage.sync` / `chrome.storage.local`
- 过滤 area 的 change 事件
- `onChanged()` 返回 unsubscribe

### Layer 3: StorageNamespace (Low-level API)
- 同时提供 callback / Promise 风格（`get/getAsync`、`set/setAsync`）
- remote（sync）读取时合并 `DEFAULT_CONFIG`（默认值在代码中）
- `storage.remote`（sync）与 `storage.local`（local）分离

### Layer 4: StorageService (High-level Facade)
- 提供领域方法：统计/词表/列表等
- 保持兼容：`get/set/getLocal/setLocal/removeLocal`
- 单例导出：`export const storage = new StorageService()`

**存储区域**：
- **storage.remote**（sync）：配置数据，支持跨设备同步
- **storage.local**（local）：大容量数据，如词汇缓存、已学会词汇

## Debugging

### Content Script 日志
打开目标页面的 DevTools Console，日志以 `[Sapling]` 前缀标识。

### Background 日志
1. 打开 `chrome://extensions`
2. 找到 Sapling 扩展
3. 点击"服务工作进程"链接打开 DevTools

### 存储查看
DevTools → Application → Storage → Extension Storage（sync / local）

### 常见调试场景

| 场景 | 方法 |
|------|------|
| API 调用失败 | 检查 Network 面板，查看请求/响应内容 |
| 翻译未生效 | Console 查看 `[Sapling]` 日志，确认分段/替换流程 |
| 缓存问题 | 使用 options 页面清空缓存，或检查 `Sapling_word_cache` |
| 消息通信问题 | 在 background 和 content 的 Console 分别查看日志 |

## Error Handling

- **API 错误**：捕获并显示友好提示，不中断页面处理
- **网络超时**：使用 AbortController，默认超时后自动重试或跳过
- **缓存失败**：静默降级，不影响核心翻译功能
- **DOM 变化**：使用 MutationObserver 监听，增量处理新内容

## Key Files for Common Tasks

| Task | Files |
|------|-------|
| 修改翻译逻辑 | `src/services/api-service.ts`, `src/prompts/ai-prompts.ts` |
| 修改 DOM 处理 | `src/services/content-segmenter.ts`, `src/services/text-replacer.ts` |
| 修改 tooltip 行为 | `src/ui/tooltip.ts`, `src/ui/content.css` |
| 修改单词过滤规则 | `src/utils/word-filters.ts`, `src/constants.ts` |
| 修改存储行为 | `src/core/storage/StorageService.ts`, `src/core/storage/ChromeStorageAdapter.ts` |
| 添加新存储后端 | 实现 `src/core/storage/IStorageAdapter.ts` |
| 修改 popup/options UI | `src/entrypoints/popup/*`, `src/entrypoints/options/*` |
| 修改 AI 提示词 | `src/prompts/ai-prompts.ts` |
| 添加新消息类型 | `src/types/messages.ts`, 然后在 `background.ts` / `content.ts` 添加处理 |
