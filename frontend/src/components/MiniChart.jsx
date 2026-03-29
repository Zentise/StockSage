import { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

export default function MiniChart({ data, width = 160, height = 50, color = '#00ff88' }) {
  const chartRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !data || data.length === 0) return;

    const chart = createChart(containerRef.current, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'transparent',
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: { mode: 0 },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addAreaSeries({
      lineColor: color,
      topColor: `${color}33`,
      bottomColor: 'transparent',
      lineWidth: 2,
      crosshairMarkerVisible: false,
    });

    // Deduplicate by time (keep last occurrence) then sort ascending —
    // lightweight-charts requires strictly ascending unique timestamps.
    const seen = new Map();
    data.forEach((d) => seen.set(d.time, d.close));
    const chartData = Array.from(seen.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([time, value]) => ({ time, value }));

    series.setData(chartData);
    chart.timeScale().fitContent();
    chartRef.current = chart;

    return () => {
      chart.remove();
    };
  }, [data, width, height, color]);

  return <div ref={containerRef} className="inline-block" />;
}
