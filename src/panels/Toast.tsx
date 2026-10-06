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

  /* Every value below is a token the stylesheet actually declares. The eight
     names this used to ask for — --bg-panel, --border, --success, --err,
     --radius-md, --fs-sm, --ease-out-quint — were never defined in either
     sheet, so every one of them resolved to nothing and a toast rendered as bare
     unstyled text: no surface, no rule, no radius, no shadow, no entrance. They
     now read the house tokens instead:

       --bg-panel   -> --s1      the card/panel surface (.card, .composer)
       --border     -> --line-2  the hairline a floating panel is drawn with
       --success    -> --ok      the status step
       --err        -> --bad     the status step
       --radius-md  -> --r2      the panel radius, 10px
       --fs-sm      -> 13px      no size token exists; 13px is the body size the
                                 shell sets, so a toast matches the text around it
       easing       -> --ease    the one curve the system declares

     The shadow literal was rgba(45,49,66,0.25) — a cool slate baked for one light
     finish, which is why a toast sat correctly on platinum and vanished into the
     ground everywhere else. It is --shadow-3 now, so it is the same depth the
     cards use and it flips with the finish. */
  return (
    <div style={{ position: 'fixed', bottom: 92, right: 24, zIndex: 60, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id}
          style={{
            background: 'var(--s1)', border: '1px solid var(--line-2)',
            borderLeft: `3px solid ${t.kind === 'ok' ? 'var(--ok)' : t.kind === 'err' ? 'var(--bad)' : 'var(--accent)'}`,
            borderRadius: 'var(--r2)', padding: '10px 16px',
            fontSize: '13px', boxShadow: 'var(--shadow-3)',
            animation: 'si-toast-in 220ms var(--ease) both',
            minWidth: 240, maxWidth: 380,
          }}>
          {t.text}
        </div>
      ))}
    </div>
  );
};
