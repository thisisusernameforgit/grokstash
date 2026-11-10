import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';
interface ToastItem { id: number; msg: string; type: ToastType }

const Ctx = createContext<(msg: string, type?: ToastType) => void>(() => {});

export function useToast() { return useContext(Ctx); }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback((msg: string, type: ToastType = 'info') => {
    const id = ++nextId.current;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  const colors: Record<ToastType, string> = {
    success: '#2e7d32',
    error: '#c62828',
    info: '#1565c0',
  };

  return (
    <Ctx.Provider value={show}>
      {children}
      <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: colors[t.type],
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 6,
            fontSize: 14,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            maxWidth: 360,
            animation: 'fadein .2s ease',
          }}>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
