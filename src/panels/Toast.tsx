import React, { useState, useEffect } from 'react';

interface Toast { id: number; text: string; kind: 'info' | 'ok' | 'err'; }
let toasts: Toast[] = [];
let listeners = new Set<() => void>();
let next = 0;

export function toast(text: string, kind: Toast['kind'] = 'info') {
  const t = { id: ++next, text, kind };
  toasts = [...toasts, t];
  listeners.forEach(l => l());
  setTimeout(() => {
    toasts = toasts.filter(x => x.id !== t.id);
    listeners.forEach(l => l());
  }, 3000);
}

export const Toasts: React.FC = () => {
  const [_, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick(x => x+1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  return (
    <div style={{ position: 'fixed', bottom: 92, right: 24, zIndex: 60, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id}
          style={{
            background: 'var(--bg-panel)', border: '1px solid var(--border)',
            borderLeft: `3px solid ${t.kind === 'ok' ? 'var(--success)' : t.kind === 'err' ? 'var(--err)' : 'var(--accent)'}`,
            borderRadius: 'var(--radius-md)', padding: '10px 16px',
            fontSize: 'var(--fs-sm)', boxShadow: '0 8px 30px rgba(45,49,66,0.25)',
            animation: 'si-toast-in 220ms var(--ease-out-quint) both',
            minWidth: 240, maxWidth: 380,
          }}>
          {t.text}
        </div>
      ))}
    </div>
  );
};
