import { cn } from '@/lib/utils';

function Chip({ active = false, className, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-label font-semibold uppercase tracking-wide border transition-colors',
        active
          ? 'bg-primary/15 text-primary border-primary/25'
          : 'bg-transparent text-muted-foreground border-border hover:bg-secondary',
        className
      )}
      {...props}
    />
  );
}

export { Chip };
