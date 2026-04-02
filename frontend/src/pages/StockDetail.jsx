import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createChart, ColorType } from 'lightweight-charts';
import TopBar from '../components/TopBar';
import { getChart, getSuggestions, streamAnalysis } from '../api';

export default function StockDetail({ market, setMarket }) {
  const { ticker } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const category = searchParams.get('category') || '';
  const isIntraday = category === 'intraday';
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);

  const [chartData, setChartData] = useState(null);
  const [stockInfo, setStockInfo] = useState(null);
  const [streamLogs, setStreamLogs] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [indicators, setIndicators] = useState(null);

  // Fetch chart data
  useEffect(() => {
    const period = isIntraday ? '1d' : '3mo';
    const interval = isIntraday ? '5m' : '1d';
    getChart(ticker, period, interval, market)
      .then((data) => setChartData(data))
      .catch(console.error);
  }, [ticker, isIntraday, market]);

  // Find stock info from suggestions
  useEffect(() => {
    getSuggestions(market, 'intraday')
      .then((data) => {
        const all = data.suggestions || data.signals || data || [];
        const found = all.find(
          (s) => (s.ticker || s.symbol || '').toUpperCase() === ticker.toUpperCase()
        );
        if (found) setStockInfo(found);
      })
      .catch(() => {});
  }, [ticker, market]);

  // Create chart
  useEffect(() => {
    if (!chartContainerRef.current || !chartData) return;

    const container = chartContainerRef.current;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 400,
      layout: {
        background: { type: ColorType.Solid, color: '#080808' },
        textColor: '#666666',
        fontFamily: 'DM Mono, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1e1e1e' },
        horzLines: { color: '#1e1e1e' },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: '#2a2a2a', labelBackgroundColor: '#c9a84c' },
        horzLine: { color: '#2a2a2a', labelBackgroundColor: '#c9a84c' },
      },
      rightPriceScale: {
        borderColor: '#1e1e1e',
      },
      timeScale: {
        borderColor: '#1e1e1e',
        timeVisible: isIntraday,
        secondsVisible: false,
      },
    });

    const candlestickData = (chartData.candles || chartData.data || chartData || []).map((c) => ({
      time: c.time || c.date || c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })).filter(c => c.time && c.open);

    if (candlestickData.length > 0) {
      const series = chart.addCandlestickSeries({
        upColor: '#00c896',
        downColor: '#ff4560',
        borderDownColor: '#ff4560',
        borderUpColor: '#00c896',
        wickDownColor: '#ff4560',
        wickUpColor: '#00c896',
      });
      series.setData(candlestickData);
      chart.timeScale().fitContent();
    }

    chartRef.current = chart;

    const resizeHandler = () => {
      chart.applyOptions({ width: container.clientWidth });
    };
    window.addEventListener('resize', resizeHandler);

    return () => {
      window.removeEventListener('resize', resizeHandler);
      chart.remove();
      chartRef.current = null;
    };
  }, [chartData, isIntraday]);

  // Stream analysis
  const startAnalysis = useCallback(() => {
    if (streaming) return;
    setStreaming(true);
    setStreamLogs([]);
    setIndicators(null);

    const es = streamAnalysis(ticker, market, (msg) => {
      if (msg.type === 'status') {
        setStreamLogs((prev) => [...prev, { text: msg.data.step || msg.data.message || msg.data.status || JSON.stringify(msg.data), type: 'status' }]);
      } else if (msg.type === 'indicators') {
        setIndicators(msg.data);
        setStreamLogs((prev) => [...prev, { text: '✓ Indicators received', type: 'data' }]);
      } else if (msg.type === 'signal') {
        setStockInfo((prev) => ({ ...prev, ...msg.data }));
        setStreamLogs((prev) => [...prev, { text: `Signal: ${msg.data.signal || msg.data.action}`, type: 'signal' }]);
      } else if (msg.type === 'complete') {
        setStreamLogs((prev) => [...prev, { text: '✓ Analysis complete', type: 'complete' }]);
        setStreaming(false);
      } else if (msg.type === 'error') {
        setStreamLogs((prev) => [...prev, { text: '✗ Error: ' + (msg.data.error || 'Unknown'), type: 'error' }]);
        setStreaming(false);
      }
    });

    return () => es.close();
  }, [ticker, market, streaming]);

  // Auto-start analysis
  useEffect(() => {
    const cleanup = startAnalysis();
    return cleanup;
  }, []);

  const signal = (stockInfo?.signal || stockInfo?.action || '').toUpperCase();
  const price = stockInfo?.price || stockInfo?.ltp || stockInfo?.current_price || 0;
  const changePct = stockInfo?.change_pct ?? stockInfo?.pct_change ?? 0;
  const entry = stockInfo?.entry || stockInfo?.entry_price || 0;
  const stopLoss = stockInfo?.stop_loss || stockInfo?.sl || 0;
  const target = stockInfo?.target || stockInfo?.target_price || 0;
  const confidence = stockInfo?.confidence || stockInfo?.confidence_score || 0;
  const companyName = stockInfo?.company_name || stockInfo?.name || '';
  const exchange = stockInfo?.exchange || '';
  const currencySymbol = exchange?.includes('NS') || exchange?.includes('BO') || market === 'india' ? '₹' : '$';

  const formatPrice = (p) => {
    if (!p) return '-';
    return `${currencySymbol}${Number(p).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const signalColor = signal === 'BUY' ? 'var(--green)' : signal === 'SELL' ? 'var(--red)' : 'var(--orange)';
  const signalBg = signal === 'BUY' ? 'rgba(0,200,150,0.12)' : signal === 'SELL' ? 'rgba(255,69,96,0.12)' : 'rgba(255,140,0,0.12)';
  const signalBorder = signal === 'BUY' ? 'rgba(0,200,150,0.25)' : signal === 'SELL' ? 'rgba(255,69,96,0.25)' : 'rgba(255,140,0,0.25)';

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <TopBar market={market} setMarket={setMarket} />

      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {/* Back link */}
        <button
          onClick={() => navigate('/dashboard')}
          className="text-[11px] uppercase tracking-wider mb-4 transition-colors"
          style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)' }}
          onMouseEnter={(e) => e.target.style.color = 'var(--gold)'}
          onMouseLeave={(e) => e.target.style.color = 'var(--muted)'}
        >
          ← Back to Terminal
        </button>

        {/* Stock header */}
        <div
          className="p-6 rounded-md mb-6"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1
                className="text-[36px] leading-none"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
              >
                {decodeURIComponent(ticker)}
              </h1>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                {companyName}{exchange ? ` · ${exchange}` : ''}
              </p>
            </div>
            {signal && (
              <span
                className="px-3 py-1.5 rounded text-xs uppercase font-medium tracking-wider"
                style={{ background: signalBg, color: signalColor, border: `1px solid ${signalBorder}` }}
              >
                {signal}
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-3 mb-4">
            <span
              className="text-3xl"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--white)' }}
            >
              {price ? formatPrice(price) : '--'}
            </span>
            {changePct !== 0 && (
              <span
                className="text-lg"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: changePct >= 0 ? 'var(--green)' : 'var(--red)',
                }}
              >
                {changePct >= 0 ? '+' : ''}{Number(changePct).toFixed(2)}%
              </span>
            )}
          </div>

          {/* Entry / SL / Target + Confidence */}
          <div className="flex items-center gap-4">
            {[
              { label: 'Entry', value: formatPrice(entry), color: 'var(--white)' },
              { label: 'Stop Loss', value: formatPrice(stopLoss), color: 'var(--red)' },
              { label: 'Target', value: formatPrice(target), color: 'var(--green)' },
            ].map((item) => (
              <div
                key={item.label}
                className="px-3 py-2 rounded"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
              >
                <div className="text-[9px] uppercase mb-0.5" style={{ color: 'var(--muted)', letterSpacing: '0.5px' }}>
                  {item.label}
                </div>
                <div className="text-sm" style={{ fontFamily: 'var(--font-mono)', color: item.color }}>
                  {item.value}
                </div>
              </div>
            ))}

            {/* Confidence */}
            {confidence > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[10px] uppercase" style={{ color: 'var(--muted)' }}>Confidence</span>
                <div className="w-24 h-[3px] rounded-full" style={{ background: 'var(--border)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(confidence, 100)}%`,
                      background: 'linear-gradient(90deg, var(--gold-dim), var(--gold))',
                    }}
                  />
                </div>
                <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>
                  {Math.round(confidence)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid gap-6" style={{ gridTemplateColumns: '60% 40%' }}>
          {/* Left: Chart */}
          <div
            className="rounded-md overflow-hidden"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div className="p-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-[11px] uppercase" style={{ color: 'var(--muted)' }}>{isIntraday ? 'Intraday 5m Chart' : '3M Daily Chart'}</span>
            </div>
            <div ref={chartContainerRef} style={{ width: '100%', minHeight: '400px' }} />
          </div>

          {/* Right: Technical breakdown */}
          <div className="space-y-3">
            <h3
              className="text-[18px]"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
            >
              TECHNICAL BREAKDOWN
            </h3>
            <div className="h-[1px]" style={{ background: 'var(--gold)', width: '40px' }} />

            {indicators ? (
              <div className="space-y-2">
                {[
                  { label: 'RSI (14)', value: indicators.rsi, status: getIndicatorStatus('rsi', indicators.rsi) },
                  { label: 'MACD', value: indicators.macd_histogram, status: getIndicatorStatus('macd', indicators.macd_histogram) },
                  { label: 'EMA 9/21', value: indicators.ema_9 && indicators.ema_21 ? `${indicators.ema_9} / ${indicators.ema_21}` : '-', status: getIndicatorStatus('ema', null, indicators) },
                  { label: 'Bollinger', value: indicators.bb_upper && indicators.bb_lower ? `${indicators.bb_lower} — ${indicators.bb_upper}` : '-', status: getIndicatorStatus('bollinger', null, indicators) },
                  { label: 'VWAP', value: indicators.vwap, status: getIndicatorStatus('vwap', null, indicators) },
                  { label: 'Volume', value: indicators.volume_ratio || '-', status: indicators.volume_ratio ? (indicators.volume_ratio >= 1.5 ? 'High' : 'Normal') : '-' },
                  { label: 'ATR', value: indicators.atr, status: '-' },
                  { label: 'Support / Resistance', value: indicators.support_1 && indicators.resistance_1 ? `${indicators.support_1} / ${indicators.resistance_1}` : '-', status: '-' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="p-3 rounded flex items-center justify-between"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                  >
                    <span className="text-[11px] uppercase" style={{ color: 'var(--muted)' }}>
                      {item.label}
                    </span>
                    <div className="text-right">
                      <span
                        className="text-xs block"
                        style={{ fontFamily: 'var(--font-mono)', color: 'var(--white)' }}
                      >
                        {typeof item.value === 'number' ? item.value.toFixed(2) : item.value}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="p-3 rounded h-12 animate-pulse"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Analysis stream */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3
                className="text-[18px]"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
              >
                AGENT ANALYSIS
              </h3>
              <div className="h-[1px] mt-1" style={{ background: 'var(--gold)', width: '40px' }} />
            </div>
            {!streaming && (
              <button
                onClick={startAnalysis}
                className="px-3 py-1.5 rounded text-[11px] uppercase tracking-wider transition-colors"
                style={{
                  background: 'rgba(201,168,76,0.1)',
                  color: 'var(--gold)',
                  border: '1px solid rgba(201,168,76,0.25)',
                }}
              >
                Re-analyze
              </button>
            )}
          </div>

          <div
            className="p-4 rounded-md max-h-[300px] overflow-y-auto"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {streamLogs.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {streaming ? 'Connecting to analysis stream...' : 'No analysis data yet.'}
              </p>
            ) : (
              streamLogs.map((log, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="py-1 text-xs leading-relaxed"
                  style={{
                    color: log.type === 'error' ? 'var(--red)'
                      : log.type === 'complete' ? 'var(--gold)'
                      : log.type === 'signal' ? 'var(--gold)'
                      : 'var(--green)',
                  }}
                >
                  <span style={{ color: 'var(--muted2)' }}>[{String(i + 1).padStart(2, '0')}]</span>{' '}
                  {log.text}
                </motion.div>
              ))
            )}
            {streaming && (
              <span className="inline-block w-2 h-3 ml-1 blink" style={{ background: 'var(--green)' }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getIndicatorStatus(type, value, indicators) {
  if (type === 'rsi') {
    const num = Number(value);
    if (isNaN(num) || value === null || value === undefined) return '-';
    if (num > 70) return 'Overbought';
    if (num < 30) return 'Oversold';
    return 'Neutral';
  }
  if (type === 'macd') {
    const num = Number(value);
    if (isNaN(num) || value === null || value === undefined) return '-';
    return num > 0 ? 'Bullish' : 'Bearish';
  }
  if (type === 'ema' && indicators) {
    const ema9 = indicators.ema_9;
    const ema21 = indicators.ema_21;
    const price = indicators.current_price;
    if (!ema9 || !ema21) return '-';
    if (price > ema9 && ema9 > ema21) return 'Bullish';
    if (price < ema9 && ema9 < ema21) return 'Bearish';
    return 'Neutral';
  }
  if (type === 'bollinger' && indicators) {
    const price = indicators.current_price;
    const upper = indicators.bb_upper;
    const lower = indicators.bb_lower;
    if (!price || !upper || !lower) return '-';
    if (price >= upper * 0.99) return 'Near Upper';
    if (price <= lower * 1.01) return 'Near Lower';
    return 'Mid-range';
  }
  if (type === 'vwap' && indicators) {
    const price = indicators.current_price;
    const vwap = indicators.vwap;
    if (!price || !vwap) return '-';
    return price > vwap ? 'Above' : 'Below';
  }
  return String(value || '-');
}
