import React, { useState, useEffect } from 'react';
import { IconRefresh, IconAlertTriangle, IconCheck, IconX, IconPlayerPlay } from '@tabler/icons-react';
import CopyButton from './CopyButton';
import { useToast } from './Toast';

interface LogstashStatus {
  status: string;
  health: string;
  started_at: string;
  memory_usage: string;
  timestamp: number;
}

interface LogstashLogs {
  logs: string[];
  count: number;
  level: string;
  source?: string;
}

const getLogLineStyle = (line: string): React.CSSProperties => {
  const lowerCaseLine = line.toLowerCase();
  if (lowerCaseLine.includes('error')) {
    return { color: '#F44336' }; // Red for errors
  } else if (lowerCaseLine.includes('warn') || lowerCaseLine.includes('warning')) {
    return { color: '#FF9800' }; // Orange for warnings
  } else if (lowerCaseLine.includes('info')) {
    return { color: '#03DAC6' }; // Teal for info
  } else if (lowerCaseLine.includes('debug')) {
    return { color: '#BB86FC' }; // Purple for debug
  } else {
    return { color: 'var(--md-on-surface)' }; // Default color
  }
};

export default function LogstashLogs() {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<LogstashStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);
  const [level, setLevel] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [logData, setLogData] = useState<LogstashLogs | null>(null);
  const [restarting, setRestarting] = useState(false);
  const toast = useToast();

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/logstash/logs?limit=${limit}&level=${level}`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
        setLogs([]);
        setLogData(null);
      } else {
        setLogs(data.logs);
        setLogData(data);
      }
    } catch (err) {
      setError('Failed to fetch logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/logstash/status');
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setStatus({
        status: 'error',
        health: 'unknown',
        started_at: 'unknown',
        memory_usage: 'unknown',
        timestamp: Date.now() / 1000
      });
    }
  };

  const restartLogstash = async () => {
    if (!window.confirm('Перезапустить Logstash контейнер?')) return;
    setRestarting(true);
    try {
      const response = await fetch('/api/logstash/restart', { method: 'POST' });
      const data = await response.json();
      if (data.error) {
        toast(`Ошибка перезапуска: ${data.error}`, 'error');
      } else {
        toast('Logstash перезапущен', 'success');
        setTimeout(() => { fetchStatus(); fetchLogs(); }, 2000);
      }
    } catch {
      toast('Ошибка сети при перезапуске', 'error');
    } finally {
      setRestarting(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchStatus();
  }, [limit, level]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchLogs();
        fetchStatus();
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [autoRefresh, limit, level]);

  const getStatusIcon = () => {
    if (!status) return <IconX size={20} color="#666" />;

    if (status.status === 'running' && status.health === 'healthy') {
      return <IconCheck size={20} color="#4CAF50" />;
    } else if (status.status === 'running') {
      return <IconAlertTriangle size={20} color="#FF9800" />;
    } else {
      return <IconX size={20} color="#F44336" />;
    }
  };

  const getStatusText = () => {
    if (!status) return 'Unknown';
    return `${status.status} (${status.health})`;
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <section style={{ marginTop: 40 }}>
      <h2>Logstash Logs</h2>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 16,
        padding: 12,
        backgroundColor: '#1a1a1a',
        borderRadius: 4
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {getStatusIcon()}
          <span>Status: {getStatusText()}</span>
          {status && (
            <>
              <span style={{ fontSize: 12, color: '#888' }}>
                Started: {status.started_at}
              </span>
              <span style={{ fontSize: 12, color: '#888' }}>
                Memory: {status.memory_usage}
              </span>
              <span style={{ fontSize: 12, color: '#888' }}>
                Updated: {formatTimestamp(status.timestamp)}
              </span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <label style={{ fontSize: 12 }}>
            Limit:
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              style={{ marginLeft: 4, background: '#333', color: '#fff', border: '1px solid #555' }}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </label>

          <label style={{ fontSize: 12 }}>
            Level:
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              style={{ marginLeft: 4, background: '#333', color: '#fff', border: '1px solid #555' }}
            >
              <option value="all">All</option>
              <option value="ERROR">Error</option>
              <option value="WARN">Warning</option>
              <option value="INFO">Info</option>
            </select>
          </label>

          <button
            onClick={() => {
              fetchLogs();
              fetchStatus();
            }}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: loading ? '#555' : '#bb86fc',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            <IconRefresh size={16} />
            Refresh
          </button>

          <button
            onClick={restartLogstash}
            disabled={restarting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: restarting ? '#555' : '#f44336',
              cursor: restarting ? 'not-allowed' : 'pointer'
            }}
          >
            <IconPlayerPlay size={16} />
            {restarting ? 'Restarting...' : 'Restart'}
          </button>

          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto
          </label>
        </div>
      </div>

      {error && (
        <div style={{
          padding: 12,
          backgroundColor: '#ffebee',
          color: '#c62828',
          borderRadius: 4,
          marginBottom: 16
        }}>
          Error: {error}
        </div>
      )}

      <div style={{
        position: 'relative',
        border: '1px solid #555',
        borderRadius: 4,
        maxHeight: 600,
        overflow: 'auto',
        backgroundColor: '#1a1a1a',
        fontFamily: 'monospace, monospace',
        fontSize: '12px',
        lineHeight: '1.4',
        whiteSpace: 'pre-wrap' // Ensure line wrapping
      }}>
        <CopyButton data={logs.join('\n')} />

        {logs.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: '#888' }}>
            {loading ? 'Loading logs...' : 'No logs found'}
          </div>
        ) : (
          logs.map((logLine, index) => (
            <pre key={index} style={{ margin: 0, padding: '2px 8px', whiteSpace: 'pre-wrap', ...getLogLineStyle(logLine) }}>
              {logLine}
            </pre>
          ))
        )}
      </div>

      <div style={{
        marginTop: 8,
        fontSize: 12,
        color: '#888',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>Total logs: {logs.length}</span>
        <span>Level: {level}</span>
        {logData?.source && <span>Source: {logData.source}</span>}
      </div>
    </section>
  );
}