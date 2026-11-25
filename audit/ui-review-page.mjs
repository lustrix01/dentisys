// Builds the Owner's visual page for a ui-review report: each defect beside the screenshots it names,
// plus every captured state. No model involved; workers keep reading the .md only.
// Usage: node audit/ui-review-page.mjs audit-output/ui-review/<role>-<route> [review.md]
// Output: <folder>/<review name>.html (open it in a browser; images load from the same folder).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const [dir, reviewName = 'review.md'] = process.argv.slice(2);
if (!dir || !existsSync(join(dir, reviewName))) {
  console.error('Usage: node audit/ui-review-page.mjs audit-output/ui-review/<role>-<route> [review.md]');
  process.exit(1);
}
const DEVICES = { D: 'Desktop-1920', P: 'iPhone-393' };
const manifests = {};
for (const [code, folder] of Object.entries(DEVICES)) {
  const f = join(dir, folder, 'manifest.json');
  if (existsSync(f)) manifests[code] = JSON.parse(readFileSync(f, 'utf8'));
}
// manifest paths are repo-relative; the page sits in `dir`.
const rel = p => relative(dir, p).replace(/\\/g, '/');
const state = (code, id) => manifests[code]?.states.find(s => s.id === id);

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

// "Seen: D07 dark, P06 light" (current format); older reports: "Seen: iPhone 07, light and dark".
function shotsFor(line) {
  const m = line.match(/Seen:\s*(.*?)(?:\.\s+(?=[A-Z][a-z]+:)|$)/);
  if (!m || /from code, not seen/i.test(m[1])) return [];
  const seen = m[1], out = [];
  for (const [, d, id, theme] of seen.matchAll(/\b([DP])(\d{2})\s+(light|dark)\b/g)) out.push({ d, id, themes: [theme] });
  if (!out.length) {
    const themes = /\bdark\b/i.test(seen) && !/\blight\b/i.test(seen) ? ['dark']
      : /\blight\b/i.test(seen) && !/\bdark\b/i.test(seen) ? ['light'] : ['light', 'dark'];
    for (const [, dev, id] of seen.matchAll(/\b(Desktop|iPhone)\s+(\d{2})\b/g)) out.push({ d: dev[0] === 'D' ? 'D' : 'P', id, themes });
  }
  const shots = [];
  for (const o of out) {
    const s = state(o.d, o.id);
    if (!s) continue;
    for (const t of o.themes) shots.push({ src: rel(s[t]), focus: s.focus, cap: `${o.d === 'D' ? 'Desktop 1920' : 'iPhone 393'} · ${o.id} ${s.name} · ${t}` });
  }
  return shots.slice(0, 4);
}

// A thumbnail is a scroll box over the whole shot; it opens at the clicked control when the capture recorded one.
const fig = s => `<figure><a href="${esc(s.src)}" data-zoom${s.focus != null ? ` data-focus="${s.focus.toFixed(3)}"` : ''}><div class="thumb"><img loading="lazy" src="${esc(s.src)}" alt=""></div></a><figcaption>${esc(s.cap)}${s.focus != null ? ' · opens at the clicked control' : ''}</figcaption></figure>`;

// Minimal markdown: headings, bullets, numbered items, tables, paragraphs.
function block(lines) {
  const html = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
      html.push('<table>' + rows.filter(r => !/^\|[-\s|]+\|$/.test(r)).map((r, n) =>
        `<tr>${cells(r).map(c => n ? `<td>${c}</td>` : `<th>${c}</th>`).join('')}</tr>`).join('') + '</table>');
    } else if (/^\s*[-*] /.test(l)) html.push(`<li>${inline(l.replace(/^\s*[-*] /, ''))}</li>`);
    else if (/^\d+\. /.test(l)) html.push(`<li class="num">${inline(l)}</li>`);
    else if (/^### /.test(l)) html.push(`<h3>${inline(l.slice(4))}</h3>`);
    else if (l.trim()) html.push(`<p>${inline(l)}</p>`);
  }
  return html.join('\n').replace(/(<li[\s\S]*?<\/li>)(?!\n<li)/g, '$1</ul>').replace(/(^|\n)<li/g, '$1<ul><li').replace(/<\/li>\n<ul><li/g, '</li>\n<li');
}

const md = readFileSync(join(dir, reviewName), 'utf8').replace(/\r/g, '').split('\n');
const title = (md.find(l => l.startsWith('# ')) ?? '# UI review').slice(2);
const sections = [];
let cur = { name: 'Summary', lines: [] };
for (const l of md) {
  if (l.startsWith('# ')) continue;
  if (l.startsWith('## ')) { sections.push(cur); cur = { name: l.slice(3).trim(), lines: [] }; } else cur.lines.push(l);
}
sections.push(cur);

const counts = { High: 0, Medium: 0, Low: 0 };
const parts = [];
for (const s of sections) {
  if (!s.lines.some(l => l.trim())) continue;
  if (/^Defects/i.test(s.name)) {
    const cards = s.lines.filter(l => /^- \[(High|Medium|Low)\]/.test(l)).map(l => {
      const [, sev, kind, text] = l.match(/^- \[(High|Medium|Low)\]\s*([^:]+):\s*([\s\S]*)$/) ?? [, l.match(/\[(\w+)\]/)[1], '', l.slice(2)];
      counts[sev]++;
      const shots = shotsFor(l);
      return `<article class="card ${sev.toLowerCase()}" data-sev="${sev}"><header><span class="sev">${sev}</span> <span class="kind">${esc(kind.trim())}</span></header>
<p>${inline(text).replace(/\. (Seen|Code|Standard|Backlog|Fix|Existing layout):/g, '.<br><b>$1:</b>')}</p>
${shots.length ? `<div class="shots">${shots.map(fig).join('')}</div>` : '<p class="noshot">No screenshot: found in the code.</p>'}</article>`;
    });
    parts.push(`<section id="defects"><h2>${esc(s.name)}</h2>
<div class="filters">${Object.keys(counts).map(k => `<label><input type="checkbox" data-f="${k}" checked> ${k}</label>`).join('')}</div>
${cards.join('\n')}</section>`);
  } else if (!/^States seen/i.test(s.name)) {
    parts.push(`<section><h2>${esc(s.name)}</h2>${block(s.lines)}</section>`);
  }
}

const gallery = Object.entries(manifests).map(([code, m]) => `<h3>${esc(m.device)} — ${m.states.length} states</h3>
<div class="gallery">${m.states.map(s => `<div class="pair"><div class="pname">${code}${s.id} · ${esc(s.name)}</div>
${fig({ src: rel(s.light), focus: s.focus, cap: 'light' })}${fig({ src: rel(s.dark), focus: s.focus, cap: 'dark' })}</div>`).join('')}</div>`).join('');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
body{font:15px/1.5 system-ui,sans-serif;margin:0;background:#f6f7f9;color:#1e293b}
main{max-width:1280px;margin:auto;padding:24px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 12px}h3{font-size:15px;margin:20px 0 8px}
nav{position:sticky;top:0;background:#fff;border-bottom:1px solid #e2e8f0;padding:10px 24px;z-index:2;display:flex;gap:16px;flex-wrap:wrap}
nav a{color:#2563eb;text-decoration:none}.count{color:#64748b}
.card{background:#fff;border:1px solid #e2e8f0;border-left:5px solid #94a3b8;border-radius:8px;padding:14px 16px;margin:12px 0}
.card.high{border-left-color:#dc2626}.card.medium{border-left-color:#d97706}.card.low{border-left-color:#64748b}
.sev{font-weight:700}.high .sev{color:#dc2626}.medium .sev{color:#b45309}.low .sev{color:#475569}.kind{color:#64748b}
.shots,.gallery{display:flex;flex-wrap:wrap;gap:12px}
figure{margin:0;width:300px}.thumb{height:420px;overflow:auto;border:1px solid #cbd5e1;border-radius:6px;background:#fff}.thumb img{width:100%;display:block}
.pair .thumb{height:300px}
figcaption{font-size:12px;color:#64748b}.noshot{color:#64748b;font-style:italic}
.pair{display:flex;flex-wrap:wrap;gap:8px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px}
.pair figure{width:220px}.pname{width:100%;font-weight:600;font-size:13px}
code{background:#eef2f7;padding:0 4px;border-radius:4px;font-size:13px}
table{border-collapse:collapse;background:#fff}td,th{border:1px solid #e2e8f0;padding:4px 8px;font-size:13px;text-align:left}
.filters{display:flex;gap:16px;margin-bottom:8px}
#zoom{position:fixed;inset:0;background:rgba(15,23,42,.85);display:none;overflow:auto;z-index:5;cursor:zoom-out}
#zoom img{display:block;margin:24px auto;max-width:95vw}
</style></head><body>
<nav><b>${esc(title)}</b><a href="#defects">Defects <span class="count">(${counts.High} high, ${counts.Medium} medium, ${counts.Low} low)</span></a><a href="#states">All states</a></nav>
<main><h1>${esc(title)}</h1><p class="count">Built from ${esc(reviewName)} by audit/ui-review-page.mjs. Click a screenshot to see it full size.</p>
${parts.join('\n')}
<section id="states"><h2>All captured states</h2>${gallery}</section></main>
<div id="zoom"><img alt=""></div>
<script>
const z=document.getElementById('zoom');
const toFocus=(box,f)=>{if(f!=null)box.scrollTop=Math.max(0,f*box.scrollHeight-box.clientHeight/3)};
document.querySelectorAll('[data-focus]').forEach(a=>{const img=a.querySelector('img'),go=()=>toFocus(a.firstElementChild,+a.dataset.focus);img.complete?go():img.addEventListener('load',go)});
document.addEventListener('click',e=>{const a=e.target.closest('[data-zoom]');if(a){e.preventDefault();const img=z.firstElementChild;img.onload=()=>{z.scrollTop=0;toFocus(z,a.dataset.focus==null?null:+a.dataset.focus)};img.src=a.href;z.style.display='block'}else if(e.target.closest('#zoom'))z.style.display='none'});
document.addEventListener('keydown',e=>{if(e.key==='Escape')z.style.display='none'});
document.querySelectorAll('[data-f]').forEach(c=>c.addEventListener('change',()=>{const on=[...document.querySelectorAll('[data-f]:checked')].map(x=>x.dataset.f);document.querySelectorAll('.card').forEach(k=>k.hidden=!on.includes(k.dataset.sev))}));
</script></body></html>`;

const out = join(dir, reviewName.replace(/\.md$/, '') + '.html');
writeFileSync(out, html, 'utf8');
console.log(`${out}: ${counts.High + counts.Medium + counts.Low} defects (${counts.High} high), ${Object.values(manifests).reduce((n, m) => n + m.states.length, 0)} states`);
