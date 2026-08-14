import { cn } from '@/lib/utils';

const TONE_CLASSES = {
  default: 'bg-secondary text-secondary-foreground border-border',
  error:   'bg-status-error/15 text-status-error border-status-error/20',
  warn:    'bg-status-warn/15 text-status-warn border-status-warn/20',
  info:    'bg-primary/15 text-primary border-primary/20',
};

function Alert({ variant = 'default', className, ...props }) {
  return (
    <div
      role="alert"
      className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-xs', TONE_CLASSES[variant], className)}
      {...props}
    />
  );
}

export { Alert };
