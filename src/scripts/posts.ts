import { getCollection } from 'astro:content';
export const getPosts = async () =>
  (await getCollection('blog', (p) => !p.data.draft)).sort((a, b) => +b.data.date - +a.data.date);
export const getProjects = async () =>
  (await getCollection('projects', (p) => !p.data.draft)).sort((a, b) => a.data.order - b.data.order);
export const readingTime = (body: string | undefined) =>
  `${Math.max(1, Math.round((body ?? '').trim().split(/\s+/).length / 220))} min read`;
export const formatDate = (d: Date, month: 'short' | 'long' = 'short') =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month, year: 'numeric', timeZone: 'UTC' }).format(d);
