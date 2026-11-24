import { Scale } from 'lucide-react';
import { useDebate, useStatus, type DebateOut } from '../api/client';
import { marketOf } from '../lib/format';
import { ago } from '../lib/format';
import { Heading, Problem } from './bits';
import OwnerGate from './OwnerGate';

function List({ title, items, dot }: { title: string; items: string[]; dot: string }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="title mb-1.5 flex items-center gap-2"><i className="size-2.5 rounded-sm" style={{ background: dot }} />{title}</h4>
      <ul className="list-disc space-y-1.5 pl-5 text-ink2 marker:text-ink3">{items.map((p) => <li key={p}>{p}</li>)}</ul>
    </div>
  );
}

function Result({ d }: { d: DebateOut }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {([['The bull', d.bull, 'var(--color-up)'], ['The bear', d.bear, 'var(--color-down)']] as const).map(([name, side, c]) => (
          <div key={name} className="rounded-2xl border border-line bg-deep/60 p-4">
            <List title={name} items={side.case} dot={c} />
            {side.wrong_if && <p className="mt-3 text-[14px]"><span className="text-ink3">Wrong if: </span>{side.wrong_if}</p>}
          </div>
        ))}
      </div>
      <div className="space-y-4 rounded-2xl border border-line2 p-4">
        <h4 className="title">The risk manager</h4>
        {d.summary && <p className="max-w-[70ch]">{d.summary}</p>}
        <div className="grid gap-5 md:grid-cols-3">
          <List title="They agree" items={d.agree} dot="var(--color-peri)" />
          <List title="They clash" items={d.clash} dot="var(--color-gold)" />
          <List title="Check before trading" items={d.check_first} dot="var(--color-ink2)" />
        </div>
      </div>
      <p className="text-[13px] text-ink3">
        Three analysts ({d.model}) worked from the data on this page {ago(d.created_at)}; none was asked to pick a winner.
        {d.removed > 0 && ` ${d.removed} ${d.removed === 1 ? 'statement was' : 'statements were'} removed for using numbers that are not in the data or for telling you to trade.`}
      </p>
    </div>
  );
}

export default function Debate({ ticker }: { ticker: string }) {
  const debate = useDebate(ticker);
  const { data: st } = useStatus(marketOf(ticker));
  if (st?.ai_enabled === false) return null;
  return (
    <section>
      <Heading>Bull and bear, argued</Heading>
      <div className="panel p-5">
        <OwnerGate what="The debate">
          {debate.error ? <Problem error={debate.error} retry={() => debate.mutate()} /> : debate.isPending ? (
            <div className="space-y-2.5" aria-live="polite"><p className="text-ink2">Three analysts are working from the same facts…</p><div className="grid gap-4 md:grid-cols-2"><div className="skeleton h-32" /><div className="skeleton h-32" /></div></div>
          ) : debate.data ? <Result d={debate.data} /> : (
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" className="btn btn-gold press" onClick={() => debate.mutate()}><Scale size={16} aria-hidden />Convene the desk</button>
              <p className="max-w-[60ch] text-ink2">A bull and a bear each make their best honest case, then a risk manager says where they truly differ and what to check first. No one is asked for a verdict.</p>
            </div>
          )}
        </OwnerGate>
      </div>
    </section>
  );
}
