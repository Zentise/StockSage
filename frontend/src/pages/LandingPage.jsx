import React, { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Brain, TrendingUp, Shield, Zap, Globe,
  ArrowRight, ChevronDown, BarChart3, Cpu,
} from 'lucide-react';

/* --- Subtle Particle Field --- */
function ParticleField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    class Particle {
      constructor() { this.init(); }
      init() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.3;
        this.vy = (Math.random() - 0.5) * 0.3;
        this.r = Math.random() * 1.2 + 0.4;
        this.alpha = Math.random() * 0.3 + 0.1;
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) this.init();
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = '#c9a84c';
        ctx.globalAlpha = this.alpha;
        ctx.fill();
      }
    }

    const particles = Array.from({ length: 60 }, () => new Particle());

    function drawConnections() {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = '#c9a84c';
            ctx.globalAlpha = (1 - d / 100) * 0.05;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    }

    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      particles.forEach(p => { p.update(); p.draw(); });
      drawConnections();
      animId = requestAnimationFrame(loop);
    }
    loop();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

/* --- Animated Counter --- */
function AnimCounter({ target, suffix = '', prefix = '' }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          let start = null;
          const duration = 1800;
          const step = (ts) => {
            if (!start) start = ts;
            const p = Math.min((ts - start) / duration, 1);
            setVal(Math.round((1 - Math.pow(1 - p, 3)) * target));
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.4 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
}

/* --- Mock Signal Card --- */
function MockCard({ ticker, name, signal, price, change, confidence, color }) {
  return (
    <div
      className="rounded-md p-5"
      style={{
        background: 'var(--card)',
        border: `1px solid ${color}30`,
        boxShadow: `0 0 30px ${color}10`,
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div
            className="text-lg"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
          >
            {name}
          </div>
          <div className="text-xs mt-0.5" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
            {ticker}
          </div>
        </div>
        <span
          className="text-[10px] uppercase font-medium px-2 py-1 rounded"
          style={{ color, background: `${color}18`, border: `1px solid ${color}35` }}
        >
          {signal}
        </span>
      </div>
      <div
        className="text-2xl mb-0.5"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--white)' }}
      >
        {price}
      </div>
      <div className="text-xs mb-4" style={{ fontFamily: 'var(--font-mono)', color }}>{change}</div>
      <svg viewBox="0 0 200 40" className="w-full mb-4">
        <defs>
          <linearGradient id={`g-${ticker}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points="0,35 30,28 65,22 100,14 130,18 165,8 200,5 200,40 0,40"
          fill={`url(#g-${ticker})`}
        />
        <polyline
          points="0,35 30,28 65,22 100,14 130,18 165,8 200,5"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.8"
        />
      </svg>
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span style={{ color: 'var(--muted)' }}>AI Confidence</span>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>{confidence}%</span>
      </div>
      <div className="w-full rounded-full h-[3px]" style={{ background: 'var(--border)' }}>
        <div
          className="h-[3px] rounded-full"
          style={{
            width: `${confidence}%`,
            background: `linear-gradient(90deg, var(--gold-dim), var(--gold))`,
          }}
        />
      </div>
    </div>
  );
}

/* --- Main Landing Page --- */
export default function LandingPage() {
  const navigate = useNavigate();
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 600], [0, -120]);
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);

  const features = [
    {
      icon: Brain,
      title: 'Multi-Agent AI',
      desc: 'CrewAI-powered specialist agents handle technical, fundamental, and sentiment analysis in parallel.',
      color: 'var(--gold)',
    },
    {
      icon: TrendingUp,
      title: 'Precise Signals',
      desc: 'Every BUY/SELL signal comes with exact entry price, stop-loss, and target with R:R ratio.',
      color: 'var(--green)',
    },
    {
      icon: Globe,
      title: 'Dual Markets',
      desc: 'Full coverage of Indian NSE and US NYSE/NASDAQ with real-time market status awareness.',
      color: 'var(--gold2)',
    },
    {
      icon: Shield,
      title: 'Risk Management',
      desc: 'Automated stop-loss calculation and risk-reward analysis protects every position.',
      color: 'var(--red)',
    },
    {
      icon: Cpu,
      title: 'Live Scanner',
      desc: 'Continuous AI-driven scanner discovers breakout opportunities before the crowd.',
      color: 'var(--orange)',
    },
    {
      icon: BarChart3,
      title: 'Deep Technicals',
      desc: 'RSI, MACD, Bollinger Bands, EMA crossovers and 20+ indicators analyzed automatically.',
      color: 'var(--green)',
    },
  ];

  const stats = [
    { label: 'Stocks Tracked', value: 500, suffix: '+' },
    { label: 'AI Agents', value: 5, suffix: '' },
    { label: 'Indicators', value: 20, suffix: '+' },
    { label: 'Avg Confidence', value: 78, suffix: '%' },
  ];

  const steps = [
    { num: '01', title: 'Select Market', desc: 'Choose India (NSE) or US markets and connect live data feeds' },
    { num: '02', title: 'AI Crew Scans', desc: 'Multi-agent system analyzes hundreds of stocks simultaneously' },
    { num: '03', title: 'Act on Signals', desc: 'Receive precise BUY/SELL signals with entry, target & stop-loss' },
  ];

  const techs = ['CrewAI', 'FastAPI', 'React', 'yFinance', 'Groq LLM', 'WebSocket'];

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: 'var(--bg)' }}>
      <ParticleField />

      {/* Navbar */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-4"
        style={{
          background: 'rgba(8,8,8,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[24px] tracking-wide"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}
          >
            STOCKSAGE
          </span>
          <span
            className="gold-pulse inline-block w-2 h-2 rounded-full"
            style={{ background: 'var(--gold)' }}
          />
        </div>
        <motion.button
          onClick={() => navigate('/dashboard')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-5 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            background: 'rgba(201,168,76,0.12)',
            color: 'var(--gold)',
            border: '1px solid rgba(201,168,76,0.3)',
          }}
        >
          Dashboard <ArrowRight className="w-4 h-4" />
        </motion.button>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center px-6 pt-20">
        {/* Ambient glow */}
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full blur-[130px] pointer-events-none" style={{ background: 'rgba(201,168,76,0.04)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full blur-[130px] pointer-events-none" style={{ background: 'rgba(0,200,150,0.03)' }} />

        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="relative z-10 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center"
        >
          {/* Left: Text */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium mb-6"
              style={{
                background: 'rgba(201,168,76,0.1)',
                border: '1px solid rgba(201,168,76,0.25)',
                color: 'var(--gold)',
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full gold-pulse" style={{ background: 'var(--gold)' }} />
              AI-Powered Trading Intelligence
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.7 }}
              className="text-5xl md:text-6xl xl:text-7xl leading-[1.05] mb-6"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
            >
              TRADE SMARTER<br />
              <span style={{ color: 'var(--gold)' }}>WITH AI AGENTS</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7 }}
              className="text-base leading-relaxed mb-8 max-w-lg"
              style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)' }}
            >
              A crew of specialized AI agents works around the clock — scanning markets,
              analyzing patterns, and generating precise trading signals for Indian & US stocks.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.7 }}
              className="flex flex-wrap gap-4 mb-8"
            >
              <motion.button
                onClick={() => navigate('/dashboard')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-8 py-4 rounded-md text-base font-medium transition-all"
                style={{
                  background: 'var(--gold)',
                  color: '#000',
                  fontFamily: 'var(--font-body)',
                }}
              >
                Launch Terminal
                <ArrowRight className="w-5 h-5" />
              </motion.button>
              <motion.button
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-8 py-4 rounded-md text-base font-medium transition-all"
                style={{
                  background: 'transparent',
                  color: 'var(--white)',
                  border: '1px solid var(--border2)',
                }}
              >
                Explore Features
              </motion.button>
            </motion.div>

            {/* Tech badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              className="flex flex-wrap gap-2"
            >
              {techs.map((t) => (
                <span
                  key={t}
                  className="px-3 py-1 rounded text-xs"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border)',
                    color: 'var(--muted)',
                  }}
                >
                  {t}
                </span>
              ))}
            </motion.div>
          </div>

          {/* Right: Card Stack */}
          <div className="relative h-[520px] hidden lg:block">
            <div style={{ perspective: '1400px' }} className="relative w-full h-full">
              {/* Back card */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.45, rotateY: -18, rotateX: 6 }}
                transition={{ duration: 1, delay: 0.6 }}
                style={{ position: 'absolute', top: '5%', right: '-2%', zIndex: 1, transformStyle: 'preserve-3d' }}
                className="w-52"
              >
                <MockCard
                  ticker="AAPL"
                  name="Apple Inc."
                  signal="BUY"
                  price="$189.50"
                  change="+1.8% today"
                  confidence={72}
                  color="#00c896"
                />
              </motion.div>

              {/* Mid card */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.7, rotateY: -8, rotateX: 3 }}
                transition={{ duration: 1, delay: 0.4 }}
                style={{ position: 'absolute', top: '25%', right: '5%', zIndex: 2, transformStyle: 'preserve-3d' }}
                className="w-56"
              >
                <MockCard
                  ticker="RELIANCE.NS"
                  name="Reliance Industries"
                  signal="BUY"
                  price="₹2,842"
                  change="+2.4% today"
                  confidence={81}
                  color="#c9a84c"
                />
              </motion.div>

              {/* Front hero card */}
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.1 }}
                whileHover={{ rotateY: 4, rotateX: -4, scale: 1.02 }}
                style={{
                  position: 'absolute', top: '12%', left: '0%', zIndex: 3,
                  transformStyle: 'preserve-3d',
                }}
                className="w-72"
              >
                <MockCard
                  ticker="TATAMOTORS.NS"
                  name="Tata Motors Ltd"
                  signal="BUY"
                  price="₹960.40"
                  change="+3.2% today"
                  confidence={87}
                  color="#00c896"
                />
              </motion.div>

              {/* Floating badge: AI scanning */}
              <motion.div
                animate={{ y: [-6, 6, -6] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ position: 'absolute', bottom: '12%', left: '2%', zIndex: 4 }}
              >
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-md"
                  style={{
                    background: 'rgba(19,19,19,0.95)',
                    border: '1px solid rgba(201,168,76,0.3)',
                    boxShadow: '0 0 20px rgba(201,168,76,0.1)',
                  }}
                >
                  <Brain className="w-4 h-4" style={{ color: 'var(--gold)' }} />
                  <span className="text-xs" style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>
                    AI analyzing sentiment...
                  </span>
                  <div className="flex gap-0.5">
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="w-1 h-3 rounded-full"
                        style={{ background: 'var(--gold)' }}
                        animate={{ scaleY: [0.4, 1, 0.4] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* Floating badge: Signal detected */}
              <motion.div
                animate={{ y: [6, -6, 6] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ position: 'absolute', top: '2%', left: '35%', zIndex: 4 }}
              >
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-md"
                  style={{
                    background: 'rgba(19,19,19,0.95)',
                    border: '1px solid rgba(0,200,150,0.3)',
                    boxShadow: '0 0 20px rgba(0,200,150,0.1)',
                  }}
                >
                  <Zap className="w-4 h-4" style={{ color: 'var(--green)' }} />
                  <span className="text-xs" style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>
                    Signal detected
                  </span>
                  <span className="w-2 h-2 rounded-full blink" style={{ background: 'var(--green)' }} />
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Scroll cue */}
        <motion.button
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          onClick={() => document.getElementById('stats')?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 transition-colors z-10"
          style={{ color: 'var(--muted2)' }}
        >
          <span className="text-xs">scroll to explore</span>
          <ChevronDown className="w-4 h-4" />
        </motion.button>
      </section>

      {/* Stats */}
      <section id="stats" className="relative py-16 z-10" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map(({ label, value, suffix }) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div
                className="text-4xl md:text-5xl mb-2"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}
              >
                <AnimCounter target={value} suffix={suffix} />
              </div>
              <div className="text-sm" style={{ color: 'var(--muted)' }}>{label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative py-24 px-6 z-10">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium mb-5"
              style={{
                background: 'rgba(201,168,76,0.1)',
                border: '1px solid rgba(201,168,76,0.25)',
                color: 'var(--gold)',
              }}
            >
              <Zap className="w-3 h-3" /> Powered by AI
            </div>
            <h2
              className="text-3xl md:text-4xl lg:text-5xl mb-4"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
            >
              EVERYTHING YOU NEED TO TRADE<br />
              <span style={{ color: 'var(--gold)' }}>WITH CONFIDENCE</span>
            </h2>
            <p className="max-w-xl mx-auto text-base" style={{ color: 'var(--muted)' }}>
              From raw market data to actionable signals — StockSage handles all the heavy lifting.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map(({ icon: Icon, title, desc, color }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ y: -4 }}
                className="relative rounded-md p-6 overflow-hidden group cursor-default transition-all duration-200"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="relative z-10">
                  <div
                    className="w-12 h-12 rounded-md flex items-center justify-center mb-4"
                    style={{
                      background: 'rgba(201,168,76,0.08)',
                      border: '1px solid var(--border2)',
                    }}
                  >
                    <Icon className="w-6 h-6" style={{ color }} />
                  </div>
                  <h3
                    className="text-lg mb-2"
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
                  >
                    {title.toUpperCase()}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative py-24 px-6 z-10" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2
              className="text-3xl md:text-4xl mb-3"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
            >
              HOW IT <span style={{ color: 'var(--gold)' }}>WORKS</span>
            </h2>
            <p style={{ color: 'var(--muted)' }}>Three simple steps from market open to signal</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative">
            {/* Connecting line */}
            <div
              className="hidden md:block absolute top-8 left-[22%] right-[22%] h-px"
              style={{ background: 'linear-gradient(90deg, var(--gold-dim), var(--gold), var(--gold-dim))' }}
            />
            {steps.map(({ num, title, desc }, i) => (
              <motion.div
                key={num}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="text-center relative"
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-xl mx-auto mb-6 relative z-10"
                  style={{
                    fontFamily: 'var(--font-display)',
                    background: 'rgba(201,168,76,0.1)',
                    border: '2px solid rgba(201,168,76,0.4)',
                    color: 'var(--gold)',
                  }}
                >
                  {num}
                </div>
                <h3
                  className="text-lg mb-2"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
                >
                  {title.toUpperCase()}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-28 px-6 overflow-hidden z-10">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[700px] h-[400px] rounded-full blur-[120px]" style={{ background: 'rgba(201,168,76,0.04)' }} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center relative z-10"
        >
          <h2
            className="text-4xl md:text-5xl lg:text-6xl mb-5 leading-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
          >
            READY TO TRADE<br />
            <span style={{ color: 'var(--gold)' }}>SMARTER?</span>
          </h2>
          <p className="text-lg mb-10 max-w-xl mx-auto" style={{ color: 'var(--muted)' }}>
            Join traders using AI-powered signals to find opportunities in Indian and US markets every day.
          </p>
          <motion.button
            onClick={() => navigate('/dashboard')}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center gap-2 px-10 py-4 rounded-md text-lg font-medium"
            style={{
              background: 'var(--gold)',
              color: '#000',
              fontFamily: 'var(--font-body)',
            }}
          >
            Launch Terminal <ArrowRight className="w-5 h-5" />
          </motion.button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-6 px-6 text-center" style={{ borderTop: '1px solid var(--border)' }}>
        <p className="text-xs" style={{ color: 'var(--muted2)' }}>
          StockSage — AI-powered trading signals. Not financial advice. Trade at your own risk.
        </p>
      </footer>
    </div>
  );
}
