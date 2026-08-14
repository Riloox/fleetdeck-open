import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

// uPlot paints to canvas and takes colour strings, not classes, so the palette
// has to be read out of the document. getComputedStyle is not free and the
// palette is static for the life of the document, so the result is cached - but
// resolved lazily on first real read rather than snapshotted in a mount-time
// useMemo. A chart that mounted before the stylesheet applied used to cache
// 'transparent' for every series and hold it for the rest of the session; the
// guard re-reads if that is what it got.
let themeCache = null;

function readToken(name) {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Tokens hold bare oklch components ("0.7 0.15 40") rather than full colour
// functions, so keeping the raw value lets us build an alpha variant for the
// gradient fill without parsing a colour back apart.
function readColor(name) {
  const raw = readToken(name);
  return raw ? { raw, css: `oklch(${raw})` } : { raw: '', css: 'transparent' };
}

export function useChartTheme() {
  if (!themeCache || themeCache.colors[0].css === 'transparent') {
    themeCache = {
      colors: [
        readColor('--chart-1'),
        readColor('--chart-2'),
        readColor('--chart-3'),
        readColor('--chart-4'),
        readColor('--chart-5'),
      ],
      foreground: readColor('--foreground').css,
      mutedForeground: readColor('--muted-foreground').css,
      border: readColor('--border').css,
      fontBody: readToken('--font-body'),
    };
  }
  return themeCache;
}

function alpha(color, a) {
  return color.raw ? `oklch(${color.raw} / ${a})` : 'transparent';
}

/**
 * Area chart over one or more series.
 *
 * Two modes, matching the only two things the panel actually plots:
 *   sparkline - bare trend line inside a tile: no axes, grid, or cursor.
 *   full      - a real time series: labelled axes and a value readout.
 *
 * `data` keeps the {x, y} point shape the call sites already build. x is an
 * arbitrary number - a millisecond timestamp for time series, an index for
 * sparklines - and is never handed to uPlot's own time handling, which expects
 * seconds. Formatting stays with the caller through xFormat/yFormat, so no
 * assumption about units or timezone is baked in here.
 */
export function AreaChart({
  data,
  height = 180,
  sparkline = false,
  yMin = 0,
  yMax,
  xFormat,
  yFormat,
  className,
}) {
  const theme = useChartTheme();
  const hostRef = useRef(null);
  const plotRef = useRef(null);

  const series = useMemo(() => (Array.isArray(data) ? data : data ? [{ data }] : []), [data]);

  // uPlot wants columnar data: one shared x array, then one y array per series.
  // The x axis comes from the first series - every caller plots series that
  // share a timebase, and interpolating mismatched ones would invent readings.
  const aligned = useMemo(() => {
    if (!series.length || !series[0]?.data?.length) return null;
    const xs = series[0].data.map(p => p.x);
    return [xs, ...series.map(s => s.data.map(p => (p.y == null ? null : p.y)))];
  }, [series]);

  const options = useMemo(() => {
    // Callers format for humans and some return numbers (player counts, for
    // one); uPlot renders axis labels as-is and drops anything that is not a
    // string, so coerce at the boundary rather than at every call site.
    const fmtX = v => String(xFormat ? xFormat(v) : v);
    const fmtY = v => String(yFormat ? yFormat(v) : v);

    return {
      width: 100,
      height,
      // Our x values are milliseconds, not the unix seconds uPlot assumes.
      scales: {
        x: { time: false },
        y: { range: (u, min, max) => [yMin ?? min, yMax ?? (max === min ? max + 1 : max)] },
      },
      legend: { show: false },
      cursor: {
        show: !sparkline,
        x: !sparkline,
        y: false,
        points: { size: 6 },
        drag: { x: false, y: false },
      },
      axes: sparkline
        ? [{ show: false }, { show: false }]
        : [
            {
              stroke: theme.mutedForeground,
              grid: { show: false },
              ticks: { show: false },
              font: `500 12px ${theme.fontBody || 'inherit'}`,
              values: (u, splits) => splits.map(fmtX),
            },
            {
              stroke: theme.mutedForeground,
              grid: { stroke: theme.border, width: 1, dash: [4, 4] },
              ticks: { show: false },
              font: `500 12px ${theme.fontBody || 'inherit'}`,
              size: 52,
              values: (u, splits) => splits.map(fmtY),
            },
          ],
      padding: sparkline ? [2, 0, 0, 0] : [8, 8, 0, 0],
      series: [
        { label: 'x', value: (u, v) => (v == null ? '' : fmtX(v)) },
        ...series.map((s, i) => {
          const color = theme.colors[i % theme.colors.length];
          return {
            label: s.name || `series-${i + 1}`,
            stroke: color.css,
            width: sparkline ? 1.2 : 2,
            value: (u, v) => (v == null ? '' : fmtY(v)),
            points: { show: false },
            fill: (u) => {
              const g = u.ctx.createLinearGradient(0, u.bbox.top, 0, u.bbox.top + u.bbox.height);
              g.addColorStop(0, alpha(color, sparkline ? 0.3 : 0.35));
              g.addColorStop(1, alpha(color, sparkline ? 0.02 : 0.05));
              return g;
            },
          };
        }),
      ],
    };
  }, [theme, series, height, sparkline, yMin, yMax, xFormat, yFormat]);

  // Rebuilding on every option change is deliberate: uPlot has no full
  // reconfigure, and these charts are small enough that a teardown costs less
  // than tracking which of its setters covers which prop.
  useLayoutEffect(() => {
    if (!hostRef.current || !aligned) return undefined;
    const plot = new uPlot(options, aligned, hostRef.current);
    plotRef.current = plot;
    return () => {
      plot.destroy();
      plotRef.current = null;
    };
  }, [options, aligned]);

  // uPlot needs an explicit pixel width, so the container's real width has to be
  // measured and fed back in on every resize - including the first paint, where
  // the 100px placeholder above would otherwise stick.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const apply = () => {
      const plot = plotRef.current;
      const width = host.clientWidth;
      if (plot && width > 0) plot.setSize({ width, height });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(host);
    return () => ro.disconnect();
  }, [height, aligned, options]);

  if (!aligned) return <div style={{ height }} aria-hidden="true" />;

  return <div ref={hostRef} className={className} style={{ height, width: '100%' }} />;
}
