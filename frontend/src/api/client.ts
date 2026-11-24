import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { components } from './schema';

type S = components['schemas'];
export type Market = 'india' | 'us';
export type LiveSignal = S['LiveSignal'];
export type SignalOut = S['SignalOut'];
export type MarketOut = S['MarketOut'];
export type Constituent = S['Constituent'];
export type Quote = S['Quote'];
export type Evidence = S['Evidence'];
export type Odds = S['OddsOut'];
export type RecordOut = S['RecordOut'];
export type Replay = S['ReplayOut'];
export type StockOut = S['StockOut'];
export type Candles = S['CandlesOut'];
export type Note = S['NoteOut'];
export type Status = S['Status'];
export type NewsItem = S['NewsItem'];
export type Fundamentals = S['Fundamentals'];
export type Portfolio = S['PortfolioOut'];
export type Position = S['PositionOut'];
export type PositionIn = S['PositionIn'];
export type CloseIn = S['CloseIn'];
export type AlertOut = S['AlertOut'];
export type AlertIn = S['AlertIn'];
export type Brief = S['BriefOut'];
export type DebateOut = S['DebateOut'];
export type ChatIn = S['ChatIn'];
export type ChatOut = S['ChatOut'];
export type SetupInfo = S['SetupInfo'];
export type SetupRecord = S['SetupRecord'];
export type ReplaySummary = S['ReplaySummary'];
export type Timeframe = '1D' | '1W' | '1M' | '6M' | '2Y';

const KEY = 'ss.owner';
/** The owner's key, kept on this device only. Empty when running locally without one. */
export const ownerToken = () => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};

const BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const token = ownerToken();
  try {
    res = await fetch(BASE + path, token ? { ...init, headers: { ...init?.headers, 'X-Owner-Token': token } } : init);
  } catch {
    throw new ApiError("Can't reach the StockSage server.", 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || body === null) {
    const detail = body && typeof body.detail === 'string' ? body.detail : `The server answered with an error (${res.status}).`;
    throw new ApiError(detail, res.status);
  }
  return body as T;
}

const t = encodeURIComponent;
const send = <T>(path: string, method: string, body?: unknown) =>
  call<T>(path, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
const MIN = 60_000;
const retry = (n: number, e: Error) => n < 2 && !(e instanceof ApiError && e.status >= 400 && e.status < 500);

const q = <T>(key: unknown[], path: string, refetch: number | false, extra: object = {}) => ({
  queryKey: key, queryFn: () => call<T>(path), refetchInterval: refetch, staleTime: 15_000, retry, ...extra,
});

export const useStatus = (m: Market) => useQuery(q<Status>(['status', m], `/status?market=${m}`, 30_000));
export const useMarketData = (m: Market) => useQuery(q<MarketOut>(['market', m], `/market?market=${m}`, MIN));
export const useSignals = (m: Market) => useQuery(q<S['SignalsOut']>(['signals', m], `/signals?market=${m}`, MIN));
export const useMarketNews = (m: Market) => useQuery(q<S['NewsOut']>(['news', m], `/news?market=${m}`, 5 * MIN));
export const useRecord = (m: Market, e: 'v1' | 'v2') => useQuery(q<RecordOut>(['record', m, e], `/record?market=${m}&engine=${e}`, 5 * MIN));
export const useReplay = (m: Market) => useQuery(q<Replay>(['replay', m], `/replay?market=${m}`, false, { staleTime: Infinity }));
export const useSearchList = () => useQuery(q<S['SearchItem'][]>(['search'], '/search', false, { staleTime: Infinity }));
export const useStock = (k: string) => useQuery(q<StockOut>(['stock', k], `/stock/${t(k)}`, MIN));
export const useCandles = (k: string, tf: Timeframe) =>
  useQuery(q<Candles>(['candles', k, tf], `/stock/${t(k)}/candles?tf=${tf}`, MIN, { placeholderData: keepPreviousData }));
export const useFundamentals = (k: string) => useQuery(q<Fundamentals>(['fund', k], `/stock/${t(k)}/fundamentals`, false, { staleTime: 60 * MIN }));
export const useStockNews = (k: string) => useQuery(q<S['NewsOut']>(['stocknews', k], `/stock/${t(k)}/news`, 10 * MIN));

export const useOdds = (k: string, p: { entry: number; stop: number; target: number; days: number } | null) =>
  useQuery({
    ...q<Odds>(['odds', k, p], p ? `/stock/${t(k)}/odds?entry=${p.entry}&stop=${p.stop}&target=${p.target}&days=${p.days}` : '', false),
    enabled: !!p, placeholderData: keepPreviousData, staleTime: 5 * MIN,
  });

export const useNote = (k: string) => useMutation({ mutationFn: () => call<Note>(`/stock/${t(k)}/note`, { method: 'POST' }), mutationKey: ['note', k] });

export function useScan(m: Market) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => call<S['ScanOut']>(`/scan?market=${m}`, { method: 'POST' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['status', m] });
      // The scan runs in the background; collect its results as they land.
      for (const s of [15, 45, 75]) setTimeout(() => qc.invalidateQueries({ queryKey: ['signals', m] }), s * 1000);
    },
  });
}

/** Live prices. Returns a cleanup that really stops: no reconnect after unmount. */
export function subscribePrices(m: Market, onPrices: (p: Record<string, { price: number; change_pct: number }>) => void) {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  const base = explicit || (BASE.startsWith('http') ? BASE.replace(/^http/, 'ws') + '/ws/prices'
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/prices`);
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let wait = 2000;
  const open = () => {
    ws = new WebSocket(`${base}?market=${m}`);
    ws.onmessage = (e) => {
      wait = 2000;
      try {
        onPrices(JSON.parse(e.data).prices);
      } catch {
        /* a malformed frame is not worth crashing over */
      }
    };
    ws.onclose = () => {
      if (stopped) return;
      timer = setTimeout(open, wait);
      wait = Math.min(wait * 2, 60_000);
    };
  };
  open();
  return () => {
    stopped = true;
    clearTimeout(timer);
    ws?.close();
  };
}

// ---- owner: unlock, journal, alerts, brief, AI

export const useAuth = () => useQuery(q<S['AuthOut']>(['auth'], '/auth', false, { staleTime: 60_000 }));

export function useUnlock() {
  const qc = useQueryClient();
  return (token: string) => {
    try {
      if (token) localStorage.setItem(KEY, token);
      else localStorage.removeItem(KEY);
    } catch {
      /* private mode: the key lasts until the tab closes only if the browser allows it */
    }
    qc.invalidateQueries();
  };
}

export const useSetups = (m: Market) => useQuery(q<SetupInfo[]>(['setups', m], `/setups?market=${m}`, false, { staleTime: 10 * MIN }));
export const usePortfolio = (paper?: boolean) =>
  useQuery(q<Portfolio>(['portfolio', paper ?? 'all'], `/portfolio${paper === undefined ? '' : `?paper=${paper}`}`, 30_000));
export const useAlerts = () => useQuery(q<AlertOut[]>(['alerts'], '/alerts', 30_000));
export const useBrief = (m: Market) => useQuery(q<Brief>(['brief', m], `/brief?market=${m}`, 5 * MIN));
export const useSettings = () => useQuery(q<S['SettingsOut']>(['settings'], '/settings', false));

function useWrite<V, R>(fn: (v: V) => Promise<R>, refresh: string[]) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => refresh.forEach((k) => qc.invalidateQueries({ queryKey: [k] })) });
}

export const useOpenPosition = () => useWrite((b: PositionIn) => send<Position>('/positions', 'POST', b), ['portfolio', 'brief']);
export const useClosePosition = () => useWrite((v: { id: number; body: CloseIn }) => send<Position>(`/positions/${v.id}/close`, 'POST', v.body), ['portfolio', 'brief']);
export const useDeletePosition = () => useWrite((id: number) => send<unknown>(`/positions/${id}`, 'DELETE'), ['portfolio', 'brief']);
export const useAddAlert = () => useWrite((b: AlertIn) => send<AlertOut>('/alerts', 'POST', b), ['alerts', 'brief']);
export const useDeleteAlert = () => useWrite((id: number) => send<unknown>(`/alerts/${id}`, 'DELETE'), ['alerts', 'brief']);
export const useSendBrief = (m: Market) => useMutation({ mutationFn: () => send<{ sent: boolean }>(`/brief/send?market=${m}`, 'POST') });
export const useDebate = (k: string) => useMutation({ mutationFn: () => send<DebateOut>(`/stock/${t(k)}/debate`, 'POST'), mutationKey: ['debate', k] });
export const useChat = () => useMutation({ mutationFn: (b: ChatIn) => send<ChatOut>('/chat', 'POST', b) });
