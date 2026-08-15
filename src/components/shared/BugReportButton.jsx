import { useEffect, useState } from 'react';
import { Bug, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useT } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { BugReportDialog } from '@/components/shared/BugReportDialog';

/*
 * The floating bug reporter launcher: a fixed control in the bottom-right of
 * every authenticated in-game screen. The adjacent chevron keeps the
 * preference discoverable while letting the launcher slide out of the way.
 *
 * The dialog's context (game, view, route) is captured when the launcher is
 * clicked - not from props at render time - so the report always describes
 * the screen the user was actually looking at when they decided to file it.
 */
export function BugReportButton({ game, view }) {
  const { user } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState(null);
  const [hidden, setHidden] = useState(() => {
    if (!user?.id) return false;
    try { return localStorage.getItem(`fleetdeck_bug_report_hidden:${user.id}`) === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (!user?.id) return;
    try { setHidden(localStorage.getItem(`fleetdeck_bug_report_hidden:${user.id}`) === '1'); } catch { setHidden(false); }
  }, [user?.id]);

  // The reporter is for signed-in users; the hub and login screen never mount
  // this component. Without a user there is no identity to attach to a report.
  if (!user?.id) return null;

  function toggleHidden() {
    const next = !hidden;
    try {
      const key = `fleetdeck_bug_report_hidden:${user.id}`;
      if (next) localStorage.setItem(key, '1');
      else localStorage.removeItem(key);
    } catch { /* keep the control usable when storage is unavailable */ }
    setHidden(next);
  }

  function openReporter() {
    setContext({ game, view, route: window.location.pathname });
    setOpen(true);
  }

  return (
    <>
      {/* Keep compact viewports above the ControlBar; on regular screens the
          launcher sits a little lower as requested. */}
      <div className="fixed bottom-20 right-4 z-50 flex items-center gap-1 md:bottom-16" data-bug-report-dock>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-full !transition-transform !duration-500 !ease-in-out"
              aria-label={t('bugReport.launcher')}
              title={t('bugReport.launcher')}
              tabIndex={hidden ? -1 : 0}
              data-bug-report-hidden={hidden ? 'true' : 'false'}
              style={{ transform: hidden ? 'translateX(100vw)' : 'translateX(0)' }}
              onClick={openReporter}
            >
              <Bug className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('bugReport.launcher')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="glass"
              size="icon"
              className="group h-11 w-11 shrink-0 rounded-none border-0 bg-transparent text-primary shadow-none hover:border-transparent hover:bg-transparent"
              aria-label={hidden ? t('bugReport.show') : t('bugReport.hide')}
              title={hidden ? t('bugReport.show') : t('bugReport.hide')}
              aria-expanded={!hidden}
              onClick={toggleHidden}
            >
              {hidden
                ? <ChevronsLeft className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" />
                : <ChevronsRight className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{hidden ? t('bugReport.show') : t('bugReport.hide')}</TooltipContent>
        </Tooltip>
      </div>

      <BugReportDialog open={open} onOpenChange={setOpen} context={context} />
    </>
  );
}
