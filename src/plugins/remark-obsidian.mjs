// Makes Markdown written in Obsidian work on the site:
// - ![[image.png]] and ![[image.png|alt text]] become images
// - [[Note]] and [[Note|label]] become plain text (the label)
// - image paths are found anywhere under src/content, so attachment folders just work
// - a missing image becomes a placeholder instead of failing the build
import fs from 'node:fs';
import path from 'node:path';

const CONTENT = path.resolve('src/content');
const IMAGE = /\.(png|jpe?g|webp|avif|gif|svg)$/i;
const MISSING = '/images/missing-image.svg';

let index = null;
let indexedAt = 0;
function findByName(name) {
  // Rebuild the file list at most every few seconds (cheap, and keeps dev mode fresh).
  if (!index || Date.now() - indexedAt > 3000) {
    index = new Map();
    const walk = (dir) => {
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (IMAGE.test(e.name) && !index.has(e.name.toLowerCase())) index.set(e.name.toLowerCase(), full);
      }
    };
    walk(CONTENT);
    indexedAt = Date.now();
  }
  return index.get(name.toLowerCase());
}

const decode = (s) => { try { return decodeURI(s); } catch { return s; } };

function resolveUrl(raw, dir) {
  if (!raw || /^([a-z]+:)?\/\//i.test(raw) || raw.startsWith('/') || raw.startsWith('data:') || raw.startsWith('#')) return raw;
  const ref = decode(raw.split('#')[0].split('?')[0]);
  const candidates = [];
  if (dir) candidates.push(path.resolve(dir, ref));
  candidates.push(path.resolve(CONTENT, ref));
  let found = candidates.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
  if (!found) found = findByName(path.basename(ref));
  if (!found) return MISSING;
  if (!dir) return MISSING;
  const rel = path.relative(dir, found).split(path.sep).join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

const WIKI = /(!?)\[\[([^\]\n]+?)\]\]/g;

function splitText(value) {
  const out = [];
  let last = 0;
  for (const m of value.matchAll(WIKI)) {
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) });
    const [target, ...rest] = m[2].split('|');
    const label = rest.join('|').trim();
    if (m[1] && IMAGE.test(target.trim())) {
      // A number after the pipe is an Obsidian width, not alt text.
      out.push({ type: 'image', url: target.trim(), alt: label && !/^\d+(x\d+)?$/.test(label) ? label : '', obsidian: true });
    } else {
      out.push({ type: 'text', value: label || target.split('#')[0].trim() || target.trim() });
    }
    last = m.index + m[0].length;
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

export default function remarkObsidian() {
  return (tree, file) => {
    let dir = null;
    try {
      const p = file?.path || file?.history?.[0];
      if (p) dir = path.dirname(p.startsWith('file:') ? new URL(p).pathname.replace(/^\/([a-z]:)/i, '$1') : p);
    } catch { dir = null; }

    const visit = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      const next = [];
      for (const child of node.children) {
        if (child.type === 'text' && child.value.includes('[[')) next.push(...splitText(child.value));
        else { visit(child); next.push(child); }
      }
      node.children = next;
      for (const child of node.children) {
        if (child.type === 'image') {
          try { child.url = resolveUrl(child.url, dir); } catch { child.url = MISSING; }
          delete child.obsidian;
        }
      }
    };
    try { visit(tree); } catch { /* never break the build over formatting */ }
  };
}
