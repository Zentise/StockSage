import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Brain, TrendingUp, Shield, Zap, Globe,
  ArrowRight, ChevronDown, BarChart3, Target, Cpu,
} from 'lucide-react';

/* ─── Particle Network Background ─── */
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

    const COLORS = ['#00ff88', '#a855f7', '#00d4ff', '#ff0080'];

    class Particle {
      constructor() { this.init(); }
      init() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.4;
        this.vy = (Math.random() - 0.5) * 0.4;
        this.r = Math.random() * 1.5 + 0.5;
        this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
        this.alpha = Math.random() * 0.5 + 0.15;
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) this.init();
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.alpha;
        ctx.fill();
      }
    }

    const particles = Array.from({ length: 90 }, () => new Particle());

    function drawConnections() {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 110) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = '#00ff88';
            ctx.globalAlpha = (1 - d / 110) * 0.07;
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

/* ─── Animated Counter ─── */
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

/* ─── Mock Stock Signal Card ─── */
function MockCard({ ticker, name, signal, price, change, confidence, color, style }) {
  return (
    <div
      className="rounded-2xl p-5 backdrop-blur-xl"
      style={{
        background: 'rgba(13,13,21,0.92)',
        border: `1px solid ${color}30`,
        boxShadow: `0 0 40px ${color}15`,
        ...style,
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-white font-bold text-sm">{name}</div>
          <div className="text-gray-500 text-xs font-mono mt-0.5">{ticker}</div>
        </div>
        <span
          className="text-xs font-black px-2.5 py-1 rounded-full"
          style={{ color, background: `${color}20`, border: `1px solid ${color}40` }}
        >
          {signal}
        </span>
      </div>
      <div className="text-2xl font-mono font-black text-white mb-0.5">{price}</div>
      <div className="text-xs font-mono font-semibold mb-4" style={{ color }}>{change}</div>
      {/* Fake SVG chart */}
      <svg viewBox="0 0 200 40" className="w-full mb-4">
        <defs>
          <linearGradient id={`g-${ticker}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
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
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.9"
        />
      </svg>
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-gray-500">AI Confidence</span>
        <span className="font-mono text-gray-300">{confidence}%</span>
      </div>
      <div className="w-full rounded-full h-1.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-1.5 rounded-full"
          style={{ width: `${confidence}%`, background: color }}
        />
      </div>
    </div>
  );
}

/* ─── Main Landing Page ─── */
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
      color: '#a855f7',
    },
    {
      icon: TrendingUp,
      title: 'Precise Signals',
      desc: 'Every BUY/SELL signal comes with exact entry price, stop-loss, and target with R:R ratio.',
      color: '#00ff88',
    },
    {
      icon: Globe,
      title: 'Dual Markets',
      desc: 'Full coverage of Indian NSE and US NYSE/NASDAQ with real-time market status awareness.',
      color: '#00d4ff',
    },
    {
      icon: Shield,
      title: 'Risk Management',
      desc: 'Automated stop-loss calculation and risk-reward analysis protects every position.',
      color: '#ff0080',
    },
    {
      icon: Cpu,
      title: 'Live Scanner',
      desc: 'Continuous AI-driven scanner discovers breakout opportunities before the crowd.',
      color: '#ffd700',
    },
    {
      icon: BarChart3,
      title: 'Deep Technicals',
      desc: 'RSI, MACD, Bollinger Bands, EMA crossovers and 20+ indicators analyzed automatically.',
      color: '#3b82f6',
    },
  ];

  const stats = [
    { label: 'Stocks Tracked', value: 500, suffix: '+', color: '#00ff88' },
    { label: 'AI Agents', value: 5, suffix: '', color: '#a855f7' },
    { label: 'Indicators', value: 20, suffix: '+', color: '#00d4ff' },
    { label: 'Avg Confidence', value: 78, suffix: '%', color: '#ffd700' },
  ];

  const steps = [
    { num: '01', title: 'Select Market', desc: 'Choose India (NSE) or US markets and connect live data feeds', color: '#00ff88' },
    { num: '02', title: 'AI Crew Scans', desc: 'Multi-agent system analyzes hundreds of stocks simultaneously', color: '#a855f7' },
    { num: '03', title: 'Act on Signals', desc: 'Receive precise BUY/SELL signals with entry, target & stop-loss', color: '#00d4ff' },
  ];

  const techs = ['CrewAI', 'FastAPI', 'React', 'yFinance', 'Groq LLM', 'WebSocket'];

  return (
    <div className="min-h-screen bg-[#050507] overflow-x-hidden">
      <ParticleField />

      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-4 bg-[#050507]/80 backdrop-blur-xl border-b border-white/5">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-[#00ff88]" />
          <span className="text-lg font-black text-white tracking-tight">
            Stock<span className="text-[#00ff88]">Sage</span>
          </span>
        </div>
        <motion.button
          onClick={() => navigate('/dashboard')}
          whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(0,255,136,0.3)' }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/30 text-sm font-bold hover:bg-[#00ff88]/20 transition-colors"
        >
          Dashboard <ArrowRight className="w-4 h-4" />
        </motion.button>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center justify-center px-6 pt-20">
        {/* Ambient glow orbs */}
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-[#00ff88]/4 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-[#a855f7]/4 blur-[130px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] rounded-full bg-[#00d4ff]/2 blur-[180px] pointer-events-none" />

        {/* Grid overlay */}
        <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />

        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="relative z-10 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center"
        >
          {/* ── Left: Text ── */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/25 text-[#00ff88] text-xs font-bold mb-6"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
              AI-Powered Trading Intelligence
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.7 }}
              className="text-5xl md:text-6xl xl:text-7xl font-black text-white leading-[1.05] mb-6"
            >
              Trade Smarter<br />
              <span className="gradient-text">with AI Agents</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7 }}
              className="text-gray-400 text-lg leading-relaxed mb-8 max-w-lg"
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
                whileHover={{ scale: 1.05, boxShadow: '0 0 40px rgba(0,255,136,0.5)' }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-8 py-4 rounded-xl bg-[#00ff88] text-black font-black text-base transition-all"
              >
                <Activity className="w-5 h-5" />
                Launch Dashboard
                <ArrowRight className="w-5 h-5" />
              </motion.button>
              <motion.button
                onClick={() => document.getElementById('features').scrollIntoView({ behavior: 'smooth' })}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-8 py-4 rounded-xl bg-white/5 text-white font-semibold text-base border border-white/10 hover:bg-white/8 transition-all"
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
                  className="px-3 py-1 rounded-full bg-white/5 border border-white/8 text-gray-500 text-xs"
                >
                  {t}
                </span>
              ))}
            </motion.div>
          </div>

          {/* ── Right: 3D Card Stack ── */}
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
                  color="#00d4ff"
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
                  color="#a855f7"
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
                  color="#00ff88"
                />
              </motion.div>

              {/* Floating badge: AI scanning */}
              <motion.div
                animate={{ y: [-6, 6, -6] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ position: 'absolute', bottom: '12%', left: '2%', zIndex: 4 }}
              >
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(13,13,21,0.95)', border: '1px solid rgba(168,85,247,0.35)', boxShadow: '0 0 20px rgba(168,85,247,0.2)' }}
                >
                  <Brain className="w-4 h-4 text-[#a855f7]" />
                  <span className="text-xs text-gray-300 font-medium">AI analyzing sentiment...</span>
                  <div className="flex gap-0.5">
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="w-1 h-3 rounded-full bg-[#a855f7]"
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
                  className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(13,13,21,0.95)', border: '1px solid rgba(0,212,255,0.35)', boxShadow: '0 0 20px rgba(0,212,255,0.2)' }}
                >
                  <Zap className="w-4 h-4 text-[#00d4ff]" />
                  <span className="text-xs text-gray-300 font-medium">Signal detected</span>
                  <span className="w-2 h-2 rounded-full bg-[#00d4ff] animate-pulse" />
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Scroll cue */}
        <motion.button
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          onClick={() => document.getElementById('stats').scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-600 hover:text-gray-400 transition-colors z-10"
        >
          <span className="text-xs">scroll to explore</span>
          <ChevronDown className="w-4 h-4" />
        </motion.button>
      </section>

      {/* ── Stats ── */}
      <section id="stats" className="relative py-16 border-y border-white/5 z-10">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map(({ label, value, suffix, color }) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div
                className="text-4xl md:text-5xl font-black mb-2"
                style={{ color, textShadow: `0 0 30px ${color}50` }}
              >
                <AnimCounter target={value} suffix={suffix} />
              </div>
              <div className="text-gray-400 text-sm">{label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="relative py-24 px-6 z-10">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#a855f7]/10 border border-[#a855f7]/25 text-[#a855f7] text-xs font-bold mb-5">
              <Zap className="w-3 h-3" /> Powered by AI
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-white mb-4">
              Everything you need to trade<br />
              <span className="gradient-text-purple">with confidence</span>
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-base">
              From raw market data to actionable signals — StockSage handles all the heavy lifting.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(({ icon: Icon, title, desc, color }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ y: -8, scale: 1.02 }}
                className="relative rounded-2xl p-6 overflow-hidden group cursor-default"
                style={{ background: '#0d0d15', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {/* Hover glow overlay */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at 50% 0%, ${color}12, transparent 65%)`,
                    border: `1px solid ${color}22`,
                  }}
                />
                <div className="relative z-10">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: `${color}15`, border: `1px solid ${color}30` }}
                  >
                    <Icon className="w-6 h-6" style={{ color }} />
                  </div>
                  <h3 className="text-white font-bold text-lg mb-2">{title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="relative py-24 px-6 border-t border-white/5 z-10">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-black text-white mb-3">
              How it <span className="text-[#00ff88] text-glow-green">works</span>
            </h2>
            <p className="text-gray-500">Three simple steps from market open to signal</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative">
            {/* Connecting line */}
            <div
              className="hidden md:block absolute top-8 left-[22%] right-[22%] h-px"
              style={{ background: 'linear-gradient(90deg, #00ff8840, #a855f740, #00d4ff40)' }}
            />
            {steps.map(({ num, title, desc, color }, i) => (
              <motion.div
                key={num}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="text-center relative"
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-black mx-auto mb-6 relative z-10"
                  style={{
                    background: `${color}12`,
                    border: `2px solid ${color}50`,
                    color,
                    boxShadow: `0 0 30px ${color}20`,
                  }}
                >
                  {num}
                </div>
                <h3 className="text-white font-bold text-lg mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative py-28 px-6 overflow-hidden z-10">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[700px] h-[400px] rounded-full bg-[#00ff88]/5 blur-[120px]" />
        </div>
        <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center relative z-10"
        >
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-5 leading-tight">
            Ready to trade<br />
            <span className="gradient-text">smarter?</span>
          </h2>
          <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto">
            Join traders using AI-powered signals to find opportunities in Indian and US markets every day.
          </p>
          <motion.button
            onClick={() => navigate('/dashboard')}
            whileHover={{ scale: 1.05, boxShadow: '0 0 60px rgba(0,255,136,0.55)' }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center gap-3 px-10 py-5 rounded-2xl bg-[#00ff88] text-black font-black text-lg transition-all"
          >
            <Activity className="w-6 h-6" />
            Launch Dashboard
            <ArrowRight className="w-6 h-6" />
          </motion.button>
          <p className="text-gray-600 text-sm mt-6">Not financial advice. Trade at your own risk.</p>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative border-t border-white/5 px-6 py-8 z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#00ff88]" />
            <span className="font-black text-white">Stock<span className="text-[#00ff88]">Sage</span></span>
          </div>
          <p className="text-gray-600 text-sm">© 2026 StockSage — AI-powered trading signals. Not financial advice.</p>
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <span>Built by</span>
            <a
              href="https://shrijithsm.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-[#00ff88] transition-colors font-medium"
            >
              Shrijith S Menon
            </a>
            <span className="text-gray-700">·</span>
            <a href="https://linkedin.com/in/shrijithsm" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-[#00d4ff] transition-colors">LinkedIn</a>
            <span className="text-gray-700">·</span>
            <a href="https://github.com/ShrijithSM" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-[#a855f7] transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
