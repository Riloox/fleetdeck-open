import { cn } from '@/lib/utils';
import { useServer } from '@/context/ServerContext';
import { gameById } from '@/lib/games';

function Page({ className, children }) {
  return (
    <div className={cn('mx-auto w-full max-w-[1680px] space-y-6', className)}>
      {children}
    </div>
  );
}

// Derive the "where am I" line for the current game + active server, e.g.
// "MINECRAFT · survival". Views can override via the `eyebrow` prop, or pass
// `eyebrow={null}` to suppress it.
function useDefaultEyebrow() {
  const { currentGame, activeServer } = useServer();
  if (!currentGame) return activeServer?.name || null;
  const label = gameById(currentGame).label;
  return [label, activeServer?.name].filter(Boolean).join(' · ');
}

/**
 * ViewHeader — the shared page-identity band every station renders at the top.
 * Eyebrow (game · server, in Signal Amber), an uppercase display title, an
 * optional description, and a right-aligned actions slot for page-level
 * controls. Controls intrinsic to a working surface stay inside that surface.
 */
function ViewHeader({ eyebrow, title, description, actions, className }) {
  const fallbackEyebrow = useDefaultEyebrow();
  const resolvedEyebrow = eyebrow === undefined ? fallbackEyebrow : eyebrow;
  return (
    <section
      className={cn(
        'flex flex-col gap-4 border-b-2 border-border pb-5',
        'sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {resolvedEyebrow && (
          <p className="truncate text-label font-bold uppercase tracking-[0.16em] text-primary">
            {resolvedEyebrow}
          </p>
        )}
        {title && (
          <h2 className="overflow-wrap-anywhere font-display text-2xl font-extrabold uppercase leading-[0.95] tracking-[0.01em] text-foreground">
            {title}
          </h2>
        )}
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {actions}
        </div>
      )}
    </section>
  );
}

// Backwards-compatible alias: existing callers used PageIntro before the spine
// was formalized. New code should use ViewHeader.
const PageIntro = ViewHeader;

function PageToolbar({ className, children }) {
  return (
    <div className={cn('surface-heat flex min-h-11 flex-wrap items-center justify-between gap-3 rounded border-2 border-border bg-card px-3 py-2', className)}>
      {children}
    </div>
  );
}

function SummaryGrid({ className, children }) {
  return <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>{children}</div>;
}

function SummaryItem({ icon: Icon, label, value, tone = 'primary', className }) {
  const tones = {
    primary: 'bg-primary/15 text-primary',
    online: 'bg-status-online/15 text-status-online',
    warn: 'bg-status-warn/15 text-status-warn',
    error: 'bg-status-error/15 text-status-error',
    neutral: 'bg-muted text-muted-foreground',
  };
  return (
    <div className={cn('surface-heat flex min-w-0 items-center gap-3 rounded border-2 border-border bg-card px-4 py-3', className)}>
      {Icon && <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-sm', tones[tone] || tones.primary)}><Icon className="h-4 w-4" /></span>}
      <div className="min-w-0">
        <p className="truncate text-label font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

export { Page, ViewHeader, PageIntro, PageToolbar, SummaryGrid, SummaryItem };
