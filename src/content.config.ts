import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Notes come from an Obsidian folder, so every field is forgiving:
// anything missing gets a sensible fallback instead of failing the build.
// Files whose names start with "_" are not published (handy for templates and drafts).
const pattern = '**/[^_]*.md';

const list = z.preprocess(
  (v) => (v == null ? [] : Array.isArray(v) ? v.flat().filter((x) => x != null).map(String) : String(v).split(',').map((s) => s.trim()).filter(Boolean)),
  z.array(z.string()),
).default([]);
const text = z.preprocess((v) => (v == null || v === '' ? undefined : String(v)), z.string().optional());
const date = z.preprocess((v) => (v == null || v === '' ? undefined : v), z.coerce.date().optional());
const bool = z.preprocess((v) => v === true || v === 'true' || v === 'yes', z.boolean()).default(false);
const common = {
  title: text,
  cover: z.any().optional(),
  image: z.any().optional(),
  banner: z.any().optional(),
  theme: text,
  draft: bool,
};

const blog = defineCollection({
  loader: glob({ pattern, base: './src/content/blog' }),
  schema: z.object({
    ...common,
    description: text,
    date,
    created: date,
    tags: list,
  }),
});

const projects = defineCollection({
  loader: glob({ pattern, base: './src/content/projects' }),
  schema: z.object({
    ...common,
    summary: text,
    description: text,
    stack: list,
    tags: list,
    order: z.coerce.number().default(100),
  }),
});

export const collections = { blog, projects };
