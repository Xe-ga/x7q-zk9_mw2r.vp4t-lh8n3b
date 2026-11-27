// @ts-check
import { defineConfig } from 'astro/config';

// SITE_URL и BASE_PATH подставляет GitHub Actions при публикации
// (см. .github/workflows/deploy.yml). Локально работает как есть.
const site = process.env.SITE_URL || 'http://localhost:4321';
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  // панель разработчика Astro внизу экрана при локальном запуске — не нужна
  devToolbar: { enabled: false },
  build: { format: 'directory' },
});
