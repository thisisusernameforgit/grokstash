import React, { useState, useRef } from 'react';

interface Props { patterns: string[] }

interface Segment { text: string; pattern?: string; field?: string }

const BUILTIN_PATTERNS = [
  // Base
  'USERNAME', 'USER', 'EMAILLOCALPART', 'EMAILADDRESS',
  'INT', 'BASE10NUM', 'NUMBER', 'BASE16NUM', 'BASE16FLOAT', 'POSINT', 'NONNEGINT',
  'WORD', 'NOTSPACE', 'SPACE', 'DATA', 'GREEDYDATA', 'QUOTEDSTRING', 'QS',
  'UUID', 'URN', 'BOOLEAN',
  // Network
  'MAC', 'CISCOMAC', 'WINDOWSMAC', 'COMMONMAC',
  'IPV4', 'IPV6', 'IP', 'IPORHOST', 'HOSTNAME', 'HOST', 'PORT',
  'URIPROTO', 'URIHOST', 'URIPATH', 'URIQUERY', 'URIPARAM', 'URIPATHPARAM', 'URI',
  // Paths
  'UNIXPATH', 'WINPATH', 'TTY', 'PATH',
  // Date/Time
  'MONTH', 'MONTHNUM', 'MONTHNUM2', 'MONTHDAY', 'DAY',
  'YEAR', 'HOUR', 'MINUTE', 'SECOND', 'TIME',
  'DATE_US', 'DATE_EU', 'DATE', 'DATESTAMP',
  'ISO8601_TIMEZONE', 'ISO8601_SECOND', 'TIMESTAMP_ISO8601',
  'TZ', 'DATESTAMP_RFC822', 'DATESTAMP_RFC2822', 'DATESTAMP_OTHER', 'DATESTAMP_EVENTLOG',
  'HTTPDATE',
  // Syslog
  'SYSLOGTIMESTAMP', 'PROG', 'SYSLOGPROG', 'SYSLOGHOST', 'SYSLOGFACILITY', 'SYSLOGBASE',
  // Log
  'LOGLEVEL',
];

export default function GrokBuilder({ patterns }: Props) {
  const [sample, setSample] = useState('');
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selRange, setSelRange] = useState<[number, number] | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [fieldName, setFieldName] = useState('');
  const [patType, setPatType] = useState('GREEDYDATA');
  const [filter, setFilter] = useState('');
  const [testPattern, setTestPattern] = useState('');
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState('');
  const preRef = useRef<HTMLPreElement>(null);

  const handleInit = () => {
    if (!sample.trim()) return;
    setSegments([{ text: sample }]);
    setSelRange(null);
  };

  const handleSelect = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !preRef.current) return;
    const range = sel.getRangeAt(0);
    const preNode = preRef.current;
    // Calculate offset within the pre element
    const preRange = document.createRange();
    preRange.selectNodeContents(preNode);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const end = start + range.toString().length;
    if (start === end) return;
    setSelRange([start, end]);
    setShowPicker(true);
    setFieldName('');
  };

  const applyPattern = () => {
    if (!selRange) return;
    const [start, end] = selRange;
    // Rebuild segments with the new pattern applied
    const fullText = segments.map(s => s.text).join('');
    const selectedText = fullText.slice(start, end);

    // Find which segments are affected and split them
    const newSegments: Segment[] = [];
    let pos = 0;
    let applied = false;

    for (const seg of segments) {
      const segEnd = pos + seg.text.length;
      if (!applied && pos <= start && segEnd >= end && !seg.pattern) {
        // This segment contains the selection
        if (start > pos) newSegments.push({ text: seg.text.slice(0, start - pos) });
        newSegments.push({ text: selectedText, pattern: effectivePatType, field: fieldName || undefined });
        if (end < segEnd) newSegments.push({ text: seg.text.slice(end - pos) });
        applied = true;
      } else {
        newSegments.push(seg);
      }
      pos = segEnd;
    }

    setSegments(newSegments);
    setShowPicker(false);
    setSelRange(null);
  };

  const buildGrok = () => {
    return segments.map(s => {
      if (s.pattern) {
        return s.field ? `%{${s.pattern}:${s.field}}` : `%{${s.pattern}}`;
      }
      // Escape special regex chars in literal text
      return s.text.replace(/([\\|{}\[\]()^$+*?.])/g, '\\$1');
    }).join('');
  };

  const buildDissect = () => {
    return segments.map(s => s.pattern && s.field ? `%{${s.field}}` : s.text).join('');
  };

  const reset = () => { setSegments([]); setSelRange(null); setShowPicker(false); };

  const allPatterns = [...new Set([...BUILTIN_PATTERNS, ...patterns])].sort();
  const filteredPatterns = filter
    ? allPatterns.filter(p => p.toLowerCase().includes(filter.toLowerCase()))
    : allPatterns;

  const effectivePatType = filteredPatterns.includes(patType) ? patType : (filteredPatterns[0] ?? 'GREEDYDATA');

  return (
    <section>
      <h2>Grok-конструктор</h2>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Вставьте пример лога, выделите фрагмент мышкой и назначьте ему grok-паттерн.</p>

      {segments.length === 0 ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={sample} onChange={e => setSample(e.target.value)} placeholder="Вставьте пример лога…"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 4, border: '1px solid #555', background: 'var(--md-surface)', color: 'var(--md-on-surface)', fontSize: 13 }} />
          <button onClick={handleInit}>Начать</button>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={reset} style={{ fontSize: 12, padding: '4px 10px' }}>Сброс</button>
            <span style={{ fontSize: 11, color: '#888' }}>Выделите фрагмент мышкой →</span>
          </div>

          <pre ref={preRef} onMouseUp={handleSelect}
            style={{ padding: '10px 12px', background: '#111', borderRadius: 6, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-all', border: '1px solid #333', cursor: 'text', userSelect: 'text' }}>
            {segments.map((s, i) => s.pattern
              ? <span key={i} style={{ background: 'rgba(187,134,252,0.2)', borderRadius: 2, padding: '0 2px' }} title={`%{${s.pattern}${s.field ? ':' + s.field : ''}}`}>{s.text}</span>
              : <span key={i}>{s.text}</span>
            )}
          </pre>

          {showPicker && (
            <div style={{ marginTop: 8, padding: 12, border: '1px solid #555', borderRadius: 6, background: 'var(--md-surface)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Фильтр паттернов…"
                  style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #555', background: '#111', color: '#e0e0e0', fontSize: 12, width: 150 }} />
                <select value={effectivePatType} onChange={e => setPatType(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #555', background: '#111', color: '#e0e0e0', fontSize: 12 }}>
                  {filteredPatterns.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input value={fieldName} onChange={e => setFieldName(e.target.value)} placeholder="Имя поля (опционально)"
                  style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #555', background: '#111', color: '#e0e0e0', fontSize: 12, width: 160 }} />
                <button onClick={applyPattern} style={{ fontSize: 12, padding: '4px 10px' }}>Применить</button>
                <button onClick={() => setShowPicker(false)} style={{ fontSize: 12, padding: '4px 10px', background: '#444' }}>Отмена</button>
              </div>
            </div>
          )}

          {segments.some(s => s.pattern) && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#888' }}>Grok:</span>
                <button onClick={() => { navigator.clipboard.writeText(buildGrok()); }} style={{ fontSize: 11, padding: '2px 6px' }}>Копировать</button>
              </div>
              <pre style={{ padding: '10px 12px', background: '#0a0a0a', borderRadius: 6, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-all', border: '1px solid #333', color: '#03dac6', marginBottom: 8 }}>
                {buildGrok()}
              </pre>
              {segments.some(s => s.pattern && s.field) && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: '#888' }}>Dissect (быстрее, без regex):</span>
                    <button onClick={() => { navigator.clipboard.writeText(buildDissect()); }} style={{ fontSize: 11, padding: '2px 6px' }}>Копировать</button>
                  </div>
                  <pre style={{ padding: '10px 12px', background: '#0a0a0a', borderRadius: 6, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-all', border: '1px solid #333', color: '#ff9800' }}>
                    {buildDissect()}
                  </pre>
                </>
              )}
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 24, borderTop: '1px solid #333', paddingTop: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Тест grok-паттерна</h3>
        <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
          Приблизительная проверка: паттерны заменяются на регулярку, свойства grok не учитываются. Итог смотрите в Debug.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <input value={testPattern} onChange={e => setTestPattern(e.target.value)} placeholder="Grok-паттерн: %{IP:addr} %{GREEDYDATA:msg}"
            style={{ flex: 1, minWidth: 250, padding: '4px 8px', borderRadius: 4, border: '1px solid #555', background: '#111', color: '#e0e0e0', fontSize: 12 }} />
          <input value={testInput} onChange={e => setTestInput(e.target.value)} placeholder="Пример лога"
            style={{ flex: 1, minWidth: 250, padding: '4px 8px', borderRadius: 4, border: '1px solid #555', background: '#111', color: '#e0e0e0', fontSize: 12 }} />
          <button onClick={() => {
            try {
              let regex = testPattern;
              // %{PATTERN:field} и %{PATTERN:field:type} -> именованная группа, %{PATTERN} -> обычная
              regex = regex.replace(/%\{\w+:(\w+)(?::\w+)?\}/g, '(?<$1>.+?)');
              regex = regex.replace(/%\{\w+\}/g, '(.+?)');
              const re = new RegExp(regex);
              const m = testInput.match(re);
              if (m) { setTestResult(m.groups ? JSON.stringify(m.groups, null, 2) : `Совпадение: ${m[0]}`); }
              else { setTestResult('Нет совпадения'); }
            } catch (e: any) { setTestResult(`Ошибка regex: ${e.message}`); }
          }} style={{ fontSize: 12, padding: '4px 10px' }}>Тест</button>
        </div>
        {testResult && <pre style={{ padding: '8px 12px', background: '#0a0a0a', borderRadius: 4, fontSize: 12, border: '1px solid #333', color: testResult.startsWith('Нет') || testResult.startsWith('Ошибка') ? '#f44' : '#4f4' }}>{testResult}</pre>}
      </div>
    </section>
  );
}
