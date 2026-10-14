import React from 'react';

// Shared print (Export PDF) pieces for the faculty and Dean reports and the activity logs. The sheet is
// hidden on screen (.print-only) and only styled while a page that renders <PrintStyle> is mounted.

const cssString = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`;

export const formatPrintedAt = (date: Date) => date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

// Placeholder values print muted; failing remarks print bold rose.
export const printCellClass = (value: unknown): string => {
  const text = String(value ?? '');
  if (/^(Unavailable|Pending|N\/A|Incomplete|Prior:)/.test(text) || text === '—') return 'ph';
  if (text === 'FAILED' || text === 'FAILS RETENTION' || text === 'INCOMPLETE') return 'bad';
  return '';
};

export const PrintStyle: React.FC<{ title: string; running: string; generated: string; note?: string }> = ({ title, running, generated, note }) => (
  <style>{`
@page { size: landscape; margin: 10mm;
  /* = --ps-fs-xs; @page boxes can't use vars */
  @top-left { content: ${cssString(running)}; font-size: 8.5px; color: #64748b; }
  @top-right { content: "continued"; font-size: 8.5px; color: #64748b; }
  @bottom-left { content: ${cssString(`DentiSys · ${title} · ${generated}${note ? ` · ${note}` : ''}`)}; font-size: 8.5px; color: #64748b; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 8.5px; color: #64748b; }
}
@page :first { @top-left { content: none; } @top-right { content: none; } }
.ps { --ps-fs-xs: 8.5px; --ps-fs-sm: 9px; --ps-fs-base: 9.5px; --ps-fs-md: 10.5px; --ps-fs-title: 19px; font-size: var(--ps-fs-base); color: #0f172a; }
.ps .ps-head { margin-bottom: 12px; }
/* collapses with .ps-head margin: 32px = 12px + caption (14px line + 6px) */
.ps .ps-head + table { margin-top: 32px; }
.ps .ps-caption { font-size: var(--ps-fs-base); line-height: 14px; margin: 0 0 6px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.ps table + .ps-caption { margin-top: 12px; }
.ps .ps-eyebrow { font-size: var(--ps-fs-sm); }
.ps .ps-title { font-size: var(--ps-fs-title); }
.ps .ps-sub { font-size: var(--ps-fs-md); }
.ps .ps-meta { font-size: var(--ps-fs-base); }
.ps .ps-legend { font-size: var(--ps-fs-xs); }
.ps .ps-sig { font-size: var(--ps-fs-md); }
.ps .ps-sig-role { font-size: var(--ps-fs-xs); }
.ps table { table-layout: fixed; width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.ps th { background: #e2e8f0; border: 1px solid #94a3b8; padding: 4px 6px; font-size: var(--ps-fs-xs); font-weight: 700; text-transform: uppercase; text-align: center; overflow-wrap: break-word; }
.ps th.band { background: #cbd5e1; }
.ps th.l { text-align: left; }
.ps td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: center; overflow-wrap: break-word; }
.ps tbody tr:nth-child(even) { background: #f8fafc; }
.ps td.l { text-align: left; }
.ps td.id { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: var(--ps-fs-sm); white-space: nowrap; text-align: left; }
.ps td.nm { font-weight: 600; text-align: left; }
.ps td.grade { font-weight: 800; }
.ps td.ph { color: #64748b; font-style: italic; font-size: var(--ps-fs-xs); }
.ps td.bad { font-weight: 800; color: #9f1239; }
.ps td.cap { text-transform: capitalize; }
`}</style>
);

export const PrintHeader: React.FC<{ title: string; sub: string; rows: [string, string][] }> = ({ title, sub, rows }) => (
  <div className="grid grid-cols-[1fr_auto] gap-6 items-end ps-head border-b-2 border-slate-900 pb-2">
    <div>
      <p className="ps-eyebrow font-extrabold uppercase tracking-widest text-slate-600">Bicol University · College of Dental Medicine</p>
      <h2 className="ps-title font-heading font-extrabold leading-tight text-slate-900">{title}</h2>
      <p className="ps-sub text-slate-700">{sub}</p>
    </div>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 justify-self-end ps-meta">
      {rows.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="text-slate-500">{label}</dt>
          <dd className="font-semibold text-slate-900">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  </div>
);

export const PrintCaption: React.FC<{ children: React.ReactNode }> = ({ children }) => <h3 className="ps-caption">{children}</h3>;

export const PrintLegend: React.FC = () => (
  <p className="ps-legend mt-2 text-slate-600">
    Unavailable (recompute required): saved before Lecture/Laboratory grouping; recompute the class to fill these cells.
  </p>
);

export const PrintSignatures: React.FC<{ faculty?: string; seal?: boolean; role?: string }> = ({ faculty, seal, role = 'Faculty' }) => (
  <div className={`break-inside-avoid mt-[26px] flex items-end ps-sig ${seal ? 'justify-between' : 'justify-end'}`}>
    {seal && (
      <div className="text-center w-56">
        <div className="h-px w-full bg-slate-900 mb-1" />
        <p className="ps-sig-role text-slate-500 font-bold uppercase tracking-wider">Dean of Dentistry Seal</p>
      </div>
    )}
    <div className="text-center w-56">
      <p className="font-bold">{faculty}</p>
      <div className="h-px w-full bg-slate-900 mt-1 mb-1" />
      <p className="ps-sig-role text-slate-500 font-bold uppercase tracking-wider">{role}</p>
    </div>
  </div>
);
