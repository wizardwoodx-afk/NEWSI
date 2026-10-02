/* Structured JSON-line logger — production observability baseline. */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.HANDLE_LOG_LEVEL || "info"] || 20;

function emit(level, event, fields = {}) {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

/* v0.9 contract retained: the audit level used throughout selfimpulse.js */
const audit = (event, meta) => emit("audit", event, meta);

export const log = {
  audit,
  debug: (event, fields) => emit("debug", event, fields),
  info: (event, fields) => emit("info", event, fields),
  warn: (event, fields) => emit("warn", event, fields),
  error: (event, fields) => emit("error", event, fields),
};
