import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-label font-semibold uppercase tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-secondary text-secondary-foreground border border-border',
        online: 'bg-status-online/15 text-status-online border border-status-online/20',
        offline: 'bg-muted text-muted-foreground border border-border',
        starting: 'bg-status-warn/15 text-status-warn border border-status-warn/20',
        stopping: 'bg-status-warn/15 text-status-warn border border-status-warn/20',
        active: 'bg-primary/15 text-primary border border-primary/25',
        destructive: 'bg-status-error/15 text-status-error border border-status-error/20',
        /* Soft chip variants (MatDash-style) */
        softPrimary: 'bg-primary/15 text-primary',
        softSuccess: 'bg-status-online/15 text-status-online',
        softWarn: 'bg-status-warn/15 text-status-warn',
        softError: 'bg-status-error/15 text-status-error',
        softInfo: 'bg-accent text-accent-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
