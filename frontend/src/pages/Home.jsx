import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import TickerStrip from '../components/TickerStrip';
import CategoryTabs from '../components/CategoryTabs';
import SuggestionCard from '../components/SuggestionCard';
import { getSuggestions, triggerScan, getNews, getIndices, connectWebSocket } from '../api';

export default function Home({ market, setMarket }) {
  const navigate = useNavigate();
  const [category, setCategory] = useState('all');
  const [allCards, setAllCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [news, setNews] = useState([]);
  const [indices, setIndices] = useState([]);
  const [lastScan, setLastScan] = useState(null);
  const [closedReason, setClosedReason] = useState(null);
  const refreshTimer = useRef(null);

  // Derived: filter cards client-side based on active category tab
  const cards = category === 'all'
    ? allCards
    : allCards.filter(s => s.category === category);

  // Fetch ALL suggestions (no category filter) and store in allCards
  const fetchCards = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getSuggestions(market, 'all');
      setAllCards(data.suggestions || data.signals || data || []);
      setClosedReason(data.closed_reason || null);
      setLastScan(new Date());
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
      setAllCards([]);
    } finally {
      setLoading(false);
    }
  }, [market]);

  // Trigger a real backend scan then refresh cards
  const handleRefresh = useCallback(async () => {
    try {
      setLoading(true);
      const scanResult = await triggerScan(market);
      if (scanResult.closed_reason) {
        setAllCards([]);
        setClosedReason(scanResult.closed_reason);
        setLastScan(new Date());
        return;
      }
      // Use the scan result directly (it includes fresh suggestions)
      const suggestions = scanResult.suggestions || [];
      setClosedReason(null);
      setAllCards(suggestions);
      setLastScan(new Date());
    } catch (err) {
      console.error('Failed to trigger scan:', err);
      // Fallback to cached suggestions
      await fetchCards();
    } finally {
      setLoading(false);
    }
  }, [market, fetchCards]);

  // Clear cards immediately when market changes so stale data doesn't linger
  useEffect(() => {
    setAllCards([]);
    setClosedReason(null);
  }, [market]);

  // Fetch news
  const fetchNewsData = useCallback(async () => {
    try {
      const data = await getNews(market);
      setNews(data.news || data.articles || data || []);
    } catch (err) {
      console.error('Failed to fetch news:', err);
    }
  }, [market]);

  // Fetch indices
  const fetchIndicesData = useCallback(async () => {
    try {
      const data = await getIndices(market);
      setIndices(data.indices || data || []);
    } catch (err) {
      console.error('Failed to fetch indices:', err);
    }
  }, [market]);

  // Auto-refresh suggestions every 60s
  useEffect(() => {
    fetchCards();
    refreshTimer.current = setInterval(fetchCards, 60000);
    return () => clearInterval(refreshTimer.current);
  }, [fetchCards]);

  // Fetch news every 2 min
  useEffect(() => {
    fetchNewsData();
    const interval = setInterval(fetchNewsData, 120000);
    return () => clearInterval(interval);
  }, [fetchNewsData]);

  // Fetch indices on market change
  useEffect(() => {
    fetchIndicesData();
  }, [fetchIndicesData]);

  // Count signals
  const buyCount = cards.filter(c => (c.signal || c.action || '').toUpperCase() === 'BUY').length;
  const sellCount = cards.filter(c => (c.signal || c.action || '').toUpperCase() === 'SELL').length;
  const avoidCount = cards.filter(c => (c.signal || c.action || '').toUpperCase() === 'AVOID').length;
  const avgConfidence = cards.length > 0
    ? Math.round(cards.reduce((sum, c) => sum + (c.confidence || c.confidence_score || 0), 0) / cards.length)
    : 0;

  // Category counts for tab badges
  const categoryCounts = {
    all: allCards.length,
    intraday: allCards.filter(s => s.category === 'intraday').length,
    short_term: allCards.filter(s => s.category === 'short_term').length,
    long_term: allCards.filter(s => s.category === 'long_term').length,
  };

  const now = new Date();
  const hour = now.getHours();
  const isMarketOpen = !closedReason && (market === 'india'
    ? (hour >= 9 && hour < 16)
    : (hour >= 9 && hour < 16));

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <TopBar market={market} setMarket={setMarket} />
      <TickerStrip market={market} />

      <div
        className="mx-auto px-6 py-6"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          gap: '0',
          maxWidth: '1440px',
        }}
      >
        {/* Left panel - Main content */}
        <div className="pr-6">
          {/* Section header */}
          <div className="mb-6">
            <div className="gold-divider" />
            <div className="flex items-center gap-3 mb-1">
              <h1
                className="text-[32px] leading-none"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
              >
                TODAY'S SIGNALS
              </h1>
              <span
                className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase"
                style={{
                  background: isMarketOpen ? 'rgba(0,200,150,0.1)' : 'rgba(255,69,96,0.1)',
                  color: isMarketOpen ? 'var(--green)' : 'var(--red)',
                  border: `1px solid ${isMarketOpen ? 'rgba(0,200,150,0.2)' : 'rgba(255,69,96,0.2)'}`,
                }}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full blink"
                  style={{ background: isMarketOpen ? 'var(--green)' : 'var(--red)' }}
                />
                {isMarketOpen ? 'Market Open' : 'Market Closed'}
              </span>
              <button
                onClick={() => { handleRefresh(); fetchNewsData(); fetchIndicesData(); }}
                className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] uppercase tracking-wider transition-colors"
                style={{
                  background: 'rgba(201,168,76,0.08)',
                  color: 'var(--gold)',
                  border: '1px solid rgba(201,168,76,0.2)',
                }}
                title="Refresh data"
              >
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
            <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              AI-generated · Updated {lastScan ? lastScan.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'} · {cards.length} active signals
            </p>
          </div>

          {/* Category tabs */}
          <div className="mb-5">
            <CategoryTabs active={category} onChange={setCategory} counts={categoryCounts} />
          </div>

          {/* Cards grid */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`${market}-${category}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
            >
              {loading && cards.length === 0 ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-md h-64 animate-pulse"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                  />
                ))
              ) : cards.length === 0 ? (
                <div
                  className="col-span-2 text-center py-16"
                  style={{ color: 'var(--muted)' }}
                >
                  {closedReason ? (
                    <>
                      <p className="text-sm" style={{ color: 'var(--gold)' }}>
                        {market === 'india' ? '🇮🇳' : '🇺🇸'} Market is closed — {closedReason}
                      </p>
                      <p className="text-xs mt-2" style={{ color: 'var(--muted2)' }}>
                        Stock recommendations are not available during holidays and weekends.
                        <br />Check back when the market reopens.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm">No signals available for this category.</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--muted2)' }}>
                        Signals are generated during market hours.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                cards.map((card, i) => (
                  <SuggestionCard key={card.ticker || card.symbol || i} card={card} index={i} />
                ))
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right panel - Sidebar */}
        <div
          className="pl-6"
          style={{ borderLeft: '1px solid var(--border)' }}
        >
          {/* Markets section */}
          <div className="mb-6">
            <h2
              className="text-[18px] mb-1"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
            >
              MARKETS
            </h2>
            <div className="h-[1px] mb-3" style={{ background: 'var(--gold)', width: '100%' }} />

            <div className="grid grid-cols-2 gap-2">
              {indices.length > 0 ? (
                indices.slice(0, 4).map((idx, i) => (
                  <div
                    key={idx.name || i}
                    className="p-2.5 rounded"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                  >
                    <div
                      className="text-[10px] uppercase mb-1"
                      style={{ color: 'var(--muted)', letterSpacing: '0.5px' }}
                    >
                      {idx.name || idx.ticker}
                    </div>
                    <div
                      className="text-[15px]"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--white)' }}
                    >
                      {typeof idx.value === 'number'
                        ? idx.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                        : idx.price?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '--'}
                    </div>
                    <div
                      className="text-[11px]"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: (idx.change_pct || idx.pct_change || 0) >= 0 ? 'var(--green)' : 'var(--red)',
                      }}
                    >
                      {(idx.change_pct || idx.pct_change || 0) >= 0 ? '+' : ''}
                      {(idx.change_pct || idx.pct_change || 0).toFixed(2)}%
                    </div>
                  </div>
                ))
              ) : (
                Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded h-16 animate-pulse"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                  />
                ))
              )}
            </div>
          </div>

          {/* Live News section */}
          <div className="mb-6">
            <h2
              className="text-[18px] mb-1"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
            >
              LIVE NEWS
            </h2>
            <div className="h-[1px] mb-3" style={{ background: 'var(--gold)', width: '100%' }} />

            <div className="space-y-0 max-h-[360px] overflow-y-auto">
              {news.length > 0 ? (
                news.slice(0, 6).map((item, i) => {
                  const headline = item.headline || item.title || '';
                  const ticker = item.ticker || item.symbol || '';
                  const sentiment = item.sentiment || '';
                  const timeAgo = item.time_ago || item.published || '';
                  const newsUrl = item.url || '';
                  return (
                    <a
                      key={i}
                      href={newsUrl || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block py-3 cursor-pointer group"
                      style={{ borderBottom: '1px solid var(--border)', textDecoration: 'none' }}
                    >
                      <p
                        className="text-xs leading-relaxed transition-colors"
                        style={{ color: 'var(--white)' }}
                        onMouseEnter={(e) => e.target.style.color = 'var(--gold)'}
                        onMouseLeave={(e) => e.target.style.color = 'var(--white)'}
                      >
                        {headline}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {ticker && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] uppercase font-medium"
                            style={{
                              background: sentiment === 'negative' || sentiment === 'bearish'
                                ? 'rgba(255,69,96,0.15)' : 'rgba(0,200,150,0.15)',
                              color: sentiment === 'negative' || sentiment === 'bearish'
                                ? 'var(--red)' : 'var(--green)',
                            }}
                          >
                            {ticker}
                          </span>
                        )}
                        <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                          {timeAgo}
                        </span>
                        {newsUrl && (
                          <span className="text-[10px] ml-auto" style={{ color: 'var(--gold)' }}>↗</span>
                        )}
                      </div>
                    </a>
                  );
                })
              ) : (
                <p className="text-xs py-4" style={{ color: 'var(--muted)' }}>
                  No news available.
                </p>
              )}
            </div>
          </div>

          {/* Session Summary */}
          <div>
            <h2
              className="text-[18px] mb-1"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
            >
              SESSION SUMMARY
            </h2>
            <div className="h-[1px] mb-3" style={{ background: 'var(--gold)', width: '100%' }} />

            <div
              className="p-4 rounded-md space-y-2.5"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div className="flex justify-between">
                <span className="text-[11px] uppercase" style={{ color: 'var(--muted)' }}>Total Signals</span>
                <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--white)' }}>
                  {cards.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[11px] uppercase" style={{ color: 'var(--muted)' }}>BUY</span>
                <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
                  {buyCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[11px] uppercase" style={{ color: 'var(--muted)' }}>SELL</span>
                <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>
                  {sellCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[11px] uppercase" style={{ color: 'var(--muted)' }}>AVOID</span>
                <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--orange)' }}>
                  {avoidCount}
                </span>
              </div>
              <div className="h-[1px]" style={{ background: 'var(--border)' }} />
              <div className="flex justify-between">
                <span className="text-[11px] uppercase" style={{ color: 'var(--muted)' }}>Avg Confidence</span>
                <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>
                  {avgConfidence}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[11px] uppercase" style={{ color: 'var(--muted)' }}>Last Scan</span>
                <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                  {lastScan ? lastScan.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[11px] uppercase" style={{ color: 'var(--muted)' }}>Next Scan</span>
                <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                  {lastScan
                    ? new Date(lastScan.getTime() + 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '--:--'}
                </span>
              </div>
              <div className="h-[1px] mt-1" style={{ background: 'var(--border)' }} />
              <button
                onClick={() => navigate('/accuracy')}
                className="w-full mt-1 py-2 rounded text-[11px] uppercase tracking-wider transition-colors text-center"
                style={{
                  background: 'rgba(201,168,76,0.08)',
                  color: 'var(--gold)',
                  border: '1px solid rgba(201,168,76,0.2)',
                }}
              >
                View Accuracy Dashboard →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
