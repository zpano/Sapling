# CHANGELOG

范围：从 `23ef12de7e74e875db6583aa273e4264c3951b74` 到 `HEAD`。

## 2025-12-16 5141123 refactor: enhance tooltip functionality and UI components
修改：移除选中弹窗，将发音/记忆/已学会按钮并入 tooltip，优化显示/隐藏延迟与相关样式，完善后台消息处理。
新增：tooltip 延迟隐藏控制与消息发送错误兜底。

## 2025-12-16 5907b84 docs: add CLAUDE.md for project guidance and architecture overview
修改：无（文档新增）。
新增：`CLAUDE.md` 项目指导和架构说明。

## 2025-12-16 0a09318 fix: skip replacements for identical English-like translations
修改：替换前比较原文/译文一致（英文忽略大小写）时跳过替换。
新增：相同英文译文过滤逻辑。

## 2025-12-16 74c1e3c feat: improve translation quality and error handling
修改：LLM 提示词改英文并加强词汇过滤，词典改用 Wiktionary，tooltip 悬停时长调整，错误处理增强。
新增：结构化错误日志、扩展上下文失效保护、仅查询英文单词的词典规则。

## 2025-12-16 143137f feat: add segmentit for text segmentation and update manifest
修改：内容脚本接入 segmentit 分词，manifest 引入分词 bundle，构建脚本/依赖更新。
新增：`.gitignore`、`package-lock.json`、`vendor/segmentit.bundle.js(.map)`。

## 2025-12-16 6a3e085 feat: enhance dictionary lookup functionality and support for multiple languages
修改：词典查询支持多语言与单词优先策略，Wiktionary 解析更完整，缓存/错误处理优化。
新增：`getDictionaryEntry` 语言参数与词性/音标/音频/释义/例句解析逻辑。

## 2025-12-16 e73f81e feat: implement native language detection and fallback mechanism
修改：语言检测优先使用原生 LanguageDetector，失败回退正则并统一语言代码。
新增：LanguageDetector 初始化与兜底机制。

## 2025-12-17 ac69656 feat: refine AI prompt for vocabulary selection and translation
修改：系统/用户 prompt 优化，明确词汇选择规则与上下文，输出格式更严格。
新增：JSON 数组输出约束。

## 2025-12-17 7cd0e90 feat: enhance vocabulary selection and translation rules
修改：选择规则加入母语/学习语言，音标规则按学习语言，tooltip 等待语言检测完成。
新增：语言上下文注入到词汇选择流程。

## 2025-12-17 1d96ac7 feat: modularize and enhance VocabMeld functionality
修改：内容脚本重构为 ES 模块，服务/工具拆分，移除 `processing-service`，manifest 使用打包内容脚本并新增 offscreen 权限，tooltip/通知系统更新，构建脚本调整。
新增：`offscreen.html`、`js/offscreen-audio.js`、`js/prompts/ai-prompts.js`、`js/ui/*`、`js/utils/*`、`js/config/constants.js`、`dist/content.js(.map)`、`js/content.js.backup`。

## 2025-12-17 8c7213b feat: add pronunciation audio support and configuration options
修改：设置页/tooltip 接入可选发音源，配置项扩展并加载保存。
新增：`js/ui/pronunciation.js` 模块与发音设置 UI（Wiktionary/有道/Google）。

## 2025-12-17 c94fff5 refactor: streamline file title resolution for Wiktionary audio playback
修改：Wiktionary 音频 URL 生成改为同步 `Special:FilePath`，相关调用与文档更新。
新增：更简化的音频文件名解析逻辑。

## 2025-12-17 4e851ae feat: implement persistent caching for dictionary lookups
修改：词典查询优先使用 Chrome local 持久缓存，并限制缓存大小。
新增：持久缓存加载/读取/写入逻辑。

## 2025-12-17 4e32a08 feat: enhance user experience with shortcut key updates and fix cache
修改：快捷键文案更新（README/弹窗/i18n）；处理按钮与右键菜单支持“处理/还原”切换并同步状态；处理流程加入 generation 取消旧任务；缓存命中时避免额外 API 请求；分词语言识别兼容语言代码；移除 `dist` 产物并忽略。
新增：`AGENTS.md`，动态刷新右键菜单标题与运行时消息接口，页面处理按钮状态渲染逻辑。

## 2025-12-17 2cefbd0 feat: enhance cache management with adjustable size settings
修改：缓存上限可配置（2000-8192），配置/背景/内容/缓存服务联动并自动裁剪；文档更新。
新增：设置页缓存大小控件与相关配置项。

## 2025-12-17 de3e690 refactor: update classList handling for SKIP_CLASSES checks
修改：SKIP_CLASSES 判断改用 `classList`，文本容器检测优化。
新增：`inlineTextTags` 集合用于内联文本容器判定。

## 2025-12-18 a976ab6 feat: enhance segmentit integration for improved compatibility
修改：segmentit 兼容现代/旧版结构，`Segment` 构造与 `useDefault` 处理增强；构建脚本同步。
新增：分词构造器与 `useDefault` 兜底逻辑。

## 2025-12-18 dcadc18 fix: MAX_CONCURRENT not work with api request
修改：API 请求改为队列限流，缓存保存改为防抖/非阻塞，清理逻辑更健壮。
新增：请求队列与延迟保存机制。

## 2025-12-18 32c0695 fix: reset not clear word cache
修改：统一缓存 key 常量，重置/本地变更时清理缓存。
新增：清空 word cache 的存储函数与监听逻辑。

## 2025-12-18 e302ffa feat: add advanced settings for concurrency and length limits
修改：新增并发数与长度限制配置，选项页/配置/API 接入并做输入归一化。
新增：高级设置 UI 与配置项。

## 2025-12-18 330226b refactor: remove length limit settings and enhance contenteditable handling
修改：移除长度限制设置；contenteditable 处理增强；分段与替换逻辑支持混合内容。
新增：`js/utils/dom-utils.js` DOM 工具。

## 2025-12-18 5c84eaf style: refine form group styling and adjust line height
修改：设置页表单组样式与行高调整。
新增：无。

## 2025-12-18 16ca46c feat: update cache size settings and enhance manual save functionality
修改：默认缓存上限改为 2048（范围 2048-8192），缓存设置 UI 升级为滑块+输入，加入手动保存入口，文档同步更新。
新增：手动保存按钮与保存提示逻辑。

## 2025-12-18 abc5972 docs: update README for clarity and feature enhancements
修改：README 功能说明与使用文档补充完善。
新增：无（文档更新）。

## 2025-12-18 6f86830 feat: enhance tooltip interaction and audio playback
修改：tooltip 交互支持左键动作按钮，点击翻译词可直接发音，避免干扰页面交互。
新增：左键快捷发音触发逻辑。

## 2025-12-19 7358f70 feat: add left-click pronunciation option in settings
修改：增加开关控制左键发音，事件逻辑与配置加载保存同步。
新增：左键发音设置项。

## 2025-12-19 448e803 feat: restoreAllSameWords option
修改：标记“已学会”时可选择恢复同词所有替换，内容脚本按配置执行。
新增：`restoreAllSameWordsOnLearned` 配置与设置项。
