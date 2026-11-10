import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { ToastProvider } from './Toast';
import LiveParse from './LiveParse';
import PipelineUpload from './PipelineUpload';
import PipelineBrowser from './PipelineBrowser';
import LogstashLogs from './LogstashLogs';
import Logo from './Logo';

import GrokBuilder from './GrokBuilder';
import RegressionRunner from './RegressionRunner';

type Tab = 'debug' | 'pipeline' | 'grok' | 'logs' | 'regression';

const App = () => {
  const [tab, setTab] = useState<Tab>('debug');
  const [patterns, setPatterns] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/patterns')
      .then(r => r.ok ? r.json() : [])
      .then(setPatterns)
      .catch(() => setPatterns([]));
  }, []);

  return (
    <ToastProvider>
      <main style={{ fontFamily: 'sans-serif', padding: 32, maxWidth: 1280, margin: '0 auto' }}>
        <Logo />

        <nav className="tabs">
          {(['debug', 'pipeline', 'grok', 'logs', 'regression'] as Tab[]).map(t => (
            <button key={t} className={`tab-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t === 'debug' ? 'Debug' : t === 'pipeline' ? 'Pipeline' : t === 'grok' ? 'Grok' : t === 'logs' ? 'Logs' : 'Regression'}
            </button>
          ))}
        </nav>

        {tab === 'debug' && <LiveParse patterns={patterns} />}
        {tab === 'pipeline' && (
          <>
            <PipelineUpload />
            <PipelineBrowser patterns={patterns} />
          </>
        )}
        {tab === 'grok' && <GrokBuilder patterns={patterns} />}
        {tab === 'logs' && <LogstashLogs />}
        {tab === 'regression' && <RegressionRunner />}
      </main>
    </ToastProvider>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
