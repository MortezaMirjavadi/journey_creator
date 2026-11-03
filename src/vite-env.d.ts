/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MARCO_API_MODE?: 'mock' | 'http';
  readonly VITE_MARCO_API_BASE?: string;
  readonly VITE_MARCO_USER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
