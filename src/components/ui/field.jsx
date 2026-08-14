import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

function Field({ label, description, error, required, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label className="flex items-center gap-1">
          {label}
          {required && <span className="text-status-error">*</span>}
        </Label>
      )}
      {children}
      {description && !error && (
        <p className="text-label text-muted-foreground">{description}</p>
      )}
      {error && (
        <p className="text-label text-status-error flex items-center gap-1.5">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}

export { Field };
