import React, { useEffect, useState, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompletion, completeFromList } from '@codemirror/autocomplete';
import { IconTrash, IconX, IconDeviceFloppy, IconGripVertical } from '@tabler/icons-react';
import { useToast } from './Toast';

interface FileMeta { name: string; size: number; mtime: string; enabled: boolean; vendor?: boolean }
interface Props { patterns: string[] }

export default function PipelineBrowser({ patterns }: Props) {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [modal, setModal] = useState<{ name: string; content: string; vendor?: boolean } | null>(null);
  const [edited, setEdited] = useState('');
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [hideVendor, setHideVendor] = useState(() => localStorage.getItem('grokstash_hide_vendor') === '1');
  const [template, setTemplate] = useState<{ key: string; name: string } | null>(null);
  const [searchResults, setSearchResults] = useState<{ name: string; lines: string[] }[]>([]);
  const toast = useToast();

  const load = () => {
    fetch('/api/pipeline').then(r => r.ok ? r.json() : []).then(setFiles).catch(() => setFiles([]));
  };

  // Logstash перезагружает конфиг раз в секунду и на время перезагрузки
  // останавливает пайплайн, поэтому ждем подтверждения, а не одну проверку
  type ReloadState = {
    ok: boolean;
    successes?: number;
    failures?: number;
    last_error?: string | null;
    last_success_timestamp?: string | null;
  };

  const fetchReload = async (): Promise<ReloadState | null> => {
    try {
      const r = await fetch('/api/logstash/reload');
      if (!r.ok) return null;
      const j = await r.json();
      return j.ok ? j : null;
    } catch {
      return null;
    }
  };

  const watchReload = async (baseline: ReloadState | null) => {
    for (let i = 0; i < 20; i++) {
      await new Promise(res => setTimeout(res, 700));
      const cur = await fetchReload();
      if (!cur) continue;
      if (cur.last_error && cur.last_error !== baseline?.last_error) {
        toast(`Logstash не принял конфиг: ${String(cur.last_error).slice(0, 300)}`, 'error');
        return;
      }
      if (cur.last_success_timestamp !== baseline?.last_success_timestamp) return;
    }
  };

  useEffect(load, []);
  useEffect(() => {
    const onUploaded = async () => {
      const baseline = await fetchReload();
      load();
      watchReload(baseline);
    };
    document.addEventListener('pipeline:uploaded', onUploaded);
    return () => document.removeEventListener('pipeline:uploaded', onUploaded);
  }, []);

  // Sorted by name = execution order in Logstash
  const sorted = useMemo(() => [...files].sort((a, b) => a.name.localeCompare(b.name)), [files]);
  const visible = useMemo(
    () => sorted.filter(f => !hideVendor || !f.vendor),
    [sorted, hideVendor],
  );

  const openFile = async (name: string) => {
    try {
      const r = await fetch(`/api/pipeline/${name}`);
      if (!r.ok) { toast('Ошибка загрузки файла', 'error'); return; }
      const content = await r.text();
      const vendor = !!files.find(f => f.name === name)?.vendor;
      setModal({ name, content, vendor });
      setEdited(content);
    } catch { toast('Ошибка сети', 'error'); }
  };

  const closeModal = () => setModal(null);

  const TEMPLATES: Record<string, string> = {
    namespace_filter: 'filter {\n  if [@metadata][namespace] == "MY_NAMESPACE" {\n    # ваш парсинг здесь\n  }\n}\n',
    grok_basic: 'filter {\n  grok {\n    patterns_dir => [ "/usr/share/logstash/patterns" ]\n    match => { "message" => "%{GREEDYDATA:parsed}" }\n    tag_on_failure => [ "_grokparsefailure" ]\n  }\n}\n',
    dissect_mutate: 'filter {\n  dissect {\n    mapping => {\n      "message" => "%{field1} %{field2} %{field3}"\n    }\n  }\n  mutate {\n    remove_field => [ "field1" ]\n  }\n}\n',
  };

  const createFromTemplate = async () => {
    if (!template) return;
    const body = TEMPLATES[template.key];
    if (!body) return;
    const clean = template.name.trim().replace(/\.conf$/, '').replace(/[^\w.-]+/g, '_');
    if (!clean) { toast('Имя файла пустое', 'error'); return; }
    const fname = `${clean}.conf`;
    try {
      const baseline = await fetchReload();
      const r = await fetch(`/api/pipeline/${fname}`, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body });
      if (!r.ok) { toast('Ошибка создания файла', 'error'); return; }
      toast(`${fname} создан из шаблона`, 'success');
      setTemplate(null);
      load();
      watchReload(baseline);
    } catch {
      toast('Ошибка сети', 'error');
    }
  };

  const duplicate = async (f: FileMeta) => {
    const newName = `copy_${f.name}`;
    if (files.some(x => x.name === newName) && !window.confirm(`Файл ${newName} уже есть, перезаписать?`)) return;
    try {
      const r = await fetch(`/api/pipeline/${f.name}`);
      if (!r.ok) { toast('Ошибка чтения файла', 'error'); return; }
      const code = await r.text();
      const baseline = await fetchReload();
      const put = await fetch(`/api/pipeline/${newName}`, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: code });
      if (!put.ok) { toast('Ошибка копирования', 'error'); return; }
      toast(`Скопировано ${newName}`, 'info');
      load();
      watchReload(baseline);
    } catch {
      toast('Ошибка сети', 'error');
    }
  };

  const save = async () => {
    if (!modal) return;
    setSaving(true);
    try {
      const baseline = await fetchReload();
      const r = await fetch(`/api/pipeline/${modal.name}`, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: edited });
      if (r.ok) {
        toast(`${modal.name} сохранен`, 'success');
        setModal({ ...modal, content: edited });
        load();
        watchReload(baseline);
      }
      else toast('Ошибка сохранения', 'error');
    } catch { toast('Ошибка сети', 'error'); }
    finally { setSaving(false); }
  };

  const toggle = async (f: FileMeta) => {
    const action = f.enabled ? 'disable' : 'enable';
    try {
      const baseline = await fetchReload();
      const r = await fetch(`/api/pipeline/${f.name}/${action}`, { method: 'POST' });
      if (r.ok) {
        toast(`${f.name} ${f.enabled ? 'отключен' : 'включен'}`, 'info');
        load();
        watchReload(baseline);
      }
      else toast('Ошибка переключения', 'error');
    } catch { toast('Ошибка сети', 'error'); }
  };

  const remove = async (f: FileMeta) => {
    if (!window.confirm(`Удалить ${f.name}?`)) return;
    try {
      const r = await fetch(`/api/pipeline/${f.name}`, { method: 'DELETE' });
      if (r.ok) { toast(`${f.name} удалён`, 'info'); closeModal(); load(); }
      else toast('Ошибка удаления', 'error');
    } catch { toast('Ошибка сети', 'error'); }
  };

  const handleDrop = async (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); return; }
    const src = visible[dragIdx];
    const target = visible[targetIdx];
    if (!src || !target || src.vendor) { setDragIdx(null); return; }
    // Generate new prefix to place src before/after target
    const targetPrefix = target.name.match(/^(\d+)/)?.[1] ?? '';
    const srcBase = src.name.replace(/^\d+-?/, '');
    let newNum: number;
    if (targetIdx === 0) {
      const firstNum = parseInt(visible[0].name) || 10;
      newNum = Math.max(1, firstNum - 1);
    } else {
      const prev = parseInt(visible[targetIdx - 1].name) || 0;
      const curr = parseInt(target.name) || prev + 10;
      newNum = Math.floor((prev + curr) / 2) || curr - 1;
    }
    const newName = `${String(newNum).padStart(2, '0')}-${srcBase}`;
    try {
      const r = await fetch(`/api/pipeline/${src.name}/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_name: newName }) });
      if (r.ok) { toast(`${src.name} → ${newName}`, 'info'); load(); }
      else toast('Ошибка переименования', 'error');
    } catch { toast('Ошибка сети', 'error'); }
    setDragIdx(null);
  };

  const grokCompletion = useMemo(() => autocompletion({
    override: [completeFromList(patterns.map(p => ({ label: `%{${p}}`, type: 'keyword', apply: `%{${p}}` })))]
  }), [patterns]);

  const isDirty = modal && edited !== modal.content;

  const doSearch = async () => {
    if (!search.trim()) { setSearchResults([]); return; }
    const results: { name: string; lines: string[] }[] = [];
    for (const f of sorted) {
      try {
        const r = await fetch(`/api/pipeline/${f.name}`);
        if (!r.ok) continue;
        const code = await r.text();
        const matches = code.split('\n').filter(l => l.toLowerCase().includes(search.toLowerCase()));
        if (matches.length) results.push({ name: f.name, lines: matches.slice(0, 3) });
      } catch { /* skip */ }
    }
    setSearchResults(results);
  };

  return (
    <section>
      <h2>Пайплайны <span style={{ fontSize: 12, color: '#888', fontWeight: 'normal' }}>порядок выполнения ↓</span></h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} placeholder="Поиск по .conf…"
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #555', background: '#111', color: '#e0e0e0', fontSize: 12, width: 220 }} />
        <button onClick={doSearch} style={{ fontSize: 12, padding: '4px 10px' }}>Найти</button>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#888', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={hideVendor}
            onChange={e => {
              setHideVendor(e.target.checked);
              localStorage.setItem('grokstash_hide_vendor', e.target.checked ? '1' : '0');
            }}
          />
          Скрыть вендорские
        </label>
      </div>
      {searchResults.length > 0 && (
        <div style={{ marginBottom: 12, padding: 8, border: '1px solid #555', borderRadius: 4, fontSize: 12, maxHeight: 150, overflow: 'auto' }}>
          {searchResults.map(r => (
            <div key={r.name} style={{ marginBottom: 6 }}>
              <span style={{ color: '#bb86fc', cursor: 'pointer' }} onClick={() => openFile(r.name)}>{r.name}</span>
              {r.lines.map((l, i) => <div key={i} style={{ color: '#888', paddingLeft: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.trim()}</div>)}
            </div>
          ))}
        </div>
      )}

      {files.length === 0 && <p style={{ color: '#888', fontSize: 13 }}>Нет загруженных пайплайнов</p>}

      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value=""
          onChange={e => {
            if (!e.target.value) return;
            setTemplate({ key: e.target.value, name: 'new_parser' });
          }}
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #555', background: '#111', color: '#e0e0e0', fontSize: 12 }}>
          <option value="">Создать из шаблона…</option>
          <option value="namespace_filter">Filter с namespace</option>
          <option value="grok_basic">Базовый grok</option>
          <option value="dissect_mutate">Dissect + mutate</option>
        </select>
        {template && (
          <>
            <input
              value={template.name}
              autoFocus
              onChange={e => setTemplate({ ...template, name: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') createFromTemplate(); if (e.key === 'Escape') setTemplate(null); }}
              placeholder="имя файла без .conf"
              style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #555', background: '#111', color: '#e0e0e0', fontSize: 12, width: 200 }}
            />
            <button onClick={createFromTemplate} style={{ fontSize: 12, padding: '4px 10px' }}>Создать</button>
            <button onClick={() => setTemplate(null)} style={{ fontSize: 12, padding: '4px 10px', background: '#444' }}>Отмена</button>
          </>
        )}
      </div>

      <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
        {visible.map((f, idx) => (
          <li key={f.name}
            draggable={!f.vendor}
            onDragStart={() => setDragIdx(idx)}
            onDragOver={e => e.preventDefault()}
            onDrop={() => handleDrop(idx)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, padding: '4px 8px',
              borderRadius: 4, background: dragIdx === idx ? 'rgba(187,134,252,0.1)' : 'transparent',
              border: '1px solid transparent', transition: 'background 0.15s',
            }}
          >
            <IconGripVertical size={14} style={{ color: '#666', cursor: 'grab', flexShrink: 0 }} />
            <span style={{ color: '#888', fontSize: 11, minWidth: 20, textAlign: 'right' }}>{idx + 1}.</span>
            {!f.vendor && (
              <input type="checkbox" checked={f.enabled} onChange={() => toggle(f)} title={f.enabled ? 'Отключить' : 'Включить'} />
            )}
            {f.vendor && (
              <span style={{ fontSize: 10, color: '#ff9800', border: '1px solid #ff9800', borderRadius: 3, padding: '0 4px' }}>vendor</span>
            )}
            <button onClick={() => openFile(f.name)} style={{ background: 'none', color: f.enabled ? '#bb86fc' : '#666', border: '1px solid #444', padding: '3px 10px', textDecoration: f.enabled ? 'none' : 'line-through' }}>
              {f.name}
            </button>
            <span style={{ fontSize: 11, color: '#666' }}>{f.size} B</span>
            <a href={`/api/pipeline/${f.name}/download`} download style={{ fontSize: 12 }}>скачать</a>
            {!f.vendor && (
              <>
                <button onClick={() => duplicate(f)} title="Дублировать" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#03dac6', padding: 4, fontSize: 12 }}>копия</button>
                <button onClick={() => remove(f)} title="Удалить" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c33', padding: 4 }}>
                  <IconTrash size={15} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--md-surface)', borderRadius: 8, padding: 24, width: '85%', maxWidth: 900, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid var(--md-border)', paddingBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>
                {modal.name}
                {modal.vendor && <span style={{ fontSize: 12, color: '#ff9800', marginLeft: 8 }}>vendor, только чтение</span>}
                {isDirty && !modal.vendor && <span style={{ fontSize: 12, color: '#ff9800', marginLeft: 8 }}>● несохранено</span>}
              </h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={save} disabled={saving || !isDirty || !!modal.vendor} style={{ display: 'flex', alignItems: 'center', gap: 4, background: isDirty ? '#2e7d32' : '#444' }}>
                  <IconDeviceFloppy size={15} />
                  {saving ? 'Сохранение…' : 'Сохранить'}
                </button>
                <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--md-on-surface)', padding: 4 }}>
                  <IconX size={22} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', borderRadius: 6 }}>
              <CodeMirror value={edited} height="100%" minHeight="300px" theme={oneDark} extensions={[grokCompletion]} editable={!modal.vendor} onChange={setEdited} />
            </div>

          </div>
        </div>
      )}
    </section>
  );
}
