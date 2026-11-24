import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { subscribePrices, type Market } from './api/client';

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

/** Remembered on this device only. */
export function useStored<T>(key: string, fallback: T) {
  const [v, set] = useState<T>(() => load(key, fallback));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* private mode: just don't remember */
    }
  }, [key, v]);
  return [v, set] as const;
}

type Live = Record<string, { price: number; change_pct: number }>;

interface App {
  market: Market;
  setMarket: (m: Market) => void;
  live: Live;
  watch: string[];
  toggleWatch: (t: string) => void;
}

const Ctx = createContext<App | null>(null);

export function AppState({ children }: { children: ReactNode }) {
  const [market, setMarket] = useStored<Market>('ss.market', 'india');
  const [watch, setWatch] = useStored<string[]>('ss.watch', []);
  const [live, setLive] = useState<Live>({});
  useEffect(() => {
    setLive({});
    return subscribePrices(market, (p) => setLive((old) => ({ ...old, ...p })));
  }, [market]);
  const value = useMemo<App>(
    () => ({
      market, setMarket, live, watch,
      toggleWatch: (t) => setWatch((w) => (w.includes(t) ? w.filter((x) => x !== t) : [...w, t])),
    }),
    [market, setMarket, live, watch, setWatch],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppState is missing');
  return v;
}

export function useNow(ms = 1000) {
  const [n, set] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => set(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}
