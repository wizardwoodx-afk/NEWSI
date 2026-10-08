// Auto-generated browser stub for node:http (throws in the WebView; provided so the
// browser build can resolve the import behind a typeof/feature guard).
const msg = "http is not available in the browser";
const unavailable = (): never => {
  throw new Error(msg);
};

export function createServer(..._args: unknown[]): never {
  return unavailable();
}

export function request(..._args: unknown[]): never {
  return unavailable();
}

export function get(..._args: unknown[]): never {
  return unavailable();
}

export type IncomingMessage = any;
export type Server = any;
export type ServerResponse = any;

const stub = new Proxy(
  { createServer, request, get },
  {
    get: (target: any, prop) => {
      if (prop in target) return target[prop];
      return unavailable;
    },
  }
);

export default stub;
