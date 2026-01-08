/**
 * WXT content script entrypoint that wraps the existing implementation and vendor bundles.
 */
import { defineContentScript } from 'wxt/utils/define-content-script';
import '../css/content.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main: async () => {
    await import('../vendor/segmentit.bundle.js');
    await import('../vendor/toon.bundle.js');
    await import('../js/content');
  },
});
