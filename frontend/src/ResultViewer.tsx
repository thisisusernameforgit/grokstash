import React, { useState } from 'react';
import CopyButton from './CopyButton';
import { flatten } from './flatten';

interface Props { events: any[]; prevEvents?: any[] }

export default function ResultViewer({ events, prevEvents = [] }: Props) {
  const [compare, setCompare] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [fieldFilter, setFieldFilter] = useState('');
  const [hideNoisy, setHideNoisy] = useState(true);

  const NOISY_FIELDS = ['event.original', 'json_data_output', 'trace_id'];

  const saveCSV = () => {
    const allFields = events.map(ev => flatten(ev).sort((a, b) => a[0].localeCompare(b[0])));
    const keys = [...new Set(allFields.flatMap(f => f.map(([k]) => k)))].sort();
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = [keys.map(esc).join(',')];
    for (const fields of allFields) {
      const map = Object.fromEntries(fields);
      rows.push(keys.map(k => esc(map[k] ?? '-')).join(','));
    }
    const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'parsed_result.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportMapping = () => {
    const allFields = events.flatMap(ev => flatten(ev));
    const types: Record<string, string> = {};
    for (const [k, v] of allFields) {
      if (types[k]) continue;
      if (/^\d{4}-\d{2}-\d{2}/.test(v) || /T\d{2}:\d{2}/.test(v)) types[k] = 'date';
      else if (v === 'true' || v === 'false') types[k] = 'boolean';
      else if (/^\d+$/.test(v)) types[k] = 'long';
      else if (/^\d+\.\d+$/.test(v)) types[k] = 'float';
      else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) types[k] = 'ip';
      else types[k] = 'keyword';
    }
    const props: any = {};
    for (const [k, t] of Object.entries(types)) {
      const parts = k.split('.');
      let cur = props;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]]) cur[parts[i]] = { properties: {} };
        cur = cur[parts[i]].properties;
      }
      cur[parts[parts.length - 1]] = { type: t };
    }
    const template = { index_patterns: ['logs-*'], template: { mappings: { properties: props } } };
    const b = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'index_template.json'; a.click(); URL.revokeObjectURL(a.href);
  };

  if (!events.length) return null;

  const renderDiff = () => {
    const curFlat = Object.fromEntries(flatten(events[0] || {}));
    const prevFlat = Object.fromEntries(flatten(prevEvents[0] || {}));
    const allKeys = [...new Set([...Object.keys(curFlat), ...Object.keys(prevFlat)])].sort();
    return (
      <div style={{ overflow: 'auto', maxHeight: 600, border: '1px solid #555', borderRadius: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', top: 0, background: 'var(--md-surface)', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #555' }}>Поле</th>
              <th style={{ position: 'sticky', top: 0, background: 'var(--md-surface)', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #555' }}>До</th>
              <th style={{ position: 'sticky', top: 0, background: 'var(--md-surface)', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #555' }}>После</th>
            </tr>
          </thead>
          <tbody>
            {allKeys.map(k => {
              const prev = prevFlat[k] ?? '-';
              const cur = curFlat[k] ?? '-';
              const added = prev === '-' && cur !== '-';
              const removed = prev !== '-' && cur === '-';
              const changed = prev !== cur && !added && !removed;
              const bg = added ? 'rgba(0,200,0,0.08)' : removed ? 'rgba(200,0,0,0.08)' : changed ? 'rgba(255,152,0,0.08)' : 'transparent';
              if (prev === cur) return null;
              return (
                <tr key={k} style={{ background: bg }}>
                  <td style={{ padding: '3px 8px', color: '#bb86fc', whiteSpace: 'nowrap', borderBottom: '1px solid #333' }}>{added ? '+ ' : removed ? '− ' : '~ '}{k}</td>
                  <td style={{ padding: '3px 8px', wordBreak: 'break-all', borderBottom: '1px solid #333', maxWidth: 300, color: removed ? '#f44' : '#888' }}>{prev}</td>
                  <td style={{ padding: '3px 8px', wordBreak: 'break-all', borderBottom: '1px solid #333', maxWidth: 300, color: added ? '#4f4' : '#e0e0e0' }}>{cur}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {allKeys.every(k => (prevFlat[k] ?? '-') === (curFlat[k] ?? '-')) && <p style={{ padding: 12, color: '#888', fontSize: 13 }}>Нет изменений</p>}
      </div>
    );
  };

  const renderCompare = () => {
    const allFlat = events.map(ev => Object.fromEntries(flatten(ev)));
    const keys = [...new Set(allFlat.flatMap(m => Object.keys(m)))].sort();
    const saveCompareCSV = () => {
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      const header = ['Поле', ...events.map((_, i) => `#${i + 1}`)].map(esc).join(',');
      const rows = keys.map(k => [k, ...allFlat.map(m => m[k] ?? '-')].map(esc).join(','));
      const blob = new Blob(['\uFEFF' + [header, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'compare_result.csv'; a.click(); URL.revokeObjectURL(a.href);
    };
    return (
      <>
        <button onClick={saveCompareCSV} style={{ fontSize: 12, padding: '4px 10px', marginBottom: 8 }}>CSV (сравнение)</button>
        <div style={{ overflow: 'auto', maxHeight: 600, border: '1px solid #555', borderRadius: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', top: 0, background: 'var(--md-surface)', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #555' }}>Поле</th>
              {events.map((_, i) => <th key={i} style={{ position: 'sticky', top: 0, background: 'var(--md-surface)', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #555' }}>#{i + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            {keys.map(k => {
              const vals = allFlat.map(m => m[k] ?? '-');
              const allSame = vals.every(v => v === vals[0]);
              return (
                <tr key={k} style={{ background: allSame ? 'transparent' : 'rgba(255,152,0,0.07)' }}>
                  <td style={{ padding: '3px 8px', color: '#bb86fc', whiteSpace: 'nowrap', borderBottom: '1px solid #333' }}>{k}</td>
                  {vals.map((v, i) => <td key={i} style={{ padding: '3px 8px', wordBreak: 'break-all', borderBottom: '1px solid #333', maxWidth: 300 }}>{v}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </>
    );
  };

  const renderCards = () => events.map((ev, i) => {
    const src: string = ev['@message'] ?? ev['message'] ?? '';
    const tags: string[] = Array.isArray(ev.tags) ? ev.tags : [];
    const notParsed = tags.includes('_grokparsefailure') || tags.includes('_grokstashfailuredissect_mainconf');

    const fields = flatten(ev).sort((a, b) => a[0].localeCompare(b[0])).filter(([k]) =>
      (!fieldFilter || k.toLowerCase().includes(fieldFilter.toLowerCase())) &&
      (!hideNoisy || !NOISY_FIELDS.includes(k))
    );

    return (
      <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        {src && (
          <pre style={{ flex: '1 1 300px', margin: 0, padding: '10px 12px', background: '#111', borderRadius: 6, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-all', border: notParsed ? '1px solid #c33' : '1px solid #333' }}>
            {src}
          </pre>
        )}
        <div style={{ flex: '2 1 400px', position: 'relative', border: notParsed ? '1px solid #c33' : '1px solid #555', borderRadius: 6, overflow: 'auto', resize: 'both', minHeight: 100, maxHeight: 800, height: 400 }}>
          <CopyButton data={JSON.stringify(ev, null, 2)} />
          <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 12px', gap: 2 }}>
            {notParsed && (
              <div style={{ color: '#f55', fontSize: 12, marginBottom: 6 }}>
                Событие не разобрано: {tags.filter(t => t.startsWith('_')).join(', ')}
              </div>
            )}
            {fields.map(([k, v]) => (
              <div key={k}
                style={{ display: 'flex', gap: 8, fontSize: 13, padding: '2px 4px', borderRadius: 3 }}
              >
                <span style={{ color: '#bb86fc', minWidth: 180, flexShrink: 0 }}>{k}</span>
                <span style={{ color: '#e0e0e0', wordBreak: 'break-all' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  });

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Результат</h3>
        <button onClick={saveCSV} style={{ fontSize: 12, padding: '4px 10px' }}>CSV</button>
        <button onClick={() => { const b = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'parsed_result.json'; a.click(); URL.revokeObjectURL(a.href); }} style={{ fontSize: 12, padding: '4px 10px' }}>JSON</button>
        <button onClick={exportMapping} style={{ fontSize: 12, padding: '4px 10px' }}>ES Mapping</button>
        {events.length > 1 && <button onClick={() => setCompare(!compare)} style={{ fontSize: 12, padding: '4px 10px' }}>{compare ? 'Карточки' : 'Сравнить'}</button>}
        {prevEvents.length > 0 && <button onClick={() => setShowDiff(!showDiff)} style={{ fontSize: 12, padding: '4px 10px' }}>{showDiff ? 'Результат' : 'Diff'}</button>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <input value={fieldFilter} onChange={e => setFieldFilter(e.target.value)} placeholder="Фильтр полей…"
          style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #555', background: '#111', color: '#e0e0e0', fontSize: 12, width: 180 }} />
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: '#888' }}>
          <input type="checkbox" checked={hideNoisy} onChange={e => setHideNoisy(e.target.checked)} />
          Скрыть шумные поля
        </label>
      </div>
      {showDiff ? renderDiff() : compare && events.length > 1 ? renderCompare() : renderCards()}
    </div>
  );
}
