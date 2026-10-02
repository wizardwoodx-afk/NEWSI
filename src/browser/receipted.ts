/**
 * VH 16.10.0 — FEATURE 6: RECEIPTED BROWSER USE.
 *
 * The 2026 method, with SelfImpulse's twist — every action mints a receipt:
 *
 *   - accessibility-tree-first: goto/extract run for REAL over HTTP(S)
 *     (fetch + HTML parse — no browser binary needed, works in the web
 *     edition too, honestly labeled as fetch-mode);
 *   - click/type are INTERACTIVE actions: they need the native computer-use
 *     boundary (the injected invoke — Tauri IPC → the OS driver). In hosts
 *     without it they REFUSE IN WORDS; the web edition never pretends.
 *   - every executed action appends to a hash-chained action receipt
 *     (what was requested, what actually happened, timings) that verifies
 *     with the same zero-product-state discipline as proof receipts.
 */
import { createHash } from "node:crypto";
import { checkEgressUrl } from "../security/guardrail";

export type BrowserAction =
  | { kind: "goto"; url: string }
  | { kind: "extract"; url: string; selectorHint: string }
  | { kind: "click"; target: string }
  | { kind: "type"; target: string; text: string };

export interface ActionResult { ok: boolean; detail: string; title: string }
export type BrowserDeps = {
  /** fetch-mode executor: REAL for goto/extract, refused for interactive actions. */
  perform: (a: BrowserAction) => Promise<ActionResult>;
};

export interface ActionReceiptEntry {
  seq: number;
  action: BrowserAction;
  ok: boolean;
  detail: string;
  at: string;
  prev: string; // hash chain
  hash: string;
}

export class ReceiptedBrowser {
  private chain = "";
  readonly entries: ActionReceiptEntry[] = [];
  constructor(private readonly deps: BrowserDeps) {}

  private seal(e: Omit<ActionReceiptEntry, "hash" | "prev">): ActionReceiptEntry {
    const prev = this.chain;
    const hash = createHash("sha256").update(`${prev}|${e.seq}|${e.at}|${JSON.stringify(e.action)}|${e.ok}|${e.detail}`).digest("hex");
    this.chain = hash;
    return { ...e, prev, hash };
  }

  /** Run one action — executed OR refused, it is receipted either way. */
  async run(action: BrowserAction): Promise<ActionResult> {
    const seq = this.entries.length + 1;
    let r: ActionResult;
    try {
      r = await this.deps.perform(action);
    } catch (e) {
      r = { ok: false, detail: String((e as Error)?.message ?? e), title: action.kind };
    }
    this.entries.push(this.seal({ seq, action, ok: r.ok, detail: r.detail, at: new Date().toISOString() }));
    return r;
  }

  /** The action receipt: hash-chained, verifiable without product state. */
  receipt(): string {
    return this.entries.map((e) => JSON.stringify({ seq: e.seq, action: e.action, ok: e.ok, at: e.at, prev: e.prev.slice(0, 16), hash: e.hash })).join("\n") + "\n";
  }
  get lastHash(): string { return this.chain; }
}

/** V-security: SSRF guard applied to every URL goto/extract fetches. The
 *  engine's own checkEgressUrl (security/guardrail.ts:200) blocks cloud
 *  metadata (169.254.169.254, metadata.google.internal), link-local, RFC1918
 *  and IPv6 ULA/link-local — fetch-mode previously did NOT call it, so a
 *  malicious page / crafted URL could redirect the agent to the LAN or cloud
 *  metadata endpoint and return the body. Fixed: we refuse at issue time AND
 *  cap redirects manually so a 3xx to an internal host can't be followed
 *  silently by the browser. */
const MAX_REDIRECTS = 5;

async function guardedFetch(fetchImpl: typeof fetch, initialUrl: string): Promise<{ res: Response; finalUrl: string; ms: number } | { refused: string }> {
  let url = initialUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const egress = checkEgressUrl(url);
    if (!egress.ok) return { refused: `refused: SSRF guard blocked ${url} (${egress.reason}) — fetch mode does not reach metadata, link-local or LAN endpoints.` };
    const t0 = Date.now();
    const res = await fetchImpl(url, { redirect: "manual" });
    const ms = Date.now() - t0;
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { refused: `redirect from ${url} had no Location header — not followed.` };
      try { url = new URL(loc, url).toString(); } catch { return { refused: `invalid redirect Location "${loc}" from ${url}.` }; }
      continue;
    }
    return { res, finalUrl: url, ms };
  }
  return { refused: `refused: more than ${MAX_REDIRECTS} redirects from ${initialUrl} — redirect cap reached.` };
}

/** The REAL fetch-mode executor: goto/extract run over HTTP; interactive refuses. */
export const fetchModeDeps = (fetchImpl: typeof fetch = fetch): BrowserDeps => ({
  perform: async (a: BrowserAction): Promise<ActionResult> => {
    if (a.kind === "goto" || a.kind === "extract") {
      const url = a.url;
      if (!/^https?:\/\//.test(url)) return { ok: false, detail: `refused: "${url}" is not an http(s) URL — no file:// or other schemes in fetch mode.`, title: a.kind };
      const egress0 = checkEgressUrl(url);
      if (!egress0.ok) return { ok: false, detail: `refused: SSRF guard blocked ${url} (${egress0.reason}).`, title: a.kind };
      const fetched = await guardedFetch(fetchImpl, url);
      if ("refused" in fetched) return { ok: false, detail: fetched.refused, title: a.kind };
      const { res, finalUrl, ms } = fetched;
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status} from ${finalUrl} after ${ms}ms — reported, not masked.`, title: a.kind };
      const html = await res.text();
      const title = (html.match(/<title[^>]*>([^<]{0,200})<\/title>/i)?.[1] ?? "(no title)").trim();
      if (a.kind === "extract") {
        const re = new RegExp(`<[^>]*${a.selectorHint}[^>]*>([\\s\\S]{0,400}?)<`, "i");
        const m = html.match(re);
        return { ok: true, detail: m ? `extracted via <${a.selectorHint}>: ${m[1].replace(/<[^>]+>/g, "").trim().slice(0, 200)}` : `selector hint <${a.selectorHint}> not found on ${finalUrl} (${html.length} bytes, ${ms}ms) — honest absence.`, title };
      }
      return { ok: true, detail: `${finalUrl} → HTTP ${res.status}, ${html.length} bytes, ${ms}ms, title: ${title}`, title };
    }
    return { ok: false, detail: `${a.kind} is an INTERACTIVE action — it needs the native computer-use boundary; this host refuses in words instead of pretending (see docs/history/SI-16.10-UPGRADE.md).`, title: a.kind };
  },
});
