import fs from 'node:fs';
import { getCollection } from 'astro:content';

// Fills in anything an Obsidian note left out, so pages always have a title, summary and date.
const pretty = (id: string) => {
  const s = (id.split('/').pop() ?? id).replace(/[-_]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const excerpt = (body = '', max = 160) => {
  const plain = body
    .replace(/^---[\s\S]*?---/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a, b) => b || a)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s.*$/gm, ' ')
    .replace(/[*_`>#~=-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max).replace(/\s+\S*$/, '')}…` : plain;
};
const fileDate = (filePath?: string) => {
  try { return filePath ? fs.statSync(filePath).mtime : new Date(); } catch { return new Date(); }
};

export const getPosts = async () => {
  const posts = await getCollection('blog', (p) => !p.data.draft);
  return posts
    .map((p) => ({
      ...p,
      data: {
        ...p.data,
        title: p.data.title ?? pretty(p.id),
        description: p.data.description ?? excerpt(p.body),
        date: p.data.date ?? p.data.created ?? fileDate(p.filePath),
      },
    }))
    .sort((a, b) => +b.data.date - +a.data.date);
};

export const getProjects = async () => {
  const projects = await getCollection('projects', (p) => !p.data.draft);
  return projects
    .map((p) => ({
      ...p,
      data: {
        ...p.data,
        title: p.data.title ?? pretty(p.id),
        summary: p.data.summary ?? p.data.description ?? excerpt(p.body),
        stack: p.data.stack.length ? p.data.stack : p.data.tags,
      },
    }))
    .sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
};

export const readingTime = (body: string | undefined) =>
  `${Math.max(1, Math.round((body ?? '').trim().split(/\s+/).length / 220))} min read`;
export const formatDate = (d: Date, month: 'short' | 'long' = 'short') =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month, year: 'numeric', timeZone: 'UTC' }).format(d);
