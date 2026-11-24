import {
  CandlestickSeries, ColorType, createChart, HistogramSeries, LineSeries, LineStyle, type AutoscaleInfo, type IChartApi, type ISeriesApi, type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { useCandles, type Timeframe } from '../api/client';
import { marketOf } from '../lib/format';
import { Problem, Segmented } from './bits';

const ZONE = { india: 'Asia/Kolkata', us: 'America/New_York' } as const;

/** The chart library only speaks UTC, so shift each bar to read as exchange time. */
function exchangeClock(utc: number, zone: string): number {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(utc * 1000);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) / 1000;
}

function ema(v: number[], n: number): (number | null)[] {
  const k = 2 / (n + 1);
  let e = v[0] ?? 0;
  return v.map((x, i) => {
    e = i ? x * k + e * (1 - k) : x;
    return i < n - 1 ? null : e;
  });
}

interface Props {
  ticker: string;
  levels: { entry: number; stop: number; target: number } | null;
}

export default function Chart({ ticker, levels }: Props) {
  const [tf, setTf] = useState<Timeframe>('6M');
  const { data, error, refetch } = useCandles(ticker, tf);
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const bars = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!el.current || !data) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#8f96c4', fontFamily: "'Spline Sans Mono Variable', monospace", fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: '#1a2048' }, horzLines: { color: '#1a2048' } },
      crosshair: { mode: 0, vertLine: { color: '#8f9bff', labelBackgroundColor: '#3b4480' }, horzLine: { color: '#8f9bff', labelBackgroundColor: '#3b4480' } },
      rightPriceScale: { borderColor: '#272e5e', scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: { borderColor: '#272e5e', timeVisible: data.intraday, secondsVisible: false },
      handleScroll: { vertTouchDrag: false },
    });
    const zone = ZONE[marketOf(ticker)];
    const rows = data.candles.map((b) => ({ ...b, time: exchangeClock(b.time, zone) as UTCTimestamp }));
    const candles = c.addSeries(CandlestickSeries, {
      upColor: '#0ea5a5', downColor: '#ea5455', borderVisible: false, wickUpColor: '#0ea5a5', wickDownColor: '#ea5455',
    });
    candles.setData(rows);
    const vol = c.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(rows.map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? 'rgba(14,165,165,0.38)' : 'rgba(234,84,85,0.38)' })));
    const closes = rows.map((b) => b.close);
    for (const [n, color] of [[21, '#f2b63c'], [50, '#8f9bff']] as const) {
      const line = c.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      line.setData(ema(closes, n).flatMap((v, i) => (v === null ? [] : [{ time: rows[i]!.time, value: v }])));
    }
    c.timeScale().fitContent();
    chart.current = c;
    bars.current = candles;
    return () => {
      c.remove();
      chart.current = null;
      bars.current = null;
    };
  }, [data, ticker]);

  useEffect(() => {
    const s = bars.current;
    if (!s || !levels) return;
    // Stretch the price scale so the stop and target are always in view.
    s.applyOptions({
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const r = original();
        if (!r?.priceRange) return r;
        const { minValue, maxValue } = r.priceRange;
        return { ...r, priceRange: { minValue: Math.min(minValue, levels.stop, levels.target), maxValue: Math.max(maxValue, levels.stop, levels.target) } };
      },
    });
    const lines = ([[levels.target, '#12b8b0', 'Target'], [levels.entry, '#f2b63c', 'Entry'], [levels.stop, '#ea5455', 'Stop']] as const).map(([price, color, title]) =>
      s.createPriceLine({ price, color, title, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true }));
    return () => {
      // After a data change the chart has been rebuilt and these lines went with it.
      if (bars.current === s) for (const l of lines) s.removePriceLine(l);
    };
  }, [levels, data]);

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <Segmented label="Chart range" value={tf} onChange={setTf} options={[['1D', '1D'], ['1W', '1W'], ['1M', '1M'], ['6M', '6M'], ['2Y', '2Y']]} />
        <div className="flex gap-4 text-[13px] text-ink2">
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 bg-gold" />21-bar average</span>
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 bg-peri" />50-bar average</span>
        </div>
      </div>
      {error && !data ? <Problem error={error} retry={() => refetch()} className="m-4" /> : !data ? <div className="skeleton mx-4 mb-4 h-[400px]" /> : <div ref={el} className="h-[360px] w-full sm:h-[430px]" />}
    </div>
  );
}
