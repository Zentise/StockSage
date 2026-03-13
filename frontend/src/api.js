// const API_BASE = '/api';
// const WS_BASE = `ws://${window.location.hostname}:8000`;

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const WS_BASE = import.meta.env.VITE_WS_BASE || `ws://${window.location.hostname}:8000`;

export async function fetchSuggestions(market = 'india', category = 'all') {
  const res = await fetch(`${API_BASE}/suggestions?market=${market}&category=${category}`);
  return res.json();
}

export async function fetchAnalysis(ticker, market = 'india') {
  const res = await fetch(`${API_BASE}/analyze/${encodeURIComponent(ticker)}?market=${market}`);
  return res.json();
}

export async function fetchNews(market = 'india') {
  const res = await fetch(`${API_BASE}/news?market=${market}`);
  return res.json();
}

export async function fetchIndices(market = 'india') {
  const res = await fetch(`${API_BASE}/indices?market=${market}`);
  return res.json();
}

export async function fetchChartData(ticker, period = '3mo', interval = '1d') {
  const res = await fetch(`${API_BASE}/chart/${encodeURIComponent(ticker)}?period=${period}&interval=${interval}`);
  return res.json();
}

export async function triggerScan(market = 'india') {
  const res = await fetch(`${API_BASE}/scan?market=${market}`);
  return res.json();
}

export function createPriceWebSocket(onMessage) {
  const ws = new WebSocket(`${WS_BASE}/ws/prices`);
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
  };
  ws.onerror = (err) => console.error('WebSocket error:', err);
  ws.onclose = () => {
    // Reconnect after 5 seconds
    setTimeout(() => createPriceWebSocket(onMessage), 5000);
  };
  return ws;
}

export function createAnalysisStream(ticker, market, onEvent) {
  const url = `${API_BASE}/stream/analyze/${encodeURIComponent(ticker)}?market=${market}`;
  const eventSource = new EventSource(url);

  eventSource.addEventListener('status', (e) => {
    onEvent({ type: 'status', data: JSON.parse(e.data) });
  });
  eventSource.addEventListener('indicators', (e) => {
    onEvent({ type: 'indicators', data: JSON.parse(e.data) });
  });
  eventSource.addEventListener('signal', (e) => {
    onEvent({ type: 'signal', data: JSON.parse(e.data) });
  });
  eventSource.addEventListener('complete', (e) => {
    onEvent({ type: 'complete', data: JSON.parse(e.data) });
    eventSource.close();
  });
  eventSource.addEventListener('error', (e) => {
    onEvent({ type: 'error', data: { error: 'Stream error' } });
    eventSource.close();
  });

  return eventSource;
}
