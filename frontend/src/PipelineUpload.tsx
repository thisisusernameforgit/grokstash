import React, { useRef, useState } from 'react';
import { useToast } from './Toast';

export default function PipelineUpload() {
  const [hover, setHover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function handleFiles(list: FileList) {
    const file = list[0];
    if (!file || !file.name.endsWith('.conf')) {
      toast('Только .conf-файлы', 'error');
      return;
    }
    const body = new FormData();
    body.append('file', file);
    try {
      const r = await fetch('/api/pipeline/upload', { method: 'POST', body });
      const j = await r.json();
      if (!r.ok) { toast(j.detail ?? 'Ошибка загрузки', 'error'); return; }
      toast(`«${file.name}» загружен`, 'success');
      document.dispatchEvent(new Event('pipeline:uploaded'));
    } catch {
      toast('Ошибка сети при загрузке', 'error');
    }
  }

  return (
    <section
      style={{ border: '2px dashed #555', padding: 24, textAlign: 'center', background: hover ? '#222' : 'transparent', cursor: 'pointer', borderRadius: 8 }}
      onDragOver={e => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={e => { e.preventDefault(); setHover(false); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); }}
      onClick={() => fileInputRef.current?.click()}
    >
      <p style={{ margin: 0, color: '#aaa', fontSize: 14 }}>
        Перетащите *.conf или нажмите для выбора
      </p>
      <input ref={fileInputRef} type="file" accept=".conf" style={{ display: 'none' }}
        onChange={e => { const l = e.target.files; if (l?.length) handleFiles(l); e.target.value = ''; }} />
    </section>
  );
}
