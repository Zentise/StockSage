import { useId, type ReactNode } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Ban, RotateCw } from 'lucide-react';
import type { Evidence } from '../api/client';
import { pct, tone } from '../lib/format';

export function Change({ v, className = '' }: { v: number | null | undefined; className?: string }) {
  return <span className={`num ${tone(v)} ${className}`}>{pct(v)}</span>;
}

export function Spark({ data, base, className = '', height = 44, neutral = false }: { data: number[]; base?: number; className?: string; height?: number; neutral?: boolean }) {
  const id = useId().replace(/\W/g, '');
  if (data.length < 2) return <div style={{ height }} className={className} />;
  const all = base ? [...data, base] : data;
  const lo = Math.min(...all), hi = Math.max(...all), r = hi - lo || 1;
  const y = (v: number) => height - 3 - ((v - lo) / r) * (height - 6);
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * 200).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const up = data[data.length - 1]! >= (base ?? data[0]!);
  const c = neutral ? 'var(--color-peri)' : up ? 'var(--color-up)' : 'var(--color-down)';
  return (
    <svg viewBox={`0 0 200 ${height}`} preserveAspectRatio="none" className={`block w-full ${className}`} style={{ height }} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.34" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts} 200,${height}`} fill={`url(#${id})`} />
      {base && <line x1="0" x2="200" y1={y(base)} y2={y(base)} stroke="var(--color-line2)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
      <polyline points={pts} fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const DIR = {
  BUY: { text: 'Buy setup', icon: ArrowUpRight, cls: 'bg-up/18 text-uptext ring-up/45' },
  SELL: { text: 'Short setup', icon: ArrowDownRight, cls: 'bg-down/18 text-downtext ring-down/45' },
  AVOID: { text: 'Stay out', icon: Ban, cls: 'bg-raised text-ink2 ring-line2' },
} as const;

export function Direction({ d }: { d: 'BUY' | 'SELL' | 'AVOID' }) {
  const { text, icon: Icon, cls } = DIR[d];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold whitespace-nowrap ring-1 ring-inset ${cls}`}>
      <Icon size={14} strokeWidth={2.4} aria-hidden />
      {text}
    </span>
  );
}

/** Stop, entry, target and the live price on one scale: where the trade stands right now. */
export function Rail({ stop, entry, target, price }: { stop: number; entry: number; target: number; price?: number | null }) {
  const at = (v: number) => Math.min(100, Math.max(0, ((v - stop) / (target - stop)) * 100));
  const e = at(entry), p = price == null ? null : at(price);
  return (
    <div className="relative h-7" aria-hidden="true">
      <div className="absolute inset-x-0 top-3 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="absolute inset-y-0 left-0 bg-down/55" style={{ width: `${e}%` }} />
        <div className="absolute inset-y-0 right-0 bg-up/55" style={{ left: `${e}%` }} />
      </div>
      <div className="absolute top-1.5 h-[18px] w-0.5 -translate-x-1/2 rounded bg-ink2" style={{ left: `${e}%` }} />
      {p !== null && (
        <div className="absolute top-[5px] size-[19px] -translate-x-1/2 rounded-full border-[5px] border-panel bg-gold shadow-[0_0_0_1px_var(--color-gold),0_0_18px_rgb(242_182_60/0.55)]"
          style={{ left: `${p}%`, transition: 'left 500ms var(--ease-out)' }} />
      )}
    </div>
  );
}

const sum = (e: Evidence[]) => e.reduce((a, x) => a + x.weight, 0);

/** For and against, pulling on the same rope. */
export function Tug({ yes, no, yesLabel = 'for', noLabel = 'against' }: { yes: Evidence[]; no: Evidence[]; yesLabel?: string; noLabel?: string }) {
  const a = sum(yes), b = sum(no), t = a + b || 1;
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[13px] text-ink3">
        <span><b className="num font-semibold text-ink">{a}</b> {yesLabel}</span>
        <span>{noLabel} <b className="num font-semibold text-ink">{b}</b></span>
      </div>
      <div className="flex h-2 gap-[3px]" aria-hidden="true">
        {Array.from({ length: t }, (_, i) => (
          <span key={i} className={`flex-1 rounded-[3px] ${i < a ? 'bg-peri' : 'bg-line2'}`} />
        ))}
      </div>
    </div>
  );
}

export function Problem({ error, retry, className = '' }: { error: Error; retry?: () => void; className?: string }) {
  return (
    <div role="alert" className={`flex flex-col items-start gap-3 rounded-2xl border border-down/40 bg-down/8 p-5 ${className}`}>
      <p className="flex items-center gap-2.5"><AlertTriangle size={18} className="shrink-0 text-downtext" aria-hidden /> {error.message}</p>
      {retry && <button type="button" onClick={retry} className="btn btn-line press"><RotateCw size={15} aria-hidden /> Try again</button>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line2 px-6 py-10 text-center">
      <p className="title text-lg">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-[46ch] text-ink2">{children}</p>}
    </div>
  );
}

export function Heading({ children, side }: { children: ReactNode; side?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <h2 className="title text-[22px]">{children}</h2>
      {side}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: readonly (readonly [T, ReactNode])[]; label: string }) {
  return (
    <div className="seg max-w-full overflow-x-auto" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}
