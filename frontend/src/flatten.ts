// Плоское представление события в dot-notation, общее для результата и фикстур
export function flatten(obj: any, prefix = ''): [string, string][] {
  const entries: [string, string][] = [];
  if (!obj || typeof obj !== 'object') return entries;
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'mapping') continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) {
      entries.push([key, '-']);
    } else if (Array.isArray(v)) {
      if (v.length === 0) entries.push([key, '-']);
      else entries.push([key, v.flat(Infinity).map(String).join(', ')]);
    } else if (typeof v === 'object') {
      entries.push(...flatten(v, key));
    } else {
      entries.push([key, String(v)]);
    }
  }
  return entries;
}

// Поля, которые меняются от запуска к запуску и в фикстурах бесполезны
const VOLATILE_FIELDS = ['@timestamp', 'trace_id', 'json_data_output', 'source_address', 'tags'];
const VOLATILE_PREFIXES = ['host.', 'metadata.', 'siem.event.created'];

export function fixtureExpectation(event: any): Record<string, string> {
  const expected: Record<string, string> = {};
  for (const [key, value] of flatten(event)) {
    if (VOLATILE_FIELDS.includes(key)) continue;
    if (VOLATILE_PREFIXES.some(p => key.startsWith(p))) continue;
    expected[key] = value;
  }
  return expected;
}
