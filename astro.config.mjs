import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Obsidian syntax (![[image.png]], [[links]]) is converted by scripts/obsidian-prep.mjs,
// which the GitHub workflow runs before the build.
export default defineConfig({
  site: 'https://samuelaravinth.online',
  integrations: [sitemap()],
  markdown: { shikiConfig: { theme: 'github-dark-dimmed' } },
});
