import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm border-2 text-sm font-bold transition-[transform,opacity,background-color,color,border-color,box-shadow] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // The one control in a view that gets heat. The bloom is paired with a
        // real shadow underneath, so the button is lit *and* seated - a bare
        // halo would just look like a glow filter.
        default:
          'border-primary bg-primary text-primary-foreground shadow-[var(--shadow-sm),var(--bloom-sm)] hover:bg-primary-strong hover:border-primary-strong hover:shadow-[var(--shadow-md),var(--bloom-md)]',
        destructive:
          'border-destructive/60 bg-destructive/15 text-status-error hover:bg-destructive/25',
        outline:
          'border-border bg-transparent hover:border-foreground/60 hover:bg-secondary hover:text-foreground',
        secondary:
          'border-secondary bg-secondary text-secondary-foreground hover:border-border hover:bg-secondary/80',
        ghost:
          'border-transparent hover:border-border hover:bg-secondary hover:text-foreground',
        link:
          'border-transparent text-primary underline-offset-4 hover:underline',
        success:
          'border-status-online/40 bg-status-online/15 text-status-online hover:bg-status-online/25',
        glass:
          'border-border bg-card hover:border-foreground/50 hover:bg-secondary',
      },
      size: {
        default: 'h-11 px-4 py-2',
        sm: 'h-9 px-3 text-xs',
        xs: 'h-8 px-2 text-xs',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
        'icon-sm': 'h-9 w-9',
        'icon-xs': 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'sm',
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = 'Button';

export { Button, buttonVariants };
