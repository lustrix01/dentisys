"""Build the Before/After demo page from verified shots.

usage: python build-demo.py <demo.json> <shotsDir> <out.html>
Run verify.py first; this script refuses to build when a fix key has no shots.
It also needs a passing review.md (last line "Verdict: pass") from the design-review agent, written after the last capture.

demo.json:
{
  "title": "UI Fixes Batch 3",
  "subtitle": "Real screenshots of the running app ... (HTML allowed)",
  "beforeLabel": "Before (branch today)", "afterLabel": "After (proposed)",
  "checked": ["Pixel check at 1920: identical", "..."],
  "rows": [["A1", "agreed|prop|rec", "Agreed", "before text", "after text"]],
  "footnote": "Only class names changed ...",
  "fixes": [{"id": "A1", "keys": ["a1-add-student"], "card": "A1 · Add Student button", "short": "label on two lines",
             "where": "Faculty · Classes · phone", "steps": ["Open <b>Classes</b>."],
             "before": "what the Owner sees today", "after": "what they will see", "code": "what changed in code"}]
}
"keys" are target ids from targets.json; each key adds one device tab per device/theme it was shot on.

Options page (stage 1): add "versions" and an "ask" line, and leave out steps/code/rows/checked:
  "versions": [{"key": "before", "label": "Before"},
               {"key": "A", "label": "Option A", "desc": "one line", "rec": true}, {"key": "B", "label": "Option B", "desc": "one line"}],
  "ask": "<b>Reply A, B, or what to change.</b> No reply needed for A: it is the recommendation."
Each version key needs a shots folder of the same name (shots.mjs ... A).
Final demo (stage 2): no "versions"; uses before/ and after/. Embed the core tier plus flagged spots, not the full tier.
"""
import base64, io, json, os, sys
from PIL import Image

demo_file, root, out = sys.argv[1:4]
here = os.path.dirname(os.path.abspath(__file__))
demo = json.load(open(demo_file, encoding='utf-8'))


def enc(path, scale):
    im = Image.open(path).convert('RGB')
    scale = min(scale, 1600 / im.size[0])  # wide desktops: 1600px is plenty on screen and keeps the page small
    if scale != 1.0:
        im = im.resize((round(im.size[0] * scale), round(im.size[1] * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=82, optimize=True)  # JPEG at <= 1.5x keeps a 20-fix page well under 16MB
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


def kind(m):
    w, h = m['viewport']['width'], m['viewport']['height']
    if not m.get('isMobile'):
        return 'laptop'
    if w < h:
        return 'phone' if w < 600 else 'tablet'
    return 'landscape'


stamp = os.path.join(root, 'verified.ok')
newest = max(os.path.getmtime(os.path.join(dp, f)) for dp, _, fs in os.walk(root) for f in fs if f.endswith(('.png', '.json')) and 'contact' not in dp and os.path.relpath(dp, root).split(os.sep)[0] != 'review')
if not os.path.exists(stamp) or os.path.getmtime(stamp) < newest:
    sys.exit('shots not verified since the last capture - run verify.py, fix every FAIL and look at every contact sheet first')
review = os.path.join(root, 'review.md')
lines = [l.strip() for l in open(review, encoding='utf-8')] if os.path.exists(review) else []
lines = [l for l in lines if l]
if not os.path.exists(review) or os.path.getmtime(review) < newest or not lines or lines[-1] != 'Verdict: pass':
    sys.exit('design review missing, stale or failed - run the design-review agent on these shots (.claude/agents/design-review.md), fix every Blocker and High, recapture, verify, and review again')
meta_dir = os.path.join(root, 'before', 'meta')
metas = {f[:-5]: json.load(open(os.path.join(meta_dir, f), encoding='utf-8')) for f in os.listdir(meta_dir) if f.endswith('.json')}
for fx in demo['fixes']:
    shots = []
    for key in fx['keys']:
        for name in sorted((n for n in metas if n.rsplit('-', 2)[0] == key), key=lambda n: (metas[n]['viewport']['width'], metas[n]['theme'] == ('light' if 'versions' in demo else 'dark')), reverse='versions' in demo):  # options page opens on the Owner's 1920 screen
            m = metas[name]
            dpr = m.get('dpr', 1)
            down = 1.5 / dpr if dpr > 1.5 else 1.0
            p = lambda mode, d: os.path.join(root, mode, d, name + '.png')
            theme = ' · dark' if m['theme'] == 'dark' else ''
            shot = dict(dev=(m['device'] if str(m['viewport']['width']) in m['device'] else f"{m['device']} {m['viewport']['width']}px") + theme, kind=kind(m), w=m['viewport']['width'],
                        cw=int(Image.open(p('before', 'crop')).size[0] / dpr))
            if 'versions' in demo:  # options page: one image per version key
                shot['v'] = {v['key']: enc(p(v['key'], 'vp'), down) for v in demo['versions']}
                shot['c'] = {v['key']: enc(p(v['key'], 'crop'), down) for v in demo['versions']}
            else:
                shot.update(vb=enc(p('before', 'vp'), down), va=enc(p('after', 'vp'), down),
                            cb=enc(p('before', 'crop'), down), ca=enc(p('after', 'crop'), down))
            shots.append(shot)
    if not shots:
        sys.exit(f'fix {fx["id"]}: no shots for keys {fx["keys"]} - run shots.mjs and verify.py first')
    fx['shots'] = shots

tpl = open(os.path.join(here, '..', 'assets', 'template.html'), encoding='utf-8').read()
html = tpl.replace('__TITLE__', demo['title']).replace('/*__DATA__*/null', json.dumps(demo))
open(out, 'w', encoding='utf-8').write(html)
size = len(html.encode()) / 1e6
if size > 15.5:  # Artifact pages are capped at 16MB
    os.remove(out)
    sys.exit(f'{size:.1f} MB is over the 16MB Artifact limit: embed the core tier plus flagged spots only, or split the series')
print(f'written {out}: {size:.1f} MB, {sum(len(f["shots"]) for f in demo["fixes"])} shots')
