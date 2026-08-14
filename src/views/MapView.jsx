import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ViewHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/EmptyState';
import { MapConfigDialog } from '@/components/shared/MapConfigDialog';
import { useServer } from '@/context/ServerContext';
import { useT } from '@/context/I18nContext';
import { ExternalLink, Map as MapIcon, Settings } from 'lucide-react';
import { PalworldMapView } from '@/views/PalworldMapView';

export function MapView() {
  const { mapUrl, activeServer } = useServer();
  const t = useT();
  const [configOpen, setConfigOpen] = useState(false);

  if (activeServer?.type === 'palworld') return <PalworldMapView />;

  const configured = Boolean(mapUrl);

  return (
    <>
      <div className="space-y-6">
        <ViewHeader
          title={t('minecraft.mapView.title')}
          actions={
            <>
              <Button variant="glass" size="sm" onClick={() => setConfigOpen(true)}>
                <Settings className="h-3.5 w-3.5" />
                {t('minecraft.mapView.settings')}
              </Button>
              <Button
                variant="glass"
                size="sm"
                disabled={!configured}
                onClick={() => configured && window.open(mapUrl, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t('minecraft.mapView.openInNewTab')}
              </Button>
            </>
          }
        />
        <Card className="overflow-hidden">
        <CardContent className="p-0">
          {configured ? (
            <iframe
              key={mapUrl}
              src={mapUrl}
              referrerPolicy="no-referrer"
              title={t('minecraft.mapView.title')}
              className="block w-full border-0 bg-background"
              style={{ height: '74vh' }}
            />
          ) : (
            <div style={{ height: '74vh' }} className="flex flex-col items-center justify-center gap-4 bg-background/40">
              <EmptyState
                icon={MapIcon}
                title={t('minecraft.mapView.notConfiguredTitle')}
                message={t('minecraft.mapView.notConfiguredBody')}
                className="max-w-sm"
              />
              <Button variant="default" size="sm" onClick={() => setConfigOpen(true)}>
                <Settings className="h-3.5 w-3.5" />
                {t('minecraft.mapView.configure')}
              </Button>
            </div>
          )}
        </CardContent>
        </Card>
      </div>
      <MapConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        server={activeServer}
      />
    </>
  );
}
