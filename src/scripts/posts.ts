import { getCollection } from 'astro:content';
export const getPosts = async () =>
  (await getCollection('blog', (p) => !p.data.draft)).sort((a, b) => +b.data.date - +a.data.date);
export const getProjects = async () =>
  (await getCollection('projects', (p) => !p.data.draft)).sort((a, b) => a.data.order - b.data.order);
