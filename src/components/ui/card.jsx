import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef(({ className, variant = 'default', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded border-2 text-card-foreground',
      variant === 'default' && 'surface-panel border-border',
      variant === 'subtle' && 'surface-panel border-border/80 opacity-90',
      variant === 'compact' && 'surface-panel border-border',
      variant === 'emphasis' && 'surface-panel border-primary/60',
      className
    )}
    {...props}
  />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('rule-heated flex min-h-12 items-center justify-between gap-3 border-b-2 border-border px-5 py-3', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    // The most tracked-out type in the app: small uppercase Saira Condensed at
    // 800 is the tightest counter set here, and it jams without the air.
    className={cn('font-display text-title font-extrabold uppercase tracking-[0.03em] text-foreground', className)}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-5', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center p-5 pt-0', className)} {...props} />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
