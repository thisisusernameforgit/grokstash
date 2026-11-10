import React, { useEffect, useState } from 'react';
import { useToast } from './Toast';

interface Diff { field: string; expected: string; actual?: string }
interface RunItem { file: string; name: string; ok: boolean; diffs?: Diff[]; error?: string }
interface RunResult { total: number; passed: number; failed: number; results: RunItem[] }
interface Fixture {
  file: string;
  name: string;
  namespace?: string | null;
  log?: string;
  expect?: Record<string, string>;
  error?: string;
}

export default function RegressionRunner() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [run, setRun] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const load = () => {
    fetch('/api/fixtures')
      .then(r => r.ok ? r.json() : [])
      .then((data: Fixture[]) => setFixtures(data))
      .catch(() => setFixtures([]));
  };

  useEffect(load, []);

  const runAll = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/fixtures/run', { method: 'POST' });
      if (!r.ok) {
        toast('Ошибка прогона фикстур', 'error');
        return;
      }
      const data: RunResult = await r.json();
      setRun(data);
      if (data.total === 0) toast('Фикстур нет', 'info');
      else if (data.failed) toast(`Провалено ${data.failed} из ${data.total}`, 'error');
      else toast(`Пройдено ${data.passed} из ${data.total}`, 'success');
    } catch {
      toast('Ошибка сети', 'error');
    } finally {
      setLoading(false);
    }
  };

  const remove = async (f: Fixture) => {
    if (!window.confirm(`Удалить фикстуру ${f.file}?`)) return;
    try {
      const r = await fetch(`/api/fixtures/${encodeURIComponent(f.file)}`, { method: 'DELETE' });
      if (!r.ok) {
        toast('Ошибка удаления', 'error');
        return;
      }
      setRun(null);
      load();
    } catch {
      toast('Ошибка сети', 'error');
    }
  };

  const statusOf = (file: string): RunItem | undefined => run?.results.find(r => r.file === file);

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Regression</h2>
        <button onClick={runAll} disabled={loading || fixtures.length === 0}>
          {loading ? 'Прогон…' : 'Прогнать все'}
        </button>
        {run && (
          <span style={{ fontSize: 13, color: run.failed ? '#f44' : '#4f4' }}>
            {run.passed} из {run.total} пройдено
          </span>
        )}
      </div>

      <p style={{ fontSize: 12, color: '#888', marginTop: 0 }}>
        Фикстуры лежат в <code>fixtures/*.json</code>: лог, namespace и ожидаемые поля. Добавить кейс можно в Debug кнопкой
        «В фикстуру» или скопировав файл.
      </p>

      {fixtures.length === 0 && <p style={{ color: '#888', fontSize: 13 }}>Фикстур нет</p>}

      {fixtures.length > 0 && (
        <div style={{ overflow: 'auto', border: '1px solid #555', borderRadius: 6 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #555' }}>Фикстура</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #555' }}>Namespace</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #555' }}>Лог</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #555' }}>Статус</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #555' }} />
              </tr>
            </thead>
            <tbody>
              {fixtures.map(f => {
                const res = statusOf(f.file);
                return (
                  <tr key={f.file}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #333' }}>{f.name || f.file}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #333', color: '#888' }}>{f.namespace || '-'}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #333', fontFamily: 'monospace', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.log || f.error || '-'}
                    </td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #333' }}>
                      {!res && <span style={{ color: '#888' }}>не запускалась</span>}
                      {res?.ok && <span style={{ color: '#4f4' }}>ok</span>}
                      {res && !res.ok && (
                        <div>
                          <span style={{ color: '#f44' }}>fail</span>
                          {res.error && <div style={{ color: '#888' }}>{res.error}</div>}
                          {res.diffs?.map((d, i) => (
                            <div key={i} style={{ color: '#ff9800' }}>
                              {d.field}: ожидалось «{d.expected}», получено «{d.actual ?? 'нет поля'}»
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #333', textAlign: 'right' }}>
                      <button onClick={() => remove(f)} style={{ fontSize: 11, padding: '2px 8px', background: 'none', border: '1px solid #555', color: '#c33', borderRadius: 4 }}>
                        удалить
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
