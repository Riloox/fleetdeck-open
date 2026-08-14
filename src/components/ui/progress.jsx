import { cn } from '@/lib/utils';

// Opt-in traffic light, for gauges where a HIGH reading is the bad news: disk,
// memory, CPU. It used to be the default for every bar, which meant an install
// that was 95% done rendered in the error colour - the same red the panel uses
// to say something broke. Progress is not utilization.
const UTILIZATION_COLORS = {
  low: 'bg-status-online',
  medium: 'bg-status-warn',
  high: 'bg-status-error',
};

function getUtilizationColor(value) {
  if (value >= 90) return UTILIZATION_COLORS.high;
  if (value >= 75) return UTILIZATION_COLORS.medium;
  return UTILIZATION_COLORS.low;
}

export function Progress({ value = 0, max = 100, color, tone, showLabel = false, className, trackClassName, ...props }) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  const fillColor = color || (tone === 'utilization' ? getUtilizationColor(pct) : 'bg-primary');

  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-sm bg-muted', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      {...props}
    >
      <div
        className={cn('h-full origin-left rounded-sm transition-transform duration-300', fillColor)}
        style={{ transform: `scaleX(${pct / 100})` }}
      />
      {showLabel && (
        <span className="sr-only">{Math.round(pct)}%</span>
      )}
    </div>
  );
}
