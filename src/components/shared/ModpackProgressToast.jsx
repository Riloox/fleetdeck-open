import { toast } from 'sonner';
import { Package } from 'lucide-react';

const SETTLE_MS = 620;

function ProgressToast({ t, settled }) {
  return (
    <div className="w-[356px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card/95 p-4 shadow-xl backdrop-blur-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Package className="h-4 w-4 shrink-0 text-primary" />
        {t('minecraft.modrinth.modpackProgress')}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={t('minecraft.modrinth.modpackProgress')}>
        <div className={`${settled ? 'modpack-progress-settle' : 'modpack-progress-indeterminate'} h-full rounded-full bg-primary`} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t('minecraft.modrinth.modpackProgressBackground')}</p>
    </div>
  );
}

// Persistent, non-dismissible toast shown while a modpack install runs in the background.
// Returns the toast id; settle it with settleModpackProgressToast when the install lands.
export function showModpackProgressToast(t) {
  const id = toast.custom(() => <ProgressToast t={t} />, {
    duration: Infinity,
    dismissible: false,
    closeButton: false,
  });
  return id;
}

// Close out a run that succeeded. An install can take minutes, and a progress
// bar that simply vanishes leaves the user unsure whether it finished or
// crashed - so the indeterminate sweep resolves to a full bar and holds for a
// beat before the toast clears and the success message takes over.
export function settleModpackProgressToast(id, t) {
  if (id === undefined || id === null) return;
  toast.custom(() => <ProgressToast t={t} settled />, {
    id,
    duration: Infinity,
    dismissible: false,
    closeButton: false,
  });
  setTimeout(() => toast.dismiss(id), SETTLE_MS);
}
