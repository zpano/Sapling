interface ImportMetaEnv {
  // 兼容 Vite/WXT 的默认环境变量（避免未引入 vite/client 类型时缺失）
  readonly BASE_URL?: string;
  readonly MODE?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR?: boolean;

  readonly VITE_SAPLING_API_ENDPOINT?: string;
  readonly VITE_SAPLING_MODEL_NAME?: string;
  readonly VITE_SAPLING_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
