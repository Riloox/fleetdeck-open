import { useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/context/I18nContext';
import { parseProperties, serializeProperties, validateValue, isPropertiesFilename } from '@/lib/configFile';
import { SERVER_PROPERTIES_SCHEMA } from '@/modules/minecraft/configSchema';

function FieldRow({ schema, value, onChange, t }) {
  const label = t(`minecraft.configs.field.${schema.key}.label`);
  const desc = t(`minecraft.configs.field.${schema.key}.description`);
  const badge = schema.restartRequired
    ? <Badge variant="warn" className="shrink-0">{t('configs.badgeRestart')}</Badge>
    : <Badge variant="default" className="shrink-0">{t('configs.badgeHotReload')}</Badge>;

  let control;
  if (schema.type === 'bool') {
    control = (
      <div className="flex items-center gap-2">
        <Checkbox
          id={`cfg-${schema.key}`}
          checked={value === 'true'}
          onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
        />
        <label htmlFor={`cfg-${schema.key}`} className="text-xs text-foreground cursor-pointer select-none">
          {value === 'true' ? 'true' : 'false'}
        </label>
      </div>
    );
  } else if (schema.type === 'enum') {
    control = (
      <Select value={value || ''} onValueChange={onChange}>
        <SelectTrigger id={`cfg-${schema.key}`}>
          <SelectValue placeholder="-" />
        </SelectTrigger>
        <SelectContent>
          {(schema.options || []).map((opt) => (
            <SelectItem key={opt} value={opt}>{schema.labels?.[opt] || opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (schema.type === 'number') {
    control = (
      <Input
        id={`cfg-${schema.key}`}
        type="number"
        inputMode="numeric"
        min={schema.min}
        max={schema.max}
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  } else if (schema.maxLength && schema.maxLength > 80) {
    control = (
      <Textarea
        id={`cfg-${schema.key}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    );
  } else {
    control = (
      <Input
        id={`cfg-${schema.key}`}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <label htmlFor={`cfg-${schema.key}`} className="text-xs font-semibold text-foreground">
          {label}
        </label>
        {badge}
      </div>
      {control}
      <p className="text-label text-muted-foreground leading-snug">{desc}</p>
    </div>
  );
}

export function ConfigForm({ file, original, current, onChange, onValidation }) {
  const t = useT();
  const isProps = isPropertiesFilename(file);

  const parsed = useMemo(() => parseProperties(current || original), [current, original]);
  const modeled = new Map(SERVER_PROPERTIES_SCHEMA.map((s) => [s.key, s]));

  const issues = useMemo(() => {
    const out = [];
    for (const s of SERVER_PROPERTIES_SCHEMA) {
      const v = parsed.values[s.key];
      if (v == null) continue;
      const r = validateValue(s, v);
      if (!r.ok) out.push({ severity: 'error', message: `${s.key}: ${r.error}` });
    }
    return out;
  }, [parsed]);
  useEffect(() => { onValidation?.(issues); }, [issues, onValidation]);

  if (!isProps) {
    return (
      <div className="rounded-md border border-border bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
        {t('configs.friendlyEmpty')}
      </div>
    );
  }

  const valueFor = (key) => {
    if (parsed.values[key] != null) return parsed.values[key];
    if (modeled.get(key)?.type === 'bool') return 'false';
    return '';
  };

  const setKey = (key, next) => {
    const values = { ...parsed.values, [key]: next };
    const order = parsed.order.includes(key) ? parsed.order : [...parsed.order, key];
    const comments = key in parsed.comments ? parsed.comments : { ...parsed.comments, [key]: [] };
    onChange(serializeProperties({ order, values, comments }));
  };

  const groups = ['gameplay', 'performance', 'world'];
  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const items = SERVER_PROPERTIES_SCHEMA.filter((s) => s.group === g);
        if (!items.length) return null;
        const labelKey = `configs.group${g[0].toUpperCase()}${g.slice(1)}`;
        return (
          <section key={g}>
            <h4 className="text-label font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {t(labelKey)}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.map((s) => (
                <FieldRow
                  key={s.key}
                  schema={s}
                  value={valueFor(s.key)}
                  onChange={(v) => setKey(s.key, v)}
                  t={t}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
