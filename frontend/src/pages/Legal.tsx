import type { ReactNode } from 'react';
import { Link } from 'react-router';

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="title mb-2 text-xl">{title}</h2>
      <div className="max-w-[70ch] space-y-2.5 text-ink2">{children}</div>
    </section>
  );
}

export default function Legal() {
  return (
    <div>
      <h1 className="display text-[clamp(32px,4.4vw,50px)]">About and limits</h1>
      <p className="mt-2 mb-8 max-w-[62ch] text-ink2">Plain statements about what this site is, where its data comes from and what it does with yours.</p>
      <div className="space-y-9">
        <Part title="Not investment advice">
          <p>StockSage is a personal research and trade-planning tool. It is not a registered investment adviser or research analyst, and nothing here is a recommendation to buy, sell or hold any security. A “setup” is the output of a fixed rule applied to past prices, shown together with how that rule has actually done.</p>
          <p>Trading can lose money, including more than you expected: a price can gap past your stop, and a stop is not a guarantee. Decide for yourself, or ask a registered adviser. Past results, including the ones on the <Link to="/record" className="font-semibold text-gold">Record</Link> page, do not predict future ones.</p>
          <p>The Record page shows that the current rules have <b className="text-ink">not</b> been shown to beat random stocks. They are a baseline to improve on, not a source of tips.</p>
        </Part>
        <Part title="Where the data comes from">
          <p>Prices, charts and company figures come from Yahoo Finance through unofficial endpoints. They are delayed, can be wrong or missing, and are used here for personal research only. Exchange data may not be redistributed without a licence from the exchange, so this site is not a data service.</p>
          <p>The Nifty 50 list comes from NSE&apos;s published index file. Headlines come from Google News and link to their publishers; this site does not copy articles. Market holidays come from the exchange_calendars package, with extra days configurable.</p>
        </Part>
        <Part title="AI notes, debates and chat">
          <p>These are written by a language model from a fixed set of facts that the page supplies. The model can still be wrong or one-sided. Every number in its text is checked against the facts, and any statement with a number that is not in them, or that tells you to trade, is removed and counted on the page. An answer that passes the check is still not advice.</p>
        </Part>
        <Part title="What it stores about you">
          <p>There are no accounts, advertising or analytics. Your watchlist and your owner key are kept in your own browser. If you use the journal, alerts or the AI chat, what you enter is stored in this site&apos;s database, visible only to someone holding the owner key. Telegram messages, if switched on, pass through Telegram.</p>
        </Part>
        <Part title="Licence and source">
          <p>The code is open source under the MIT licence, with no warranty of any kind. If you run your own copy you are responsible for how you use it and for the data licences that apply to you.</p>
        </Part>
      </div>
    </div>
  );
}
