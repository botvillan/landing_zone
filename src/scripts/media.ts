// Cover images and generated thumbnails for posts and projects.
// Accepts Obsidian-style references: "[[image.png]]", "attachments/image.png", "![](image.png)" or a full URL.
import type { ImageMetadata } from 'astro';

const files = import.meta.glob<{ default: ImageMetadata }>(
  '/src/content/**/*.{png,jpg,jpeg,webp,avif,gif,PNG,JPG,JPEG,WEBP,AVIF,GIF}',
  { eager: true },
);
const byPath = new Map<string, ImageMetadata>();
const byName = new Map<string, ImageMetadata>();
for (const [key, mod] of Object.entries(files)) {
  const p = key.replace(/^\/+/, '').toLowerCase();
  byPath.set(p, mod.default);
  const name = p.split('/').pop()!;
  if (!byName.has(name)) byName.set(name, mod.default);
}

export type Cover = { type: 'local'; src: ImageMetadata } | { type: 'url'; src: string } | null;

/** Turns any Obsidian or Markdown image reference into a plain path or URL. */
export function cleanRef(value: unknown): string | undefined {
  let v: unknown = value;
  while (Array.isArray(v)) v = v[0];
  if (typeof v !== 'string') return undefined;
  let s = v.trim();
  const md = s.match(/^!?\[[^\]]*\]\(([^)]+)\)$/);
  if (md) s = md[1].trim().replace(/^<|>$/g, '').replace(/\s+"[^"]*"$/, '');
  s = s.replace(/^!?\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
  try { s = decodeURI(s); } catch { /* keep as is */ }
  return s || undefined;
}

const normalize = (p: string) => {
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop(); else out.push(seg);
  }
  return out.join('/');
};

export function resolveImage(value: unknown, filePath?: string): Cover {
  const ref = cleanRef(value);
  if (!ref) return null;
  if (/^(https?:)?\/\//i.test(ref) || ref.startsWith('/')) return { type: 'url', src: ref };
  const dir = (filePath ?? '').replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  const local = byPath.get(normalize(`${dir}/${ref}`).toLowerCase())
    ?? byPath.get(normalize(`src/content/${ref}`).toLowerCase())
    ?? byName.get(ref.split('/').pop()!.toLowerCase());
  return local ? { type: 'local', src: local } : null;
}

const firstBodyImage = (body?: string) => {
  const m = (body ?? '').match(/!\[\[([^\]|]+?\.(?:png|jpe?g|webp|avif|gif))(?:\|[^\]]*)?\]\]|!\[[^\]]*\]\(([^)]+)\)/i);
  if (!m) return undefined;
  return m[1] ?? m[2].trim().replace(/^<([^>]*)>.*$/, '$1').replace(/\s+["'(].*$/, '');
};

export type Entry = { id: string; collection: string; filePath?: string; body?: string; data: Record<string, any> };

/** The cover set in frontmatter (cover, image or banner), else the first image in the text. */
export function coverOf(entry: Entry): Cover {
  return resolveImage(entry.data.cover ?? entry.data.image ?? entry.data.banner, entry.filePath)
    ?? resolveImage(firstBodyImage(entry.body), entry.filePath);
}

export type Theme = 'data' | 'automation' | 'homelab' | 'notes';
const THEMES: [Theme, RegExp][] = [
  ['data', /data|sql|etl|elt|pipeline|spark|airflow|dbt|warehouse|lake|kafka|pandas|analytics|bigquery|snowflake|postgres|duckdb/],
  ['automation', /automat|n8n|script|cron|home ?assistant|workflow|bot|ansible|esp32|iot|zapier|python|bash|powershell|node-?red|microcontroller/],
  ['homelab', /homelab|docker|proxmox|server|network|nas|kubernetes|k8s|k3s|self-?host|traefik|linux|truenas|unraid|container|router|tailscale|jellyfin/],
];
export function themeOf(entry: Entry): Theme {
  const t = entry.data.theme;
  if (t === 'data' || t === 'automation' || t === 'homelab' || t === 'notes') return t;
  const text = [...(entry.data.tags ?? []), ...(entry.data.stack ?? []), entry.data.title ?? '', entry.id].join(' ').toLowerCase();
  return THEMES.find(([, re]) => re.test(text))?.[0] ?? 'notes';
}

// Seeded random numbers, so each post always gets the same artwork.
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const PALETTE: Record<Theme, [string, string, string]> = {
  data: ['#22d3ee', '#8ea2ff', '#0b1220'],
  automation: ['#c4b5fd', '#f0abfc', '#130d1f'],
  homelab: ['#4ade80', '#22d3ee', '#07140f'],
  notes: ['#8ea2ff', '#fbbf24', '#0f0f17'],
};

/** A generated SVG thumbnail (1200 x 675) themed by the entry's tags. */
export function artSvg(entry: Entry): string {
  const theme = themeOf(entry);
  const [a, b, bg] = PALETTE[theme];
  const seed = hash(`${entry.collection}/${entry.id}`);
  const r = rng(seed);
  const id = `g${seed.toString(36)}`;
  const W = 1200, H = 675;
  const f = (n: number) => n.toFixed(1);
  let art = '';

  if (theme === 'data') {
    // Flowing pipelines feeding a bar chart.
    for (let i = 0; i < 9; i++) {
      const y0 = 80 + r() * 520, y1 = 120 + r() * 440, y2 = 200 + r() * 300;
      art += `<path d="M-20 ${f(y0)} C 300 ${f(y1)}, 520 ${f(y2)}, 760 ${f(260 + i * 22)}" stroke="url(#${id}l)" stroke-width="${f(1.5 + r() * 3)}" fill="none" opacity="${f(0.35 + r() * 0.5)}"/>`;
      if (r() > 0.4) art += `<circle cx="${f(200 + r() * 500)}" cy="${f(y1)}" r="${f(3 + r() * 4)}" fill="${a}" opacity="0.9"/>`;
    }
    for (let i = 0; i < 7; i++) {
      const h = 80 + r() * 300;
      art += `<rect x="${f(800 + i * 48)}" y="${f(520 - h)}" width="30" height="${f(h)}" rx="6" fill="url(#${id}l)" opacity="${f(0.55 + i * 0.06)}"/>`;
    }
    art += `<line x1="780" y1="530" x2="1150" y2="530" stroke="${a}" stroke-opacity="0.4" stroke-width="2"/>`;
  } else if (theme === 'automation') {
    // A workflow graph of connected nodes, with a gear.
    const nodes = Array.from({ length: 11 }, (_, i) => ({ x: 120 + (i % 4) * 300 + r() * 120 - 60, y: 110 + Math.floor(i / 4) * 210 + r() * 80 - 40 }));
    nodes.forEach((n, i) => {
      const m = nodes[(i + 1 + Math.floor(r() * 3)) % nodes.length];
      art += `<path d="M${f(n.x)} ${f(n.y)} C ${f((n.x + m.x) / 2)} ${f(n.y)}, ${f((n.x + m.x) / 2)} ${f(m.y)}, ${f(m.x)} ${f(m.y)}" stroke="url(#${id}l)" stroke-width="2.5" fill="none" opacity="0.6"/>`;
    });
    nodes.forEach((n, i) => {
      const c1 = i % 2 ? a : b;
      art += i % 3 === 0
        ? `<rect x="${f(n.x - 46)}" y="${f(n.y - 26)}" width="92" height="52" rx="14" fill="${bg}" stroke="${c1}" stroke-width="2.5"/><circle cx="${f(n.x - 22)}" cy="${f(n.y)}" r="7" fill="${c1}"/><rect x="${f(n.x - 8)}" y="${f(n.y - 4)}" width="36" height="8" rx="4" fill="${a}" opacity="0.5"/>`
        : `<circle cx="${f(n.x)}" cy="${f(n.y)}" r="${f(10 + r() * 8)}" fill="${bg}" stroke="${c1}" stroke-width="2.5"/><circle cx="${f(n.x)}" cy="${f(n.y)}" r="4" fill="${a}"/>`;
    });
    const cx = 1010 + r() * 60, cy = 470 + r() * 60, teeth = 10;
    let gear = '';
    for (let t = 0; t < teeth * 2; t++) {
      const ang = (t / (teeth * 2)) * Math.PI * 2, rad = t % 2 ? 92 : 110;
      gear += `${t ? 'L' : 'M'}${f(cx + Math.cos(ang) * rad)} ${f(cy + Math.sin(ang) * rad)} `;
    }
    art += `<path d="${gear}Z" fill="none" stroke="${b}" stroke-width="3" opacity="0.45"/><circle cx="${f(cx)}" cy="${f(cy)}" r="38" fill="none" stroke="${b}" stroke-width="3" opacity="0.45"/>`;
  } else if (theme === 'homelab') {
    // A server rack with status lights.
    const x = 330 + r() * 120, units = 7;
    art += `<rect x="${f(x - 24)}" y="70" width="568" height="${units * 74 + 30}" rx="22" fill="${bg}" stroke="${a}" stroke-opacity="0.35" stroke-width="2"/>`;
    for (let u = 0; u < units; u++) {
      const y = 88 + u * 74;
      art += `<rect x="${f(x)}" y="${y}" width="520" height="58" rx="10" fill="#ffffff" fill-opacity="0.04" stroke="#ffffff" stroke-opacity="0.1"/>`;
      for (let l = 0; l < 3; l++) art += `<circle cx="${f(x + 28 + l * 22)}" cy="${y + 29}" r="5" fill="${r() > 0.3 ? (l ? b : a) : '#3f3f46'}"/>`;
      for (let v = 0; v < 14; v++) art += `<rect x="${f(x + 130 + v * 18)}" y="${y + 18}" width="8" height="22" rx="3" fill="#ffffff" fill-opacity="${f(0.06 + r() * 0.1)}"/>`;
      art += `<rect x="${f(x + 410)}" y="${y + 22}" width="${f(40 + r() * 50)}" height="14" rx="7" fill="url(#${id}l)" opacity="0.8"/>`;
    }
    for (let i = 0; i < 6; i++) art += `<path d="M${f(x + 544)} ${f(130 + i * 70)} C ${f(x + 640)} ${f(130 + i * 70)}, ${f(x + 640)} ${f(560 + r() * 60)}, 1220 ${f(560 + r() * 80)}" stroke="${i % 2 ? a : b}" stroke-width="2" fill="none" opacity="0.4"/>`;
  } else {
    // Notes: a dot grid with soft orbits.
    for (let gx = 0; gx < 24; gx++) for (let gy = 0; gy < 14; gy++) {
      if (r() > 0.55) art += `<circle cx="${30 + gx * 50}" cy="${30 + gy * 50}" r="${f(1 + r() * 2.5)}" fill="${r() > 0.85 ? b : a}" opacity="${f(0.2 + r() * 0.6)}"/>`;
    }
    art += `<circle cx="${f(500 + r() * 200)}" cy="337" r="210" fill="none" stroke="url(#${id}l)" stroke-width="3" opacity="0.6"/><circle cx="${f(560 + r() * 200)}" cy="${f(280 + r() * 100)}" r="120" fill="none" stroke="${b}" stroke-width="2" opacity="0.35"/>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}l" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="${id}r" cx="${f(0.2 + r() * 0.6)}" cy="${f(0.2 + r() * 0.4)}" r="0.8"><stop offset="0" stop-color="${a}" stop-opacity="0.28"/><stop offset="1" stop-color="${bg}" stop-opacity="0"/></radialGradient><pattern id="${id}p" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#ffffff" stroke-opacity="0.04"/></pattern></defs><rect width="${W}" height="${H}" fill="${bg}"/><rect width="${W}" height="${H}" fill="url(#${id}p)"/><rect width="${W}" height="${H}" fill="url(#${id}r)"/>${art}</svg>`;
}
