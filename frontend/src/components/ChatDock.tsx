import { MessageCircle, Send, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { matchPath, useLocation } from 'react-router';
import { useChat, useStatus } from '../api/client';
import { symbol } from '../lib/format';
import { useApp } from '../state';
import { useIsOwner } from './OwnerGate';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  removed?: number;
}

const SUGGEST = {
  stock: ['What speaks against this idea?', 'Is the stop sensible for its daily range?', 'What has the engine done on this kind of setup?'],
  market: ['How is the market today?', 'Which of today\'s setups has proven itself?', 'What should I check before the open?'],
};

/** Ask about the page you are on. Answers come from the same facts as the research note and pass the same checks. */
export default function ChatDock() {
  const owner = useIsOwner();
  const { market } = useApp();
  const { data: st } = useStatus(market);
  const { pathname } = useLocation();
  const ticker = matchPath('/stock/:ticker', pathname)?.params.ticker ?? null;
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const chat = useChat();
  const end = useRef<HTMLDivElement>(null);
  const scope = ticker ? decodeURIComponent(ticker) : null;
  useEffect(() => { setTurns([]); }, [scope, market]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [turns, chat.isPending]);
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [open]);
  if (!owner || st?.ai_enabled === false) return null;

  const ask = (q: string) => {
    const next: Turn[] = [...turns, { role: 'user', content: q }];
    setTurns(next);
    setText('');
    chat.mutate({ ticker: scope, market, messages: next.map(({ role, content }) => ({ role, content })) }, {
      onSuccess: (r) => setTurns((t) => [...t, { role: 'assistant', content: r.answer, removed: r.removed }]),
    });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim() && !chat.isPending) ask(text.trim());
  };
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label="Ask about this page"
          className="btn btn-gold press fixed right-4 bottom-20 z-40 !min-h-12 !rounded-full !px-5 shadow-2xl lg:bottom-6"><MessageCircle size={18} aria-hidden />Ask</button>
      )}
      {open && (
        <section role="dialog" aria-label="Ask about this page" className="panel fixed inset-x-3 bottom-20 z-[60] flex max-h-[min(640px,78dvh)] flex-col overflow-hidden shadow-2xl sm:left-auto sm:w-[400px] lg:right-6 lg:bottom-6">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <div><h2 className="title">Ask</h2><p className="text-[13px] text-ink3">{scope ? `About ${symbol(scope)}` : 'About the market'}, from the data on the page</p></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="press grid size-9 place-items-center rounded-lg text-ink3 hover-ink"><X size={17} aria-hidden /></button>
          </header>
          <div className="min-h-[160px] flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {turns.length === 0 && (
              <div className="space-y-2"><p className="text-[14px] text-ink2">Try one of these, or ask your own.</p>
                {SUGGEST[scope ? 'stock' : 'market'].map((s) => <button key={s} type="button" onClick={() => ask(s)} className="hover-raise block w-full rounded-xl border border-line px-3 py-2 text-left text-[14px]">{s}</button>)}</div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'ml-8 rounded-2xl bg-raised px-3.5 py-2.5' : 'mr-4'}>
                <p className="whitespace-pre-wrap">{t.content}</p>
                {!!t.removed && <p className="mt-1 text-[12px] text-ink3">{t.removed} {t.removed === 1 ? 'statement was' : 'statements were'} removed: not backed by the data.</p>}
              </div>
            ))}
            {chat.isPending && <div className="skeleton h-12 w-3/4" />}
            {chat.error && <p role="alert" className="text-[14px] text-downtext">{chat.error.message}</p>}
            <div ref={end} />
          </div>
          <form onSubmit={submit} className="flex gap-2 border-t border-line p-3">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Ask a question" aria-label="Your question" className="field !font-sans" />
            <button type="submit" className="btn btn-gold press !px-3.5" aria-label="Send" disabled={!text.trim() || chat.isPending}><Send size={16} aria-hidden /></button>
          </form>
          <p className="px-4 pb-3 text-[12px] text-ink3">AI can be wrong. Not investment advice.</p>
        </section>
      )}
    </>
  );
}
