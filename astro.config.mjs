import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Using a custom domain later? Set `site` to it and remove `base`.
export default defineConfig({
  site: 'https://botvillan.github.io',
  base: '/landing_zone',
  integrations: [sitemap()],
  markdown: { shikiConfig: { theme: 'github-dark-dimmed' } },
});
