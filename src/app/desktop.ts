export type DesktopHost = "tauri" | "web";

/**
 * Whether the app is running inside the desktop shell.
 *
 * The desktop build sets `withGlobalTauri`, which makes
 * `window.__TAURI_INTERNALS__` the reliable signal. That flag was previously
 * absent from the window config, so this check always reported "web" in the
 * packaged app — which silently disabled every native affordance, including the
 * window controls, because the window is frameless and the app draws its own.
 *
 * The secondary checks are deliberate: a shell can expose either the internals
 * object or the older `__TAURI__` marker depending on version, and a UserAgent
 * carrying "Tauri" is a last-resort signal. Failing to detect the shell must
 * not happen silently, so this is written to be hard to get wrong rather than
 * to be clever.
 */
export function detectHost(): DesktopHost {
  if (typeof window === "undefined") return "web";
  const w = window as unknown as {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  if (w.__TAURI_INTERNALS__) return "tauri";
  if (w.__TAURI__) return "tauri";
  // Last resort: the desktop webview identifies itself in the user agent.
  if (typeof navigator !== "undefined" && /tauri/i.test(navigator.userAgent)) return "tauri";
  return "web";
}

export function detectPlatform(): "mac" | "win" | "linux" {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "win";
  return "linux";
}

export interface WindowApi {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  startDragging: () => Promise<void>;
  isFullscreen: () => Promise<boolean>;
  setFullscreen: (v: boolean) => Promise<void>;
  setAlwaysOnTop: (v: boolean) => Promise<void>;
}

export async function getWindowApi(): Promise<WindowApi> {
  if (detectHost() === "tauri") {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const w = getCurrentWindow();
      return {
        minimize: () => w.minimize(),
        toggleMaximize: () => w.toggleMaximize(),
        close: () => w.close(),
        startDragging: () => w.startDragging(),
        isFullscreen: () => w.isFullscreen(),
        setFullscreen: (v) => w.setFullscreen(v),
        setAlwaysOnTop: (v) => w.setAlwaysOnTop(v),
      };
    } catch {
      /* fall through */
    }
  }
  return {
    minimize: async () => {
      document.body.classList.toggle("desk-min", true);
    },
    toggleMaximize: async () => {
      document.body.classList.toggle("desk-max");
    },
    close: async () => {
      window.close();
    },
    startDragging: async () => {},
    isFullscreen: async () => Boolean(document.fullscreenElement),
    setFullscreen: async (v) => {
      if (v) await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen?.();
    },
    setAlwaysOnTop: async () => {},
  };
}

export function notifyNative(title: string, body: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    } else if ("Notification" in window && Notification.permission !== "denied") {
      void Notification.requestPermission().then((p) => {
        if (p === "granted") new Notification(title, { body });
      });
    }
  } catch {
    /* ignore */
  }
}

export function downloadText(filename: string, text: string, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function pickJsonFile(): Promise<unknown | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.selfimpulse.json,.mjpack"; // .mjpack kept: legacy pack import compatibility
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(String(reader.result)));
        } catch {
          resolve(null);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}
