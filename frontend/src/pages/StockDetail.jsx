import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { createChart, ColorType } from 'lightweight-charts';
import {
  ArrowLeft, TrendingUp, TrendingDown, Target, Shield, Zap,
  Clock, BarChart3, Activity, Newspaper, Brain,
} from 'lucide-react';
import { fetchAnalysis, createAnalysisStream } from '../api';

export default function StockDetail({ market }) {
  const { ticker } = useParams();
  const navigate = useNavigate();
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agentLogs, setAgentLogs] = useState([]);
  const [streamComplete, setStreamComplete] = useState(false);

  const decodedTicker = decodeURIComponent(ticker);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setAgentLogs([]);
    setStreamComplete(false);

    fetchAnalysis(decodedTicker, market)
      .then((res) => {
        if (mounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    // Start SSE stream
    const stream = createAnalysisStream(decodedTicker, market, (event) => {
      if (!mounted) return;
      if (event.type === 'status') {
        setAgentLogs((prev) => [...prev, { type: 'status', text: event.data.step }]);
      } else if (event.type === 'signal') {
        setData((prev) => prev ? { ...prev, signal: event.data } : { signal: event.data });
        setAgentLogs((prev) => [...prev, { type: 'signal', text: 'Signal generated' }]);
      } else if (event.type === 'indicators') {
        setData((prev) => prev ? { ...prev, indicators: event.data } : { indicators: event.data });
      } else if (event.type === 'complete') {
        setStreamComplete(true);
        setAgentLogs((prev) => [...prev, { type: 'done', text: 'Analysis complete' }]);
      }
    });

    return () => {
      mounted = false;
      stream?.close();
    };
  }, [decodedTicker, market]);

  // Render chart
  useEffect(() => {
    if (!chartContainerRef.current || !data?.chart_data?.length) return;

    // Clear previous
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#111111' },
        textColor: '#999',
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      crosshair: {
        mode: 0,
      },
      rightPriceScale: {
        borderColor: '#222',
      },
      timeScale: {
        borderColor: '#222',
        timeVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00ff88',
      downColor: '#ff3355',
      borderUpColor: '#00ff88',
      borderDownColor: '#ff3355',
      wickUpColor: '#00ff88',
      wickDownColor: '#ff3355',
    });

    candleSeries.setData(data.chart_data);

    // Volume
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    volumeSeries.setData(
      data.chart_data.map((d) => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(0,255,136,0.2)' : 'rgba(255,51,85,0.2)',
      }))
    );

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data?.chart_data]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Activity className="w-8 h-8 text-accent-green animate-pulse" />
      </div>
    );
  }

  const signal = data?.signal;
  const indicators = data?.indicators || {};
  const info = data?.info || {};
  const isBuy = signal?.signal === 'BUY';
  const isAvoid = signal?.signal === 'AVOID';
  const currency = decodedTicker?.endsWith('.NS') ? '₹' : '$';

  return (
    <div className="max-w-7xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-2 text-gray-400 hover:text-accent-green transition-colors mb-6 text-sm group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Back to Dashboard
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">
            {signal?.name || info?.name || decodedTicker}
          </h1>
          <p className="text-gray-500 text-sm font-mono">{decodedTicker}</p>
        </div>
        {signal && (
          <span className={`text-lg ${isBuy ? 'badge-buy' : isAvoid ? 'badge-avoid' : 'badge-sell'}`}>
            {signal.signal}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Chart + Signal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Candlestick Chart */}
          <div className="card p-0 overflow-hidden">
            <div ref={chartContainerRef} className="w-full" />
          </div>

          {/* Signal Card (expanded) */}
          {signal && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
            >
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-accent-yellow" />
                Trading Signal
              </h2>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-white/5 rounded-xl p-4 text-center">
                  <div className="text-gray-500 text-xs mb-1">Entry</div>
                  <div className="font-mono text-lg font-bold text-white">
                    {currency}{signal.entry?.toFixed(2)}
                  </div>
                </div>
                <div className="bg-white/5 rounded-xl p-4 text-center">
                  <div className="text-gray-500 text-xs mb-1">Stop Loss</div>
                  <div className="font-mono text-lg font-bold text-accent-red">
                    {currency}{signal.sl?.toFixed(2)}
                  </div>
                </div>
                <div className="bg-white/5 rounded-xl p-4 text-center">
                  <div className="text-gray-500 text-xs mb-1">Target</div>
                  <div className="font-mono text-lg font-bold text-accent-green">
                    {currency}{signal.target?.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/5 text-xs text-gray-300 border border-white/10">
                  <Target className="w-3 h-3" /> R:R {signal.rr_ratio}
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/5 text-xs text-gray-300 border border-white/10">
                  <Clock className="w-3 h-3" /> {signal.timeframe}
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/5 text-xs text-gray-300 border border-white/10">
                  <Zap className="w-3 h-3 text-accent-yellow" /> {signal.strategy}
                </span>
              </div>

              {/* Confidence */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-500">Confidence</span>
                  <span className="font-mono text-gray-300">{signal.confidence}%</span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${signal.confidence}%` }}
                    transition={{ duration: 0.6 }}
                    className={`h-2 rounded-full ${
                      signal.confidence >= 70 ? 'bg-accent-green' : signal.confidence >= 50 ? 'bg-accent-yellow' : 'bg-accent-red'
                    }`}
                  />
                </div>
              </div>

              {/* Reasoning */}
              {signal.reasoning && (
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-sm text-gray-300 leading-relaxed">{signal.reasoning}</p>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Technical Indicators */}
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="card"
          >
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-accent-blue" />
              Technical Indicators
            </h2>
            <div className="space-y-3">
              {[
                { label: 'RSI (14)', value: indicators.rsi, color: indicators.rsi > 70 ? 'text-accent-red' : indicators.rsi < 30 ? 'text-accent-green' : 'text-white' },
                { label: 'MACD', value: indicators.macd, color: indicators.macd > 0 ? 'text-accent-green' : 'text-accent-red' },
                { label: 'MACD Signal', value: indicators.macd_signal },
                { label: 'MACD Histogram', value: indicators.macd_histogram, color: indicators.macd_histogram > 0 ? 'text-accent-green' : 'text-accent-red' },
                { label: 'EMA 9', value: indicators.ema_9 },
                { label: 'EMA 21', value: indicators.ema_21 },
                { label: 'EMA 50', value: indicators.ema_50 },
                { label: 'VWAP', value: indicators.vwap },
                { label: 'ATR', value: indicators.atr },
                { label: 'BB Upper', value: indicators.bb_upper },
                { label: 'BB Lower', value: indicators.bb_lower },
                { label: 'Support', value: indicators.support_1 },
                { label: 'Resistance', value: indicators.resistance_1 },
              ].map((ind) =>
                ind.value != null ? (
                  <div key={ind.label} className="flex justify-between text-xs">
                    <span className="text-gray-500">{ind.label}</span>
                    <span className={`font-mono font-medium ${ind.color || 'text-white'}`}>
                      {typeof ind.value === 'number' ? ind.value.toFixed(2) : ind.value}
                    </span>
                  </div>
                ) : null
              )}
            </div>
          </motion.div>

          {/* Fundamentals */}
          {info && info.pe_ratio && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="card"
            >
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent-green" />
                Fundamentals
              </h2>
              <div className="space-y-3">
                {[
                  { label: 'P/E Ratio', value: info.pe_ratio },
                  { label: 'EPS', value: info.eps },
                  { label: 'Market Cap', value: info.market_cap ? `${(info.market_cap / 1e9).toFixed(1)}B` : null },
                  { label: 'D/E Ratio', value: info.debt_to_equity },
                  { label: 'Profit Margin', value: info.profit_margin ? `${(info.profit_margin * 100).toFixed(1)}%` : null },
                  { label: 'Rev. Growth', value: info.revenue_growth ? `${(info.revenue_growth * 100).toFixed(1)}%` : null },
                  { label: '52W High', value: info['52w_high'] },
                  { label: '52W Low', value: info['52w_low'] },
                  { label: 'Beta', value: info.beta },
                ].map((f) =>
                  f.value != null ? (
                    <div key={f.label} className="flex justify-between text-xs">
                      <span className="text-gray-500">{f.label}</span>
                      <span className="font-mono text-white">
                        {typeof f.value === 'number' ? f.value.toFixed(2) : f.value}
                      </span>
                    </div>
                  ) : null
                )}
              </div>
            </motion.div>
          )}

          {/* Agent Log (SSE) */}
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="card"
          >
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              AI Analysis Log
              {!streamComplete && (
                <span className="ml-auto w-2 h-2 rounded-full bg-accent-green animate-pulse" />
              )}
            </h2>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              <AnimatePresence>
                {agentLogs.map((log, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="flex items-start gap-2 text-xs"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                        log.type === 'done'
                          ? 'bg-accent-green'
                          : log.type === 'signal'
                          ? 'bg-accent-yellow'
                          : 'bg-gray-500'
                      }`}
                    />
                    <span className="text-gray-400">{log.text}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {agentLogs.length === 0 && (
                <p className="text-gray-600 text-xs">Waiting for analysis stream...</p>
              )}
            </div>
          </motion.div>

          {/* Sentiment / News */}
          {signal?.top_headline && signal.top_headline !== 'No recent news' && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="card"
            >
              <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-accent-yellow" />
                Sentiment
              </h2>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    signal.sentiment === 'positive'
                      ? 'bg-accent-green/20 text-accent-green'
                      : signal.sentiment === 'negative'
                      ? 'bg-accent-red/20 text-accent-red'
                      : 'bg-white/10 text-gray-400'
                  }`}
                >
                  {signal.sentiment}
                </span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                📰 {signal.top_headline}
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
