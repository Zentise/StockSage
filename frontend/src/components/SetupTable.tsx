import type { ReplaySummary } from '../api/client';
import { rText, tone } from '../lib/format';

export interface SetupRow {
  key: string;
  label: string;
  validated: boolean;
  replay?: ReplaySummary | null;
  live?: { n: number; paired_n: number; edge_r?: number | null; edge_low?: number | null; edge_high?: number | null };
  active?: number;
}

export function verdict(r: SetupRow): { text: string; cls: string } {
  if (r.validated) return { text: 'Beat random', cls: 'bg-up/15 text-uptext ring-up/40' };
  const s = r.replay;
  if (!s || !s.n) return { text: 'Not tested', cls: 'bg-raised text-ink3 ring-line2' };
  if (s.edge_high != null && s.edge_high < 0) return { text: 'Worse than random', cls: 'bg-down/15 text-downtext ring-down/40' };
  return { text: 'Not proven', cls: 'bg-raised text-ink2 ring-line2' };
}

const range = (lo?: number | null, hi?: number | null) => (lo == null || hi == null ? '' : `${rText(lo)} to ${rText(hi)}`);

/** Each kind of setup has to earn its place. "Beat random" needs a long replay, both halves, after costs. */
export default function SetupTable({ rows, showLive = true }: { rows: SetupRow[]; showLive?: boolean }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[720px] text-[14px]">
        <thead>
          <tr className="text-left text-[13px] text-ink3">
            {['Kind of setup', 'Verdict', 'Replay trades', 'Replay: better than random by', ...(showLive ? ['Live finished', 'Live: better than random by'] : [])].map((h, i) => (
              <th key={h} className={`px-5 py-3 font-normal ${i > 1 ? 'text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-t border-line">
          {rows.map((r) => {
            const v = verdict(r);
            return (
              <tr key={r.key}>
                <td className="px-5 py-3 font-semibold">{r.label}{!!r.active && <span className="ml-2 text-[13px] font-normal text-ink3">{r.active} open</span>}</td>
                <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-[13px] whitespace-nowrap ring-1 ring-inset ${v.cls}`}>{v.text}</span></td>
                <td className="num px-5 py-3 text-right">{r.replay?.n ?? '–'}</td>
                <td className="px-5 py-3 text-right"><span className={`num ${tone(r.replay?.edge_r)}`}>{rText(r.replay?.edge_r)}</span> <span className="num block text-[12px] text-ink3">{range(r.replay?.edge_low, r.replay?.edge_high)}</span></td>
                {showLive && <>
                  <td className="num px-5 py-3 text-right">{r.live?.n ?? 0}</td>
                  <td className="px-5 py-3 text-right">{r.live && r.live.paired_n > 0 ? <><span className={`num ${tone(r.live.edge_r)}`}>{rText(r.live.edge_r)}</span> <span className="num block text-[12px] text-ink3">{range(r.live.edge_low, r.live.edge_high) || `${r.live.paired_n} compared`}</span></> : <span className="text-ink3">too early</span>}</td>
                </>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
