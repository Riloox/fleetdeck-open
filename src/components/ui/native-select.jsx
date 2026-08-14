import { cn } from '@/lib/utils';

function NativeSelect({ options, value, onChange, placeholder, className, ...props }) {
  return (
    <select
      value={value ?? ''}
      onChange={onChange}
      className={cn(
        'flex h-11 w-full items-center rounded-sm border border-input outline outline-2 outline-transparent',
        'bg-background px-3 py-2 text-sm text-foreground',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export { NativeSelect };
