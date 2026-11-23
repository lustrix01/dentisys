"""Prove each Before/version pair shows what the demo says it shows, before anything is published.

usage: python verify.py <shotsDir> [--fixes demo.json]
  shotsDir is the outDir given to shots.mjs (holds before/ plus after/, or the options A/, B/ ...).
  Every version folder is checked against before/.
  --fixes: optional demo.json; then every fix key must have shots and every shot must belong to a fix.

Checks per shot name (id-Device-theme) and version:
  FAIL  missing on one side, the page redirected away from the route, the locator matched nothing,
        the matched text does not match the target's text regex, or Before and the version look the same
        (unless the target says "expect": "same", e.g. a "desktop unchanged" proof). A target with
        "sameIn": ["B"] is a spot that version leaves alone on purpose (options that change different
        spots, or a link that lands on the page the old flow opened): it must match Before within 0.1%.
  WARN  the locator matched more than one element (the shot may frame the wrong one), the close-up is
        nearly the whole viewport (no real close-up), the change is tiny (< 0.3% of pixels), or pixels
        changed on the full screen outside the close-up (something else moved: look at that screen).
Then writes contact/<id>.png: Before | each version, crops side by side with the framed text, one sheet per id.
Open the sheets for the hero spot and for every WARN line before building the demo.
Exit code 1 when any FAIL.
"""
import json, os, re, sys
from PIL import Image, ImageChops, ImageDraw

args = sys.argv[1:]
if not args:
    sys.exit(__doc__)
root = args[0]
fixes = json.load(open(args[args.index('--fixes') + 1], encoding='utf-8')) if '--fixes' in args else None


def load(mode):
    d = os.path.join(root, mode, 'meta')
    return {f[:-5]: json.load(open(os.path.join(d, f), encoding='utf-8')) for f in os.listdir(d) if f.endswith('.json')} if os.path.isdir(d) else {}


def img(mode, kind, n):
    return Image.open(os.path.join(root, mode, kind, n + '.png')).convert('RGB')


def changed(ib, ia, box=None):
    """Share of pixels that differ by more than 16 levels; with box, only pixels outside it count."""
    if ib.size != ia.size:
        return 1.0
    diff = ImageChops.difference(ib, ia).convert('L').point(lambda v: 255 if v > 16 else 0)
    if box:
        ImageDraw.Draw(diff).rectangle(box, fill=0)
    return sum(diff.histogram()[255:]) / (ib.size[0] * ib.size[1])


before = load('before')
MODES = sorted(d for d in os.listdir(root) if d != 'before' and os.path.isdir(os.path.join(root, d, 'meta')))
if not before or not MODES:
    sys.exit(f'need before/ and at least one version folder (after/, A/, B/ ...) in {root}')
versions = {m: load(m) for m in MODES}
names = sorted(set(before).union(*versions.values()))
fails, warns = [], []

for n in names:
    b = before.get(n)
    for mode, metas in versions.items():
        a = metas.get(n)
        if not b or not a:
            fails.append(f'{n}: missing in {"before" if not b else mode}')
            continue
        for side, m in (('before', b), (mode, a)):
            route = (m.get('endsOn') or m['route']).split('?')[0]  # endsOn: a flow that is meant to end on another page
            if m.get('url') and not m['url'].startswith(route):
                fails.append(f'{n} [{side}]: ended on {m["url"]}, not {m["route"]} (signed out or redirected?)')
            if m.get('matchCount') == 0:
                fails.append(f'{n} [{side}]: locator matched nothing')
            if m.get('matchCount', 0) and m['matchCount'] > 1:
                warns.append(f'{n} [{side}]: {m["matchCount"]} elements match; framed "{m.get("matched", "")[:50]}" - add sel/closest if that is not the spot')
            if m.get('text') and m.get('matched') is not None and not re.search(m['text'], m['matched']):
                fails.append(f'{n} [{side}]: framed text "{m["matched"][:50]}" does not match /{m["text"]}/')
            clip, vp = m.get('clip'), m.get('viewport')
            if clip and vp and clip['width'] * clip['height'] > 0.85 * vp['width'] * vp['height']:
                warns.append(f'{n} [{side}]: close-up covers {clip["width"] * clip["height"] / (vp["width"] * vp["height"]):.0%} of the screen - frame a smaller box')
        cb, ca = img('before', 'crop', n), img(mode, 'crop', n)
        same = b.get('expect') == 'same'
        share = changed(cb, ca)
        if mode in a.get('sameIn', []):  # spot this version leaves alone on purpose; the animated page background may move a few pixels
            if share > 0.001:
                fails.append(f'{n} [{mode}]: listed in sameIn, but {share:.2%} of pixels differ')
            continue
        if same and share > 0:
            fails.append(f'{n} [{mode}]: expected unchanged, but {share:.2%} of pixels differ')
        elif not same and share == 0 and cb.size == ca.size and ImageChops.difference(cb, ca).convert('L').point(lambda v: 255 if v > 4 else 0).getbbox():
            warns.append(f'{n} [{mode}]: only a faint change (under 16 colour levels, e.g. a background tint) - check it by eye')
        elif not same and share == 0:
            fails.append(f'{n} [{mode}]: Before and {mode} close-ups are identical - wrong spot, change not applied, or a patch/stash left behind')
        elif not same and share < 0.003:
            warns.append(f'{n} [{mode}]: only {share:.2%} of pixels differ - make sure the change is the one described')
        # The full screen should change only inside the close-up (clip is in CSS px; screenshots are in device px).
        c, dpr = b.get('clip'), b.get('dpr', 1)
        if not same and c and c == a.get('clip'):
            box = [round(c['x'] * dpr), round(c['y'] * dpr), round((c['x'] + c['width']) * dpr), round((c['y'] + c['height']) * dpr)]
            out = changed(img('before', 'vp', n), img(mode, 'vp', n), box)
            if out > 0.005:
                warns.append(f'{n} [{mode}]: {out:.1%} of the screen changed outside the close-up - look at the full screen')

if fixes:
    keys = {k for f in fixes['fixes'] for k in f['keys']}
    ids = {n.rsplit('-', 2)[0] for n in names}
    for k in sorted(keys - ids):
        fails.append(f'fix key {k}: no shots')
    for i in sorted(ids - keys):
        warns.append(f'shots {i}: not used by any fix')

# Contact sheets: one per target id, every device/theme as a row of Before | each version.
os.makedirs(os.path.join(root, 'contact'), exist_ok=True)
by_id = {}
for n in names:
    if n in before:
        by_id.setdefault(n.rsplit('-', 2)[0], []).append(n)
for i, ns in by_id.items():
    rows = []
    for n in ns:
        sides = [('before', 'BEFORE')] + [(m, m.upper()) for m in MODES if n in versions[m]]
        ims = [img(m, 'crop', n) for m, _ in sides]
        s = min(1.0, 700 / max(im.size[0] for im in ims))
        ims = [im.resize((max(1, round(im.size[0] * s)), max(1, round(im.size[1] * s)))) for im in ims]
        row = Image.new('RGB', (sum(im.size[0] + 22 for im in ims), max(im.size[1] for im in ims) + 44), 'white')
        d = ImageDraw.Draw(row)
        d.text((4, 2), f'{n}   framed: "{before[n].get("matched", "")[:70]}"', fill='black')
        x = 0
        for (m, label), im in zip(sides, ims):
            d.text((x + 4, 18), label, fill=(190, 18, 60) if m == 'before' else (31, 90, 40))
            row.paste(im, (x, 36))
            x += im.size[0] + 22
            d.line([(x - 11, 30), (x - 11, row.size[1])], fill=(200, 200, 200), width=2)
        rows.append(row)
    sheet = Image.new('RGB', (max(r.size[0] for r in rows), sum(r.size[1] + 8 for r in rows)), (235, 235, 235))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y)); y += r.size[1] + 8
    sheet.save(os.path.join(root, 'contact', i + '.png'))

stamp = os.path.join(root, 'verified.ok')
if fails:
    if os.path.exists(stamp):
        os.remove(stamp)
else:
    open(stamp, 'w').write(' '.join(names))  # build-demo.py refuses to build without a fresh stamp

for w in warns:
    print('WARN', w)
for f in fails:
    print('FAIL', f)
print(f'{len(names)} shots x {len(MODES)} version(s) {MODES}, {len(fails)} fail, {len(warns)} warn; contact sheets in {os.path.join(root, "contact")}')
sys.exit(1 if fails else 0)
