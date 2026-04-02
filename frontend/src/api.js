const BASE = import.meta.env.VITE_API_URL || '/api';

export const getSuggestions = (market, category) =>
  fetch(`${BASE}/suggestions?market=${market}&category=${category}`).then(r => r.json());

export const triggerScan = (market) =>
  fetch(`${BASE}/scan?market=${market}`).then(r => r.json());

export const getNews = (market) =>
  fetch(`${BASE}/news?market=${market}`).then(r => r.json());

export const getChart = (ticker, period = '3mo', interval = '1d', market = 'india') =>
  fetch(`${BASE}/chart/${encodeURIComponent(ticker)}?period=${period}&interval=${interval}&market=${market}`).then(r => r.json());

export const getIndices = (market) =>
  fetch(`${BASE}/indices?market=${market}`).then(r => r.json());

export const getAccuracy = (market, date) => {
  const params = new URLSearchParams({ market });
  if (date) params.set('date', date);
  return fetch(`${BASE}/accuracy?${params}`).then(r => r.json());
};

export const streamAnalysis = (ticker, market, onMessage) => {
  const es = new EventSource(`${BASE}/stream/analyze/${encodeURIComponent(ticker)}?market=${market}`);

  es.addEventListener('status', (e) => {
    onMessage({ type: 'status', data: JSON.parse(e.data) });
  });
  es.addEventListener('indicators', (e) => {
    onMessage({ type: 'indicators', data: JSON.parse(e.data) });
  });
  es.addEventListener('signal', (e) => {
    onMessage({ type: 'signal', data: JSON.parse(e.data) });
  });
  es.addEventListener('complete', (e) => {
    onMessage({ type: 'complete', data: JSON.parse(e.data) });
    es.close();
  });
  es.addEventListener('error', () => {
    onMessage({ type: 'error', data: { error: 'Stream error' } });
    es.close();
  });

  return es;
};

export const connectWebSocket = (onMessage) => {
  // In production, BASE is /api (proxied by Vercel), so derive WS URL from the backend directly
  let wsUrl;
  if (BASE.startsWith('http')) {
    wsUrl = BASE.replace(/^http/, 'ws').replace(/\/api$/, '') + '/ws/prices';
  } else {
    // BASE is relative like /api — use Render backend directly for WebSocket
    const renderWs = import.meta.env.VITE_WS_URL || '';
    if (renderWs) {
      wsUrl = renderWs;
    } else {
      // Fallback: construct from current host (works in dev with Vite proxy)
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${proto}//${window.location.host}/ws/prices`;
    }
  }
  const ws = new WebSocket(wsUrl);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onerror = (err) => console.error('WebSocket error:', err);
  ws.onclose = () => {
    setTimeout(() => connectWebSocket(onMessage), 5000);
  };
  return ws;
};
