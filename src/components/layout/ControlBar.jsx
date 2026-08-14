import { useState } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ServerSelector } from './ServerSelector';
import { StatusPill } from '@/components/shared/StatusPill';
import { PalworldAnnouncementDialog } from '@/components/shared/PalworldAnnouncementDialog';
import { useAuth } from '@/context/AuthContext';
import { useServer } from '@/context/ServerContext';
import { useT } from '@/context/I18nContext';
import { Megaphone, Play, RotateCcw, Square } from 'lucide-react';

export function ControlBar({ onServerSwitch, onStart, onStop, onRestart }) {
  const { activeServerId, activeServer, statuses, supports } = useServer();
  const { hasCapability } = useAuth();
  const t = useT();
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const hasServer = !!activeServerId;
  const status = hasServer ? (statuses[activeServerId] || { status: 'offline' }) : null;
  const showStart = !!status && (status.status === 'offline' || status.status === 'stopping');
  const showRestartStop = !!status && (status.status === 'online' || status.status === 'starting');

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-3">
      <div
        data-tour="controlbar"
        className="surface-heat pointer-events-auto flex max-w-full items-center gap-1.5 rounded border-2 border-border bg-card p-1.5 pl-2 shadow-lg"
        role="toolbar"
        aria-label={t('header.start')}
      >
        <ServerSelector onSwitch={onServerSwitch} placement="top" />

        <span className="mx-1 h-7 w-px bg-border/60" aria-hidden="true" />

        <StatusPill status={status?.status ?? null} className="px-3 py-1" />

        <span className="mx-1 h-7 w-px bg-border/60" aria-hidden="true" />

        {/* The dock re-arms itself as the lifecycle moves: start gives way to
            restart+stop and back. These controls swap underneath the pointer,
            so they announce the swap rather than silently taking the click
            target the user was aiming at. */}
        {showStart && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="success"
                size="icon"
                onClick={onStart}
                className="dock-arm rounded-sm"
                aria-label={t('header.start')}
              >
                <Play className="h-4 w-4 fill-current" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('header.start')}</TooltipContent>
          </Tooltip>
        )}

        {showRestartStop && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="glass"
                  size="icon"
                  onClick={onRestart}
                  className="dock-arm rounded-sm"
                  aria-label={t('header.restart')}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('header.restart')}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={onStop}
                  className="dock-arm rounded-sm"
                  aria-label={t('header.stop')}
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('header.stop')}</TooltipContent>
            </Tooltip>
          </>
        )}
        {activeServer?.type === 'palworld' && supports('announcements') && hasCapability('announcements.send', activeServerId) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="glass"
                size="icon"
                onClick={() => setAnnouncementOpen(true)}
                disabled={status?.status !== 'online' || status?.restHealth?.state !== 'healthy'}
                aria-label={t('palworld.announcement')}
              >
                <Megaphone className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('palworld.announcement')}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <PalworldAnnouncementDialog
        open={announcementOpen}
        onOpenChange={setAnnouncementOpen}
        disabled={status?.status !== 'online' || status?.restHealth?.state !== 'healthy'}
      />
    </div>
  );
}
