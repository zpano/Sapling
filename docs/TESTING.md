# Testing Guide

This repo currently uses Playwright e2e tests for the extension UI and content script behavior.

## Prerequisites
- Node.js v18+
- Dependencies installed (`npm install`)
- A built extension bundle (`npm run build`)

## Run E2E Tests
```bash
npm run build
npm run test:e2e
```

The tests load the extension from:
- `.output/chrome-mv3` if present (production build)
- `.output/chrome-mv3-dev` if present (dev build)
- or override with `EXTENSION_PATH=/absolute/or/relative/path`

## Mock vs Real API
By default, tests start the local mock server and use `?sapling-mock=1` to force the content script
to call `http://localhost:3000/chat/completions`.

To use a real API instead of the mock:
```bash
SAPLING_USE_REAL_API=1 \
SAPLING_API_ENDPOINT="https://example.com/v1/chat/completions" \
SAPLING_API_KEY="your-key" \
SAPLING_MODEL_NAME="your-model" \
npm run test:e2e
```

Notes:
- The mock server listens on port 3000. If it is already running, the tests reuse it.
- `SAPLING_MODEL_NAME` is optional; the tests will pass it through if provided.

## Test Fixtures
- `tests/e2e/extension.spec.ts` - main Playwright suite.
- `test/automation.html` - primary automation page used in e2e content script tests.
- `test/batch-translation.html` - manual batch-translation verification page.
- `test/mock-server.js` - local mock LLM server.
- `playwright.config.ts` - e2e config (single worker, 60s timeout, traces on failure).

## Debugging
- Playwright traces are saved under `test-results/` on failure.
- If you see "Extension build not found", run `npm run build` or set `EXTENSION_PATH`.
- The tests run a persistent Chrome context (`headless: false`) to allow MV3 extension loading.
