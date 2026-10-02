/**
 * The expression sandbox — the ONLY eval surface in the product.
 *
 * FINALFIX hardening (security work #2): the 17.6.2 sandbox tokenized and
 * validated identifiers, but computed member access stayed open. Two proven
 * escapes (both PoC'd, both now pinned by probe/guardrail.test.ts):
 *
 *   A. `String.fromCharCode` builds the word "constructor" at runtime, so no
 *      blocked word ever appears in the source:
 *        (1)[String.fromCharCode(99,...)] [String.fromCharCode(99,...)](...)()
 *      reaches the Function constructor through a boxed number primitive.
 *   B. attacker-controlled INPUT supplies the property names and even the
 *      generated function body: `(1)[input.a][input.b](input.c)()`.
 *
 * The closing rules, layered:
 *   1. NO computed member access at all — `[` after a value-position token
 *      (identifier, string, number, `)`, `]`) is refused. Array literals
 *      stay legal (`[` after an operator/`(`/`,`/`[`/`:`/`?`). This kills
 *      escape B and every bracket-constructed property lookup, whatever the
 *      key's origin.
 *   2. Dangerous words are refused ANYWHERE in the source — including inside
 *      string literals — case-insensitively (covers fromCharCode smuggling:
 *      the built strings are substrings of nothing, but the rule also stops
 *      literal smuggling of "constructor"/"__proto__"/…).
 *   3. The whitelisted globals are passed as FROZEN FACADES: the String facade
 *      has NO fromCharCode/fromCodePoint, the Object facade has no
 *      defineProperty/getPrototypeOf, the Array facade caps construction —
 *      so even a dot-access on a facade finds nothing dangerous.
 *   4. The input is JSON-shielded (round-tripped) before evaluation: getters,
 *      functions, symbols and prototype-chain payloads cannot ride in.
 *   5. The result is never a function or symbol: if the expression produces
 *      one, it is refused — nothing callable may leave the sandbox.
 */
const BLOCKED = new Set([
  "this",
  "window",
  "document",
  "globalThis",
  "global",
  "process",
  "require",
  "eval",
  "Function",
  "constructor",
  "prototype",
  "__proto__",
  "fetch",
  "XMLHttpRequest",
  "import",
  "export",
  // FINALFIX: widen the identifier denylist to the rest of the escape surface.
  "arguments",
  "caller",
  "callee",
  "Symbol",
  "Reflect",
  "Proxy",
  "new",
  "super",
  "with",
  "delete",
  "self",
  "top",
  "parent",
  "frames",
  "location",
  "navigator",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "WebSocket",
  "Worker",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "queueMicrotask",
  "structuredClone",
  "atob",
  "btoa",
  // growth primitives (denial-of-service via string/array inflation)
  "repeat",
  "padStart",
  "padEnd",
]);

/* FINALFIX: dangerous words are refused anywhere in the SOURCE, including
 * inside string literals, case-insensitively. This is the belt to the
 * computed-access ban's suspenders: nothing prototype-shaped may even be
 * SPELLED, whatever token it hides in. */
const DANGEROUS_SUBSTRINGS = [
  "constructor",
  "__proto__",
  "prototype",
  "arguments",
  "caller",
  "callee",
  "function",
  "eval",
  "globalthis",
  "window",
  "document",
  "process",
  "require",
  "fromcharcode",
  "fromcodepoint",
  "defineproperty",
  "getprototypeof",
  "setprototypeof",
  "getownproperty",
  "import",
];

const WHITELIST_CALLS = new Set(["String", "Number", "Boolean", "Math", "Array", "Object", "JSON"]);

/* FINALFIX: frozen facades. The sandbox passes these in place of the real
 * globals, so a dot-access that survives the static rules finds no dangerous
 * static members (no String.fromCharCode, no Object.defineProperty, …). */
const STRING_FACADE = Object.freeze(Object.assign((value?: unknown) => String(value), {}));
const ARRAY_FACADE = Object.freeze(
  Object.assign(
    (...items: unknown[]) => {
      if (items.length === 1 && typeof items[0] === "number") {
        if (!Number.isInteger(items[0]) || items[0] < 0 || items[0] > 100000) throw new Error("blocked: array size");
        return new Array(items[0]);
      }
      return items;
    },
    { isArray: Array.isArray },
  ),
);
const OBJECT_FACADE = Object.freeze({
  keys: Object.keys,
  values: Object.values,
  entries: Object.entries,
  freeze: Object.freeze,
});
const NUMBER_FACADE = Object.freeze(Object.assign((value?: unknown) => Number(value), { isFinite: Number.isFinite, isInteger: Number.isInteger, isNaN: Number.isNaN, MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER }));
const BOOLEAN_FACADE = Object.freeze(Object.assign((value?: unknown) => Boolean(value), {}));

/** FINALFIX: strip getters/functions/prototype payloads from the input.
 * Descriptor-aware: a getter is NEVER read (even JSON.stringify would call
 * it), functions and symbols are dropped, poison keys are skipped, and
 * nesting is capped so a hostile object graph cannot recurse forever. */
function shieldClone(value: unknown, depth: number): unknown {
  if (depth > 12) return null;
  if (value === null || typeof value !== "object") {
    return typeof value === "function" || typeof value === "symbol" ? undefined : value;
  }
  if (Array.isArray(value)) return value.map((x) => shieldClone(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (!desc || desc.get || desc.set || typeof desc.value === "function") continue;
    out[key] = shieldClone(desc.value, depth + 1);
  }
  return out;
}

function shieldInput(input: unknown): unknown {
  try {
    return shieldClone(input ?? null, 0);
  } catch {
    return null;
  }
}

export function safeEvaluate(expr: string, input: unknown): unknown {
  const src = expr.trim();
  if (!src) throw new Error("empty expression");
  if (src.length > 600) throw new Error("expression too long");
  if (/[;`\\]/.test(src)) throw new Error("illegal character");

  // FINALFIX rule 2: dangerous words refused anywhere in the source.
  const lower = src.toLowerCase();
  for (const w of DANGEROUS_SUBSTRINGS) {
    if (lower.includes(w)) throw new Error("blocked property");
  }

  const tokens = src.match(/[A-Za-z_][A-Za-z0-9_]*|["'][^"']*["']|[0-9]+(?:\.[0-9]+)?|[=!<>]=?|&&|\|\||[()[\].,+\-*/%?:]|true|false|null/g);
  if (!tokens || tokens.join("") !== src.replace(/\s+/g, "")) {
    throw new Error("malformed expression");
  }

  let depth = 0;
  let prev: string | null = null;
  for (const t of tokens) {
    if (t === "(" || t === "[") depth += 1;
    if (t === ")" || t === "]") depth -= 1;
    if (depth > 48) throw new Error("expression too deep");

    // FINALFIX rule 1: NO computed member access. `[` in value position
    // (after something that yields a value) is refused; array literals —
    // `[` after an operator or opener — stay legal.
    if (t === "[" && prev !== null) {
      const prevIsValue =
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(prev) ||
        /^["']/.test(prev) ||
        /^[0-9]/.test(prev) ||
        prev === ")" ||
        prev === "]";
      if (prevIsValue) throw new Error("blocked property");
    }

    if (/^[A-Za-z_]/.test(t) && !["input", "true", "false", "null", "undefined"].includes(t) && !WHITELIST_CALLS.has(t)) {
      if (BLOCKED.has(t)) throw new Error(`blocked identifier: ${t}`);
    }
    if (BLOCKED.has(t)) throw new Error(`blocked identifier: ${t}`);
    prev = t;
  }

  const fn = new Function(
    "input",
    "String",
    "Number",
    "Boolean",
    "Math",
    "Array",
    "Object",
    "JSON",
    `"use strict"; return (${src});`,
  );
  // FINALFIX: facades instead of the real globals; shielded input.
  const result = fn(shieldInput(input), STRING_FACADE, NUMBER_FACADE, BOOLEAN_FACADE, Math, ARRAY_FACADE, OBJECT_FACADE, JSON);
  // FINALFIX rule 5: nothing callable may leave the sandbox.
  if (typeof result === "function" || typeof result === "symbol") throw new Error("blocked value");
  return result;
}
