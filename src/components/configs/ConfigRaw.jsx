import { useEffect, useMemo } from 'react';
import { isYamlFilename } from '@/lib/configFile';
import { useT } from '@/context/I18nContext';

function yamlSanityCheck(text) {
  const issues = [];
  if (!text) return issues;
  if (text.includes('\u0000')) {
    issues.push({ severity: 'error', message: 'File contains null bytes (looks binary).' });
  }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/^\s*\t/.test(line)) {
      issues.push({ severity: 'error', message: `Line ${i + 1}: YAML does not allow tab indentation.` });
    }
  });
  const stack = [];
  const pairs = { '"': '"', "'": "'", '{': '}', '[': ']', '(': ')' };
  const closers = { '"': '"', "'": "'", '}': '{', ']': '[', ')': '(' };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (pairs[c] != null) {
      stack.push({ ch: c, i, opener: c });
    } else if (closers[c] != null) {
      const top = stack.pop();
      if (!top || top.ch !== closers[c]) {
        issues.push({ severity: 'error', message: `Unmatched '${c}' near offset ${i}.` });
        return issues;
      }
    }
  }
  if (stack.length) {
    issues.push({ severity: 'error', message: `Unclosed '${stack[stack.length - 1].ch}'.` });
  }
  return issues;
}

export function ConfigRaw({ value, onChange, filename, onValidation }) {
  const t = useT();
  const isYaml = isYamlFilename(filename);
  const issues = useMemo(() => isYaml ? yamlSanityCheck(value) : [], [isYaml, value]);
  useEffect(() => { onValidation?.(issues); }, [issues, onValidation]);

  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      className="w-full h-[52vh] rounded-md border border-input bg-muted/30 px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 resize-y"
    />
  );
}
