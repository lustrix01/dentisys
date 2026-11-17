"""Build the three-way comparison page: ours | theirs | merged, one block per change.
Images are written next to the page (img/) and published as supporting files, so the page stays small.

usage: python build.py <rows.json> <outDir>
rows.json:
{
  "title": "Owhie Merge Comparison",
  "lede": "Every change in ... (plain text)",
  "labels": {"ours": "Your branch today", "theirs": "Owhie's branch", "merged": "Merged proposal"},
  "shots": {"ours": "<shotsDir>/before", "theirs": "<shotsDir>-theirs/after", "merged": "<shotsDir>/after"},
  "rows": [{"id": "L1", "area": "Landing page", "theirs": "what they did", "merged": "what the merge has",
            "status": "asis|changed|replaced|added|skipped", "keys": ["landing"]}]
}
"keys" are shots.mjs target ids; each device/theme shot of a key becomes one row of three images.
Run contact3.py first (and read its sheets); this script refuses to build without its fresh stamp.
Up to 12 MB of images are embedded in the page (publish the page alone). Above that the images stay in
<outDir>/img/ and files.json holds the Artifact `files` list (publish with root = outDir)."""
import base64, html, json, os, sys
from PIL import Image

if len(sys.argv) < 3:
    sys.exit(__doc__)
cfg = json.load(open(sys.argv[1], encoding='utf-8'))
out = os.path.abspath(sys.argv[2])
os.makedirs(os.path.join(out, 'img'), exist_ok=True)
here = os.path.dirname(os.path.abspath(__file__))
stamp = os.path.join(out, 'contact3.ok')
newest = max(os.path.getmtime(os.path.join(dp, f)) for side in ('ours', 'theirs', 'merged')
             for dp, _, fs in os.walk(cfg['shots'][side]) for f in fs if f.endswith('.png'))
if not os.path.exists(stamp) or os.path.getmtime(stamp) < newest:
    sys.exit('run contact3.py and read its sheets first (no contact3.ok newer than the last capture)')
SIDES = ('ours', 'theirs', 'merged')
ST = {'asis': 'Taken as-is', 'changed': 'Taken, changed first', 'replaced': 'Not taken, replaced', 'added': 'Added by us', 'skipped': 'Not taken'}
E = html.escape

def names_for(key):
    meta = os.path.join(cfg['shots']['merged'], 'meta')
    found = [f[:-5] for f in os.listdir(meta) if f.endswith('.json') and f[:-5].rsplit('-', 2)[0] == key]
    missing = [s for s in SIDES for n in found if not os.path.exists(os.path.join(cfg['shots'][s], 'crop', n + '.png'))]
    if not found or missing:
        sys.exit(f'key {key}: shots missing ({missing or "none captured"}) - run shots.mjs for every side first')
    return sorted(found, key=lambda n: 'Desktop' not in n)

def save(side, kind, name, maxw):
    im = Image.open(os.path.join(cfg['shots'][side], kind, name + '.png')).convert('RGB')
    if im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    rel = f'img/{side}-{kind}-{name}.jpg'
    im.save(os.path.join(out, rel), 'JPEG', quality=78, optimize=True)
    return rel, im.width, im.height

def fig(side, d):
    (c, cw, ch), (v, vw, vh) = d['crop'], d['vp']
    label = E(cfg['labels'][side])
    cls = 'owhie' if side == 'theirs' else side  # page.html colours the colleague column with .owhie
    return (f'<figure class="pane {cls}"><figcaption>{label}</figcaption><button class="shot" type="button" aria-label="Enlarge {label}">'
            f'<img loading="lazy" data-crop="{c}" data-vp="{v}" width="{cw}" height="{ch}" data-cw="{cw}" data-ch="{ch}" '
            f'data-vw="{vw}" data-vh="{vh}" alt="{label}"></button></figure>')

files, items, counts = [], [], {k: 0 for k in ST}
for r in cfg['rows']:
    st = r['status']
    if st not in ST:
        sys.exit(f'row {r["id"]}: unknown status {st}')
    counts[st] += 1
    parts = [f'<article class="item" id="{E(r["id"])}" data-status="{st}"><header class="item-head"><span class="rid">{E(r["id"])}</span>'
             f'<h3>{E(r["area"])}</h3><span class="pill {st}">{ST[st]}</span></header>'
             f'<dl class="what"><div><dt>{E(cfg["labels"]["theirs"])}</dt><dd>{E(r["theirs"])}</dd></div>'
             f'<div><dt>{E(cfg["labels"]["merged"])}</dt><dd>{E(r["merged"])}</dd></div></dl>']
    keys = r.get('keys', [])
    for key in keys:
        for name in names_for(key):
            trio = {}
            for side in SIDES:
                trio[side] = {'crop': save(side, 'crop', name, 900), 'vp': save(side, 'vp', name, 1100)}
                files += [trio[side]['crop'][0], trio[side]['vp'][0]]
            dev = 'Phone' if 'iPhone' in name or 'Galaxy' in name else 'Laptop'
            parts.append(f'<div class="trio"><p class="dev">{dev}</p><div class="grid3">{fig("ours", trio["ours"])}{fig("theirs", trio["theirs"])}{fig("merged", trio["merged"])}</div></div>')
    if not keys:
        parts.append('<p class="noshot">No screenshot: not visible on screen, or already shown in another item.</p>')
    items.append(''.join(parts) + '</article>')

rows = ''.join(f'<tr data-status="{r["status"]}"><td class="rid"><a href="#{E(r["id"])}">{E(r["id"])}</a></td><td>{E(r["area"])}</td>'
               f'<td><span class="pill {r["status"]}">{ST[r["status"]]}</span></td></tr>' for r in cfg['rows'])
chips = ''.join(f'<button type="button" class="chip {k}" data-filter="{k}" aria-pressed="false"><b>{counts[k]}</b> {ST[k]}</button>' for k in ST if counts[k])
page = open(os.path.join(here, 'page.html'), encoding='utf-8').read()
for a, b in (('__TITLE__', E(cfg['title'])), ('__LEDE__', E(cfg['lede'])), ('__L_OURS__', E(cfg['labels']['ours'])),
             ('__L_THEIRS__', E(cfg['labels']['theirs'])), ('__L_MERGED__', E(cfg['labels']['merged'])),
             ('<!--SUMMARY-->', chips), ('<!--ROWS-->', rows), ('<!--ITEMS-->', ''.join(items))):
    page = page.replace(a, b)
name = cfg['title'].lower().replace(' ', '-') + '.html'
files = sorted(set(files))
size = sum(os.path.getsize(os.path.join(out, f)) for f in files) / 1e6
inline = size <= 12  # data URIs grow ~4/3; 12 MB of JPEG stays under the 16 MB page limit
if inline:
    for f in files:
        page = page.replace(f'"{f}"', '"data:image/jpeg;base64,' + base64.b64encode(open(os.path.join(out, f), 'rb').read()).decode() + '"')
open(os.path.join(out, name), 'w', encoding='utf-8').write(page)
json.dump([] if inline else [{'path': f} for f in files], open(os.path.join(out, 'files.json'), 'w'))
print(f'page: {os.path.join(out, name)}')
print(f'{len(files)} images, {size:.1f} MB, {counts}')
print('images embedded: publish the page alone' if inline else
      f'images as files: publish with root={out} and files = contents of files.json' + ('  (OVER 255: publish in two calls)' if len(files) > 255 else ''))
