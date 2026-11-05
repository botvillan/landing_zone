// Converts Obsidian-flavoured Markdown into standard Markdown before the site is built.
// It runs in GitHub Actions on the build's own copy of the repository, so your notes are never changed.
//   ![[image.png]] and ![[image.png|alt]]  ->  ![alt](<./attachments/image.png>)
//   [[Note]] and [[Note|label]]            ->  label
//   image paths are found anywhere under src/content; missing images become a placeholder
// Code blocks and inline code are left alone.
import fs from 'node:fs';
import path from 'node:path';

export const IMAGE = /\.(png|jpe?g|webp|avif|gif|svg)$/i;
export const MISSING = '/images/missing-image.svg';

const decode = (s) => { try { return decodeURI(s); } catch { return s; } };

export function makeResolver({ exists, findByName, contentDir }) {
  return function resolve(raw, fileDir) {
    if (!raw) return MISSING;
    if (/^([a-z]+:)?\/\//i.test(raw) || raw.startsWith('/') || raw.startsWith('data:') || raw.startsWith('#')) return raw;
    const ref = decode(raw.split('#')[0].split('?')[0]).trim();
    const found = [path.resolve(fileDir, ref), path.resolve(contentDir, ref)].find(exists) ?? findByName(path.basename(ref));
    if (!found) return MISSING;
    const rel = path.relative(fileDir, found).split(path.sep).join('/');
    return rel.startsWith('.') ? rel : `./${rel}`;
  };
}

const wrap = (url) => (/[\s()<>]/.test(url) ? `<${url}>` : url);

function transformText(text, fileDir, resolve) {
  // Obsidian embeds and wikilinks.
  text = text.replace(/(!?)\[\[([^\]\n]+?)\]\]/g, (_, bang, inner) => {
    const [target, ...rest] = inner.split('|');
    const label = rest.join('|').trim();
    if (bang && IMAGE.test(target.trim())) {
      const alt = label && !/^\d+(x\d+)?$/.test(label) ? label : '';
      return `![${alt.replace(/[[\]]/g, '')}](${wrap(resolve(target.trim(), fileDir))})`;
    }
    return label || target.split('#')[0].trim() || target.trim();
  });
  // Standard Markdown images: make relative paths point at the real file.
  return text.replace(/!\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(\s+"[^"]*")?\s*\)/g, (all, alt, url, title = '') => {
    const raw = url.startsWith('<') ? url.slice(1, -1) : url;
    return `![${alt}](${wrap(resolve(raw, fileDir))}${title})`;
  });
}

export function transformMarkdown(source, filePath, resolve) {
  const fileDir = path.dirname(filePath);
  let body = source, front = '';
  const fm = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (fm) { front = fm[0]; body = source.slice(front.length); }
  let fence = null;
  const lines = body.split('\n').map((line) => {
    const open = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) { if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null; return line; }
    if (open) { fence = open[1]; return line; }
    // Leave inline code spans untouched.
    return line.split(/(`+[^`]*?`+)/).map((part, i) => (i % 2 ? part : transformText(part, fileDir, resolve))).join('');
  });
  return front + lines.join('\n');
}

function main() {
  const contentDir = path.resolve('src/content');
  const all = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full); else all.push(full);
    }
  };
  walk(contentDir);
  const byName = new Map();
  for (const f of all) if (IMAGE.test(f) && !byName.has(path.basename(f).toLowerCase())) byName.set(path.basename(f).toLowerCase(), f);
  const resolve = makeResolver({
    contentDir,
    exists: (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } },
    findByName: (n) => byName.get(n.toLowerCase()),
  });
  let changed = 0, missing = 0;
  for (const f of all.filter((f) => f.endsWith('.md'))) {
    const src = fs.readFileSync(f, 'utf8');
    const out = transformMarkdown(src, f, resolve);
    if (out !== src) { fs.writeFileSync(f, out); changed++; }
    const m = out.split(MISSING).length - 1;
    if (m) { missing += m; console.warn(`Missing image(s) in ${path.relative(process.cwd(), f)}: ${m}`); }
  }
  console.log(`Obsidian prep: ${changed} note(s) converted, ${missing} missing image(s) replaced with a placeholder.`);
}

if (!globalThis.__OBSIDIAN_PREP_TEST__) main();
