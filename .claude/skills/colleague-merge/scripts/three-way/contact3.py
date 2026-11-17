"""Three-column contact sheets (ours | theirs | merged) for every key in rows.json, so you can check the
freshly captured theirs column before publishing. Writes <outDir>/contact/<key>.png and the stamp
<outDir>/contact3.ok that build.py requires.

usage: python contact3.py <rows.json> <outDir>
Open every sheet with the Read tool before running build.py."""
import json, os, sys
from PIL import Image, ImageDraw

if len(sys.argv) < 3:
    sys.exit(__doc__)
cfg = json.load(open(sys.argv[1], encoding='utf-8'))
out = os.path.join(os.path.abspath(sys.argv[2]), 'contact')
os.makedirs(out, exist_ok=True)
SIDES = ('ours', 'theirs', 'merged')
W = 480  # each column

keys = sorted({k for r in cfg['rows'] for k in r.get('keys', [])})
meta = os.path.join(cfg['shots']['merged'], 'meta')
problems = []
for key in keys:
    names = sorted(f[:-5] for f in os.listdir(meta) if f.endswith('.json') and f[:-5].rsplit('-', 2)[0] == key)
    if not names:
        problems.append(f'{key}: no merged shots'); continue
    rows = []
    for n in names:
        cells = []
        for s in SIDES:
            p = os.path.join(cfg['shots'][s], 'crop', n + '.png')
            if not os.path.exists(p):
                problems.append(f'{n}: missing on {s}'); cells = None; break
            im = Image.open(p).convert('RGB')
            cells.append(im.resize((W, max(1, round(im.height * W / im.width)))))
        if cells:
            rows.append((n, cells))
    if not rows:
        continue
    h = sum(22 + max(c.height for c in cells) for _, cells in rows)
    sheet = Image.new('RGB', (W * 3 + 20, h), 'white')
    d, y = ImageDraw.Draw(sheet), 0
    for n, cells in rows:
        d.text((4, y + 4), f'{n}    ours | theirs | merged', fill='black')
        for i, c in enumerate(cells):
            sheet.paste(c, (i * (W + 10), y + 22))
        y += 22 + max(c.height for c in cells)
    sheet.save(os.path.join(out, key + '.png'))

for p in problems:
    print('FAIL', p)
if problems:
    sys.exit(1)
open(os.path.join(os.path.dirname(out), 'contact3.ok'), 'w').write('sheets written; read each one before publishing\n')
print(f'{len(keys)} sheets in {out} - open each one with the Read tool before build.py')
