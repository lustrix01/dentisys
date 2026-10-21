import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { OUT, PARTS_DIR } from './common';

type Finding = { kind: string; severity: 'high' | 'medium' | 'low'; selector: string; text: string; rect: number[] };
type Entry = { device: string; viewport: unknown; role: string; theme: string; route: string; url: string; screenshot: string; findings: Finding[] };

const rank = { high: 0, medium: 1, low: 2 } as const;

// Merges the per-test JSON parts into report.json and summary.md.
export default async function globalTeardown() {
  mkdirSync(OUT, { recursive: true });
  const entries: Entry[] = [];
  for (const f of readdirSync(PARTS_DIR).filter(f => f.endsWith('.json'))) {
    entries.push(...JSON.parse(readFileSync(`${PARTS_DIR}/${f}`, 'utf8')));
  }
  writeFileSync(`${OUT}/report.json`, JSON.stringify(entries, null, 2) + '\n');

  type Group = { role: string; route: string; kind: string; severity: Finding['severity']; sample: string; devices: Set<string>; themes: Set<string>; shots: string[]; count: number };
  const groups = new Map<string, Group>();
  for (const e of entries) {
    for (const f of e.findings) {
      const key = `${e.role}|${e.route}|${f.kind}`;
      let g = groups.get(key);
      if (!g) groups.set(key, g = { role: e.role, route: e.route, kind: f.kind, severity: f.severity, sample: `${f.selector} "${f.text}"`, devices: new Set(), themes: new Set(), shots: [], count: 0 });
      if (rank[f.severity] < rank[g.severity]) g.severity = f.severity;
      g.count++;
      g.devices.add(e.device);
      g.themes.add(e.theme);
      if (!g.shots.includes(e.screenshot) && g.shots.length < 3) g.shots.push(e.screenshot);
    }
  }
  const sorted = [...groups.values()].sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count);
  const kinds = new Map<string, number>();
  for (const e of entries) for (const f of e.findings) kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1);
  const lines = [
    '# Device audit summary', '',
    `Cases: ${entries.length}. Findings: ${[...kinds.values()].reduce((a, b) => a + b, 0)} (${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}).`, '',
  ];
  for (const g of sorted) {
    lines.push(`- [${g.severity}] ${g.role} ${g.route} - ${g.kind} (x${g.count}) e.g. ${g.sample}`,
      `  - devices: ${[...g.devices].join(', ')}; themes: ${[...g.themes].join(', ')}`,
      `  - screenshots: ${g.shots.join(', ')}`);
  }
  writeFileSync(`${OUT}/summary.md`, lines.join('\n') + '\n');
}
