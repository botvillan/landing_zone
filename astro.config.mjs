import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkObsidian from './src/plugins/remark-obsidian.mjs';

export default defineConfig({
  site: 'https://samuelaravinth.online',
  integrations: [sitemap()],
  markdown: {
    remarkPlugins: [remarkObsidian],
    shikiConfig: { theme: 'github-dark-dimmed' },
  },
});
