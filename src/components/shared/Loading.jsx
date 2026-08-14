import { Loader2 } from 'lucide-react';
import { useT } from '@/context/I18nContext';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

// The single "we are fetching this" motion. It deliberately does not imitate the
// shape of the content underneath: a ghost of rows that never arrive reads as a
// broken panel, whereas a turning ring reads as waiting. The label is announced
// but not drawn, so the spinner stays quiet in dense panels and dialogs.
function Loading({ className, size = 'md', label }) {
  const t = useT();
  return (
    <div data-slot="loading" role="status" aria-live="polite" className={cn('flex items-center justify-center py-10', className)}>
      <Loader2 aria-hidden="true" className={cn('animate-spin text-muted-foreground', SIZES[size] || SIZES.md)} />
      <span className="sr-only">{label || t('common.loading')}</span>
    </div>
  );
}

export { Loading };
