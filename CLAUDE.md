# CLAUDE.md

本文件提供在本仓库内进行开发/重构时的约定与定位入口（面向代码助手与维护者）。

## Project Overview

Sapling 是一个 Manifest V3 浏览器扩展，用于沉浸式语言学习：在网页中将部分词汇替换为翻译，并提供 tooltip/发音/词汇管理等能力。

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

开发时可用 `.env.development.local` 强制覆盖 content script 运行时使用的 API 配置，避免反复去设置页修改（仅覆盖 `apiEndpoint/apiKey/modelName`，不写入 storage）。

```bash
cp .env.development.local.example .env.development.local
```

变量：
- `VITE_SAPLING_API_ENDPOINT`（非空才覆盖）
- `VITE_SAPLING_MODEL_NAME`（非空才覆盖）
- `VITE_SAPLING_API_KEY`（允许为空，若定义则覆盖）

优先级：
- `?sapling-mock=1` 测试模式 > `.env.development.local` > storage/默认值

## Testing

未配置自动化测试；主要依赖手工验证（加载 `.output/*/manifest.json` 到浏览器扩展管理页）。

## Architecture

```
WXT 结构（`~` 导入别名指向 `src/`）

入口（`src/entrypoints/`）
    src/entrypoints/background.ts   - 后台 service worker：安装初始化、右键菜单、消息代理
    src/entrypoints/content.ts      - content script：DOM 分段/翻译/替换/交互
    src/entrypoints/popup/*         - popup 页面（HTML + TS）
    src/entrypoints/options/*       - options 页面（HTML + TS）
    src/entrypoints/vocab-test/*    - 词汇量测试页（HTML + TS）

共享模块（`src/`）
    src/services/*                  - API/缓存/分段/替换/音频 等服务
    src/core/*                      - 配置与 storage 抽象
    src/constants.ts                - 全局常量（强度/跳过规则/停用词等）
    src/ui/*                        - tooltip/modal/toast 等 UI
    src/utils/*                     - 语言检测/文本处理/过滤/TOON 等工具

静态资源（`public/`）
    public/_locales/*               - i18n 资源
    public/css/*                    - options/popup 等页面样式
    public/icons/*                  - 图标
    public/wordlist/*               - CEFR 词表
```

## Key Technical Details

- **WXT + Vite**：构建与入口发现由 WXT 管理；`wxt.config.ts` 生成 manifest。
- **TypeScript**：以“能跑”为目标（未开启严格模式），逐步补类型。
- **导入别名**：统一使用 `~/...`，对应 `src/`（见 `wxt.config.ts` 的 `srcDir`）。
- **存储分层**：`IStorageAdapter -> ChromeStorageAdapter -> StorageNamespace -> StorageService`；区分 sync/local。
- **消息通信**：background ↔ content 通过 `chrome.runtime.sendMessage` / `tabs.sendMessage`。
- **发音**：通过 background 代理 fetch + Web Audio 解码播放，绕过页面 CSP。

## Core Algorithms

**难度过滤**：CEFR 6 级（A1 → C2），只选择/显示难度 >= 用户设置的词。

**替换强度**：低/中/高（每段落 4/8/14）。

**内容处理**：分段（50-2000 字符）、指纹去重、视口优先、并发批处理。

**LRU 缓存**：默认 2000 容量，按最近使用淘汰，跨会话持久化。

**翻译展示样式**：
- `translation-only`: Show only translation
- `original-translation`: Original(Translation)
- `translation-original`: Translation(Original)

## Supported Languages

- **母语**：中文（简/繁）、英语、日语、韩语
- **目标语言**：英语、中文、日语、韩语、法语、德语、西语
- **AI Provider**：任意 OpenAI 兼容接口（OpenAI/DeepSeek/Moonshot/Groq/Ollama）

## Localization

使用扩展 i18n：`public/_locales/{locale}/messages.json`，默认 `zh_CN`。

## Storage Architecture Deep Dive

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
