/**
 * WXT background entrypoint that reuses the existing service worker logic.
 */
import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground({
  main: async () => {
    await import('../js/background');
  },
});
