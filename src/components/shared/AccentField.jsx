import { useEffect, useState } from 'react';
import { Pipette, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useT } from '@/context/I18nContext';
import { cn } from '@/lib/utils';

// Hand-picked so the common choices are one click away and every one of them
// survives the panel's contrast rules; the picker stays for anything else.
export const ACCENT_PRESETS = ['#fa8927', '#e5484d', '#d6409f', '#8e4ec6', '#3b82f6', '#12a594', '#46a758', '#f5c518'];

export function AccentField({ accent, busy, onChange }) {
  const t = useT();
  // The colour input fires on every pointer move inside the picker. The swatch
  // follows the pointer; only the colour the operator settles on is saved, or
  // one drag across the spectrum would be a hundred writes.
  const [draft, setDraft] = useState(accent);
  useEffect(() => { setDraft(accent); }, [accent]);
  useEffect(() => {
    if (!draft || draft === accent) return undefined;
    const timer = setTimeout(() => onChange(draft), 400);
    return () => clearTimeout(timer);
  }, [draft, accent, onChange]);
  const current = draft || accent || ACCENT_PRESETS[0];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{t('portability.accent')}</Label>
        {accent && (
          <Button variant="ghost" size="xs" disabled={busy} onClick={() => onChange(null)}>
            <X className="h-3.5 w-3.5" />{t('common.remove')}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {ACCENT_PRESETS.map((value) => (
          <button
            key={value}
            type="button"
            disabled={busy}
            aria-label={t('portability.accentSwatch', { value })}
            aria-pressed={accent?.toLowerCase() === value}
            onClick={() => onChange(value)}
            style={{ backgroundColor: value }}
            className={cn(
              'h-7 w-7 rounded-sm border-2 transition-[transform,border-color] hover:-translate-y-px',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'disabled:pointer-events-none disabled:opacity-50',
              accent?.toLowerCase() === value ? 'border-foreground' : 'border-border',
            )}
          />
        ))}
        {/* The picker must not read as a tenth preset: it wears the spectrum
            and a dropper, and the native input sits invisibly on top of it. */}
        <label
          title={t('portability.accentCustom')}
          className={cn(
            'relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm border-2 border-border',
            'hover:border-foreground/60 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
          )}
          style={{ backgroundImage: 'conic-gradient(#e5484d, #f5c518, #46a758, #12a594, #3b82f6, #8e4ec6, #d6409f, #e5484d)' }}
        >
          <span className="sr-only">{t('portability.accentCustom')}</span>
          <Pipette className="h-3.5 w-3.5 text-background drop-shadow" aria-hidden="true" />
          <input
            type="color"
            disabled={busy}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            value={current}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <span className={cn('ml-1 text-xs text-muted-foreground', accent && 'font-mono uppercase')}>
          {accent || t('portability.accentNone')}
        </span>
      </div>
    </div>
  );
}
