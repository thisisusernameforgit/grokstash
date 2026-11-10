import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { autocompletion, completeFromList } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import ResultViewer from './ResultViewer';
import { fixtureExpectation } from './flatten';
import { useToast } from './Toast';

interface Props { patterns: string[] }

export default function LiveParse({ patterns }: Props) {
  const [input, setInput] = useState(() => localStorage.getItem('grokstash_input') || '');
  const [namespace, setNamespace] = useState(() => localStorage.getItem('grokstash_namespace') || '');
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [events, setEvents] = useState<any[]>(() => { try { return JSON.parse(localStorage.getItem('grokstash_events') || '[]'); } catch { return []; } });
  const [prevEvents, setPrevEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [fixtureName, setFixtureName] = useState<string | null>(null);
  const [failedLines, setFailedLines] = useState<{ index: number; line: string }[]>([]);
  const toast = useToast();

  const loadNamespaces = useCallback(async () => {
    try {
      const r = await fetch('/api/namespaces');
      if (!r.ok) return;
      const list = await r.json();
      setNamespaces(Array.isArray(list) ? list : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadNamespaces();
    const handler = () => loadNamespaces();
    document.addEventListener('pipeline:uploaded', handler);
    return () => document.removeEventListener('pipeline:uploaded', handler);
  }, [loadNamespaces]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { localStorage.setItem('grokstash_input', input); }, [input]);
  useEffect(() => { localStorage.setItem('grokstash_namespace', namespace); }, [namespace]);
  useEffect(() => { localStorage.setItem('grokstash_events', JSON.stringify(events)); }, [events]);

  const parse = useCallback(async (text: string) => {
    if (!text.trim()) { setEvents([]); setFailedLines([]); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/log/trace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, namespace: namespace || undefined }),
      });
      if (r.ok) {
        const data = await r.json();
        setEvents(prev => { setPrevEvents(prev); return data.events ?? [data]; });
        const failed = Array.isArray(data.failed) ? data.failed : [];
        setFailedLines(failed);
        if (failed.length) {
          toast(`Не разобрано строк: ${failed.length}. Проверьте namespace и парсер.`, 'error');
        }
      } else {
        toast('Ошибка парсинга', 'error');
      }
    } catch {
      toast('Ошибка сети', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, namespace]);

  useEffect(() => {
    if (!auto) return;
    clearTimeout(timerRef.current);
    if (!input) { setEvents([]); return; }
    timerRef.current = setTimeout(() => parse(input), 400);
    return () => clearTimeout(timerRef.current);
  }, [input, auto, parse, namespace]);

  const grokCompletion = useMemo(() => autocompletion({
    override: [completeFromList(patterns.map(p => ({ label: `%{${p}}`, type: 'keyword', apply: `%{${p}}` })))]
  }), [patterns]);

  const fileRef = useRef<HTMLInputElement>(null);

  const saveFixture = async () => {
    if (!events.length || !fixtureName?.trim()) return;
    const lines = input.split('\n').filter(l => l.trim());
    if (lines.length > 1) toast('В фикстуру попадет только первая строка', 'info');
    try {
      const r = await fetch('/api/fixtures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fixtureName.trim(),
          namespace: namespace || null,
          log: lines[0] || input,
          expect: fixtureExpectation(events[0]),
        }),
      });
      if (!r.ok) { toast('Не удалось сохранить фикстуру', 'error'); return; }
      const data = await r.json();
      toast(`Фикстура ${data.file} сохранена`, 'success');
      setFixtureName(null);
    } catch {
      toast('Ошибка сети', 'error');
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setInput(text);
    if (!auto) parse(text);
    e.target.value = '';
  };

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Debug</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />
          Авто
        </label>
        {!auto && (
          <button onClick={() => parse(input)} disabled={loading}>
            {loading ? 'Парсинг…' : 'Разобрать'}
          </button>
        )}
        {auto && loading && <span style={{ fontSize: 12, color: '#888' }}>парсинг…</span>}
        <button onClick={() => fileRef.current?.click()} style={{ fontSize: 12, padding: '4px 10px' }}>Загрузить файл с логами</button>
        {events.length > 0 && fixtureName === null && (
          <button
            onClick={() => setFixtureName(`case-${new Date().toISOString().slice(0, 10)}`)}
            style={{ fontSize: 12, padding: '4px 10px' }}
          >
            В фикстуру
          </button>
        )}
        <input ref={fileRef} type="file" accept=".txt,.log,.csv" style={{ display: 'none' }} onChange={handleFile} />
      </div>

      {fixtureName !== null && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: '#888' }}>Имя фикстуры:</span>
          <input
            value={fixtureName}
            autoFocus
            onChange={e => setFixtureName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveFixture(); if (e.key === 'Escape') setFixtureName(null); }}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #555', background: '#111', color: '#e0e0e0', fontSize: 12, width: 220 }}
          />
          <button onClick={saveFixture} style={{ fontSize: 12, padding: '4px 10px' }}>Сохранить</button>
          <button onClick={() => setFixtureName(null)} style={{ fontSize: 12, padding: '4px 10px', background: '#444' }}>Отмена</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#888' }}>Namespace:</span>
        <input value={namespace} onChange={e => setNamespace(e.target.value)} list="ns-list" placeholder="например: my_source"
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #555', background: '#111', color: '#e0e0e0', fontSize: 13, width: 200 }} />
        <datalist id="ns-list">{namespaces.map(n => <option key={n} value={n} />)}</datalist>
        {namespace && <span style={{ fontSize: 11, color: '#666' }}>→ [@metadata][namespace] = "{namespace}"</span>}
      </div>

      <div style={{ border: '1px solid #555', borderRadius: 8, overflow: 'hidden', minHeight: 120, backgroundColor: '#1e1e1e' }}>
        <CodeMirror
          value={input}
          height="auto"
          minHeight="120px"
          theme={oneDark}
          extensions={[grokCompletion, EditorView.lineWrapping]}
          basicSetup={{ lineNumbers: true, foldGutter: false }}
          onChange={setInput}
          placeholder="Введите лог для парсинга…"
        />
      </div>

      {failedLines.length > 0 && (
        <div style={{ marginTop: 12, border: '1px solid #c33', borderRadius: 6, padding: '8px 12px', background: 'rgba(200,0,0,0.06)' }}>
          <div style={{ fontSize: 12, color: '#f55', marginBottom: 4 }}>
            Logstash не вернул событие для строк: {failedLines.length}
          </div>
          {failedLines.slice(0, 10).map(f => (
            <div key={f.index} style={{ fontSize: 12, fontFamily: 'monospace', color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              #{f.index + 1}: {f.line}
            </div>
          ))}
          {failedLines.length > 10 && (
            <div style={{ fontSize: 11, color: '#888' }}>и еще {failedLines.length - 10}</div>
          )}
        </div>
      )}

      <ResultViewer events={events} prevEvents={prevEvents} />
    </section>
  );
}
