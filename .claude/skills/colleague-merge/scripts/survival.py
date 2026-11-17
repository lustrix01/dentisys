"""List every line a colleague added (base..theirs) that is missing from the current working tree,
ignoring className-only differences and whitespace. Run from the repo root with the merge in the tree.

usage: python survival.py <base> <theirs> [pathspec, default: frontend]
Every hit must be a change you made on purpose; anything else was dropped silently by the merge.
Exit code 1 when there are hits, so it can gate a script."""
import re, subprocess, sys

if len(sys.argv) < 3:
    sys.exit(__doc__)
base, theirs = sys.argv[1:3]
spec = sys.argv[3] if len(sys.argv) > 3 else 'frontend'

def git(*a):
    return subprocess.run(['git', *a], capture_output=True, text=True, encoding='utf-8', errors='replace', check=True).stdout

def norm(s):
    return re.sub(r'\s+', '', re.sub(r'className=(\{`[^`]*`\}|"[^"]*")', '', s))

hits = 0
for f in git('diff', '--name-only', '--diff-filter=AM', base, theirs, '--', spec).split():
    added = [l[1:] for l in git('diff', '-U0', base, theirs, '--', f).splitlines() if l.startswith('+') and not l.startswith('+++')]
    try:
        current = norm(open(f, encoding='utf-8', errors='replace').read())
    except FileNotFoundError:
        print(f'### {f}: file no longer exists'); hits += 1; continue
    missing = [l.strip() for l in added if len(norm(l)) >= 6 and norm(l) not in current]
    if missing:
        hits += len(missing)
        print(f'### {f}: {len(missing)} of {len(added)} added lines not found')
        for l in missing:
            print('   ', l[:200])
print(f'{hits} line(s) to explain' if hits else 'Every added line survives (class names ignored).')
sys.exit(1 if hits else 0)
