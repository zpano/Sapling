# Sapling 浏览器扩展 - 构建指南

## 前置要求

- **Node.js**: v18.x 或更高版本
- **包管理器**: pnpm（推荐）或 npm
- **操作系统**: macOS、Linux 或 Windows

## 快速开始

### 1. 安装依赖

```bash
# 使用 pnpm（推荐）
pnpm install

# 或使用 npm
npm install
```

### 2. 开发模式

开发模式会启动文件监听，自动重新构建：

```bash
# Chrome/Edge 开发模式
pnpm dev

# Firefox 开发模式
pnpm dev:firefox
```

开发模式输出目录：`.output/chrome-mv3-dev/` 或 `.output/firefox-mv3-dev/`

## 开发者 API 配置（仅 dev）

在 `pnpm dev` / `npm run dev` 时，可以用 `.env.development.local` 强制覆盖 content script 的 API 配置，避免每次都去设置页手动修改。

```bash
cp .env.development.local.example .env.development.local
```

可用变量：
- `VITE_SAPLING_API_ENDPOINT`：API 端点（非空才会覆盖）
- `VITE_SAPLING_MODEL_NAME`：模型名称（非空才会覆盖）
- `VITE_SAPLING_API_KEY`：API Key（即使为空也会覆盖，便于临时清空）

说明：
- 仅在开发模式生效（`import.meta.env.DEV`）。
- `?sapling-mock=1` 的测试模式优先级更高（会覆盖 `apiEndpoint`）。
- `.env*.local` 已加入 `.gitignore`，不要提交真实 Key。

### 3. 生产构建

```bash
# Chrome/Edge 生产构建
pnpm build

# Firefox 生产构建
pnpm build:firefox
```

生产构建输出目录：`.output/chrome-mv3/` 或 `.output/firefox-mv3/`

## 在浏览器中加载扩展

### Chrome/Edge

1. 打开浏览器并访问 `chrome://extensions/`（Chrome）或 `edge://extensions/`（Edge）
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `.output/chrome-mv3/` 目录（生产构建）或 `.output/chrome-mv3-dev/`（开发模式）

### Firefox

1. 打开浏览器并访问 `about:debugging#/runtime/this-firefox`
2. 点击"临时载入附加组件"
3. 选择 `.output/firefox-mv3/manifest.json` 文件

## 项目结构

```
Sapling/
├── src/                  # 源码目录（WXT 的 `~` 指向此处）
│   ├── entrypoints/      # 扩展入口点
│   │   ├── background.ts # Background Service Worker
│   │   ├── content.ts    # Content Script
│   │   ├── popup/        # Popup 页面
│   │   └── options/      # Options 页面
│   ├── services/         # API、分词、替换服务
│   ├── ui/               # UI 组件
│   └── utils/            # 工具函数
├── public/               # 静态资源
├── .output/              # 构建输出（git ignored）
└── wxt.config.ts         # WXT 配置文件
```

## 可用脚本

```bash
# 开发
pnpm dev              # Chrome 开发模式
pnpm dev:firefox      # Firefox 开发模式

# 构建
pnpm build            # Chrome 生产构建
pnpm build:firefox    # Firefox 生产构建

# 测试
pnpm zip              # 打包为 .zip（用于发布）
pnpm zip:firefox      # 打包 Firefox 版本

# 代码质量
pnpm postinstall      # 更新 WXT 模块（自动运行）
```

## 构建优化

### 生产构建特性

- ✅ 代码压缩和混淆
- ✅ Tree-shaking（移除未使用代码）
- ✅ CSS 提取和优化
- ✅ Source map 生成（可选）

### 构建输出说明

构建完成后会显示：

```
✔ Built extension in 1.8s
  ├─ .output/chrome-mv3/manifest.json
  ├─ .output/chrome-mv3/background.js
  ├─ .output/chrome-mv3/content-scripts/content.js
  ├─ .output/chrome-mv3/popup.html
  └─ ... (其他资源文件)
Σ Total size: ~4 MB
```

## 常见问题

### 1. 构建失败：`ELIFECYCLE Command failed`

**原因**：通常是依赖未安装或版本不兼容

**解决**：
```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm build
```

### 2. Content Script 未加载

**原因**：WXT 配置或 manifest 配置问题

**解决**：检查 `wxt.config.ts` 中的 `manifest` 配置

### 3. 提示 "Extension context invalidated"

**原因**：扩展已重新加载，但旧的 content script 仍在运行

**解决**：刷新使用扩展的网页

### 4. 构建速度慢

**解决**：
- 使用开发模式（`pnpm dev`）进行快速迭代
- 确保 `.output/` 和 `node_modules/` 已加入 gitignore

## 发布准备

### 创建发布包

```bash
# 构建并打包
pnpm build
pnpm zip

# Firefox 版本
pnpm build:firefox
pnpm zip:firefox
```

打包文件位于：`.output/*.zip`

### 提交前检查清单

- [ ] 更新 `package.json` 中的版本号
- [ ] 更新 `wxt.config.ts` 中的 manifest 版本
- [ ] 运行完整构建测试（Chrome + Firefox）
- [ ] 测试核心功能（翻译、缓存、配置）
- [ ] 检查 console 无错误和警告
- [ ] 清理调试代码和临时日志

## 技术栈

- **框架**: [WXT](https://wxt.dev/) v0.20.13
- **构建工具**: Vite 5.4.21
- **包管理**: pnpm
- **语言**: TypeScript + JavaScript
- **依赖**:
  - `@toon-format/toon`: TOON 格式解析
  - `segmentit`: 中文分词
  - Chrome Extensions API / Firefox WebExtensions API

## 更多信息

- [WXT 官方文档](https://wxt.dev/)
- [Chrome Extensions 文档](https://developer.chrome.com/docs/extensions/)
- [Firefox Extensions 文档](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
