# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VocabMeld is a Chrome Extension (Manifest V3) for immersive language learning. It intelligently replaces vocabulary in web pages with translations, allowing users to naturally acquire languages through "Comprehensible Input" (Stephen Krashen's theory).

## Build Commands

```bash
# Generate extension icons (the only build step)
npm run build

# Watch mode for icon generation
npm run watch
```

**No bundler is used.** The extension uses vanilla JavaScript ES6+. Development involves direct file edits and manual extension reloading via `chrome://extensions/`.

## Testing

No testing framework is configured. Testing is manual through the Chrome extension developer workflow:
1. Edit files directly
2. Visit `chrome://extensions/`
3. Click refresh button on extension card
4. Test on any web page

## Architecture

```
Background Service Worker (background.js)
    └── Extension lifecycle, context menus, message routing

Content Script (content.js) - Main logic file
    └── DOM manipulation, text replacement, tooltips, user interaction

Services Layer (js/services/)
    ├── api-service.js      - LLM API integration (OpenAI-compatible)
    ├── cache-service.js    - 2000-word LRU cache management
    ├── content-segmenter.js - Intelligent DOM traversal & segmentation
    ├── processing-service.js - Translation orchestration
    └── text-replacer.js    - DOM text replacement via Range API

Core Modules (js/)
    ├── config.js           - Configuration, CEFR levels, API presets
    └── storage.js          - Chrome Storage API wrapper

UI Components
    ├── popup.js/html/css   - Extension popup (stats, quick actions)
    └── options.js/html/css - Settings page (6-section navigation)
```

## Key Technical Details

- **Chrome Extension APIs**: storage (sync + local), contextMenus, activeTab, scripting, tts
- **No ES6 modules in content script** - Chrome restrictions require inline dependencies
- **Storage**: `chrome.storage.sync` for config, `chrome.storage.local` for word cache
- **Message passing**: Background ↔ Content script via `chrome.runtime.sendMessage()`

## Core Algorithms

**Difficulty Filtering**: Uses CEFR 6-level system (A1 → C2). Words are shown only if >= user's level.

**Replacement Intensity**: Low (4 words/paragraph), Medium (8), High (14).

**Content Processing**: 50-2000 character segments, fingerprint deduplication, viewport-aware prioritization, concurrent 3-segment processing.

**LRU Cache**: 2000-word capacity, evicts least-recently-used, persists across sessions.

## Supported Languages

- **Native**: Chinese (Simplified/Traditional), English, Japanese, Korean
- **Target**: English, Chinese, Japanese, Korean, French, German, Spanish
- **AI Providers**: OpenAI, DeepSeek, Moonshot, Groq, Ollama (any OpenAI-compatible API)

## Localization

Uses Chrome Extension i18n API. Messages in `/_locales/{locale}/messages.json`. Default locale: zh_CN.
