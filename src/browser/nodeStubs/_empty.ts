// Empty fallback stub: a node builtin the browser bundle references but for
// which src/browser/nodeStubs/ has no named stub yet. Accessing any property
// throws so the gap is honest rather than silent.
const empty: Record<string, unknown> = new Proxy({}, {
  get(_t, key) {
    if (key === "__esModule") return false;
    throw new Error(`node builtin not available in browser build (${String(key)})`);
  },
});
export default empty;
