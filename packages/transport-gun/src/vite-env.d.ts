// vite injects import.meta.env at build time. vite/client isn't a dependency of
// this package, so declare the minimal shape here instead of referencing it.
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly [key: `VITE_${string}`]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
