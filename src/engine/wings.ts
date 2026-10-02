/**
 * SelfImpulse — WINGS: the inside-only capability planes.
 *
 *   ORG        Captain (CEO) → Consul [domain] → Adept/HR [desk] → sub-agents [the Crew]
 *              desk routing with honest refusal — nothing is invented.
 *   REACH      channel policy (pairing / allowlist / groups) + inbound safety
 *              scan (injection markers, vault probes).
 *   CONNECTORS the governed intake points (mail / calendar / sheets / finance),
 *              each with a risk tier and a typed request builder.
 *
 * Everything here runs inside the product. No outside product names, no
 * fabricated results: an unmatched task is refused in words.
 */

/* ------------------------------------------------------------------ ORG */

export interface DeskRoute {
  desk: string;
  leads: string[];
  crew: string[];
  brief: string;
}
export interface DeskRefusal {
  refused: string;
}
export type RouteResult = DeskRoute | DeskRefusal;

interface DeskDef {
  name: string;
  keywords: string[];
  crew: string[];
}

const DESKS: DeskDef[] = [
  {
    name: "FINANCE",
    keywords: ["ledger", "invoice", "gst", "tax", "payment", "salary", "excel", "sheet", "selfimpulseer", "reconcile", "budget", "cost", "finance", "payroll", "tally", "bank", "receipt"],
    crew: ["bookkeeper", "reconciler", "classifier", "filers-checker", "cash-flow"],
  },
  {
    name: "OPERATIONS",
    keywords: ["inventory", "dispatch", "logistics", "factory", "production", "plant", "maintenance", "schedule", "warehouse", "fleet", "dispatch"],
    crew: ["planner", "stock-watcher", "dispatch-coordinator", "maintenance-desk"],
  },
  {
    name: "PEOPLE",
    keywords: ["hire", "hiring", "hr", "leave", "onboard", "attendance", "people", "staff", "appraisal", "roster"],
    crew: ["recruiter", "onboarding-clerk", "attendance-keeper", "grievance-desk"],
  },
  {
    name: "ENGINEERING",
    keywords: ["deploy", "build", "bug", "code", "server", "api", "test", "release", "database", "infrastructure"],
    crew: ["builder", "test-runner", "release-clerk", "incident-note-taker"],
  },
  {
    name: "COMMERCE",
    keywords: ["order", "customer", "sales", "vendor", "purchase", "quotation", "lead", "catalogue", "pricing"],
    crew: ["order-clerk", "quotation-drafter", "vendor-liaison", "follow-ups"],
  },
];

export function isDeskRefusal(r: RouteResult): r is DeskRefusal {
  return "refused" in r;
}

/**
 * Captain's routing table. An unmatched task is refused IN WORDS — no invented
 * worker, no silent default desk. Leads are always Lead + HR for the desk
 * (the org model: Consul → Adept/HR); the crew are sub-agents.
 */
export function routeCaptainTask(task: string): RouteResult {
  const t = task.toLowerCase();
  let best: { def: DeskDef; score: number } | null = null;
  for (const def of DESKS) {
    let score = 0;
    for (const k of def.keywords) if (t.includes(k)) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { def, score };
  }
  if (!best) {
    return {
      refused: `no desk claims this task ("${task.slice(0, 80)}"). The Captain refuses in words rather than inventing a worker — name a desk (${DESKS.map((d) => d.name).join(", ")}) or rephrase with the work involved.`,
    };
  }
  return {
    desk: best.def.name,
    leads: [`${best.def.name.toLowerCase()}-manager`, `${best.def.name.toLowerCase()}-hr`],
    crew: best.def.crew,
    brief: `routed by keyword weight ${best.score}; crew works INSIDE only — cross-user contact is Captain ⇄ Captain.`,
  };
}

/* ----------------------------------------------------------------- REACH */

export interface ChannelPolicy {
  channel: string;
  /** unknown senders must pair before the channel answers them */
  pairing: boolean;
  allowFrom: string[];
  groups: "allowlist" | "open" | "closed";
  allowGroups?: string[];
}
export interface InboundMessage {
  from: string;
  isGroup?: boolean;
  group?: string;
}
export interface PolicyDecision {
  action: "allow" | "pair" | "deny";
  reason: string;
}

export function applyChannelPolicy(policy: ChannelPolicy, msg: InboundMessage): PolicyDecision {
  if (msg.isGroup) {
    if (policy.groups === "closed") return { action: "deny", reason: "group traffic is closed on this channel" };
    if (policy.groups === "allowlist") {
      const ok = (policy.allowGroups ?? []).includes(msg.group ?? "");
      return ok
        ? { action: "allow", reason: `group "${msg.group}" is allow-listed` }
        : { action: "deny", reason: `group "${msg.group ?? "?"}" is not allow-listed` };
    }
    return { action: "allow", reason: "group traffic is open on this channel" };
  }
  if (policy.allowFrom.includes(msg.from)) return { action: "allow", reason: "sender is allow-listed" };
  if (policy.pairing) return { action: "pair", reason: "unknown sender — pairing required before the channel answers" };
  return { action: "deny", reason: "unknown sender and pairing is off" };
}

const INJECTION_MARKERS = [
  "ignore previous",
  "ignore all previous",
  "disregard previous",
  "disregard all",
  "reveal system prompt",
  "show system prompt",
  "print your prompt",
  "{{vault",
  "reveal the vault",
  "dump your secrets",
  "you are now",
  "new instructions:",
];

export interface InboundScan {
  safe: boolean;
  reasons: string[];
}

/** Inbound safety scan: injection markers and vault probes are refused before any model sees them. */
export function scanInbound(text: string): InboundScan {
  const t = text.toLowerCase();
  const reasons: string[] = [];
  for (const m of INJECTION_MARKERS) if (t.includes(m)) reasons.push(`injection marker: "${m}"`);
  if (/\{\{\s*vault[:\s]/i.test(text)) reasons.push("vault reference in untrusted inbound text");
  return { safe: reasons.length === 0, reasons };
}

/* ----------------------------------------------------------- CONNECTORS */

export type Risk = "SAFE" | "RISKY";

export interface BuiltRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ConnectorDef<Req> {
  id: string;
  name: string;
  risk: Risk;
  requiresApproval: boolean;
  build: (req: Req) => BuiltRequest;
}

const BASE = "https://api.local.connectors.selfimpulse/v1";
const auth = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
});

export function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface MailSendReq { token: string; to: string; subject: string; body: string }
export interface MailSearchReq { token: string; q: string }
export interface CalendarCreateReq { token: string; title: string; start: string; end: string }
export interface SheetsReadReq { token: string; spreadsheetId: string; range: string }
export interface FinanceImportReq { token: string; csv: string }

export const CONNECTORS: [
  ConnectorDef<MailSearchReq>,
  ConnectorDef<MailSendReq>,
  ConnectorDef<CalendarCreateReq>,
  ConnectorDef<SheetsReadReq>,
  ConnectorDef<FinanceImportReq>,
] = [
  {
    id: "mail.search",
    name: "Mail — search",
    risk: "SAFE",
    requiresApproval: false,
    build: (r) => ({
      method: "GET",
      url: `${BASE}/messages/search?q=${encodeURIComponent(r.q)}`,
      headers: auth(r.token),
    }),
  },
  {
    id: "mail.send",
    name: "Mail — send",
    risk: "RISKY",
    requiresApproval: true,
    build: (r) => {
      const rfc2822 = [`To: ${r.to}`, `Subject: ${r.subject}`, "Content-Type: text/plain; charset=utf-8", "", r.body].join("\r\n");
      return {
        method: "POST",
        url: `${BASE}/messages/send`,
        headers: auth(r.token),
        body: JSON.stringify({ raw: base64url(rfc2822) }),
      };
    },
  },
  {
    id: "calendar.create",
    name: "Calendar — create event",
    risk: "RISKY",
    requiresApproval: true,
    build: (r) => ({
      method: "POST",
      url: `${BASE}/calendars/primary/events`,
      headers: auth(r.token),
      body: JSON.stringify({ summary: r.title, start: { dateTime: r.start }, end: { dateTime: r.end } }),
    }),
  },
  {
    id: "sheets.read",
    name: "Sheets — read range",
    risk: "SAFE",
    requiresApproval: false,
    build: (r) => ({
      method: "GET",
      url: `${BASE}/spreadsheets/${encodeURIComponent(r.spreadsheetId)}/values/${encodeURIComponent(r.range)}`,
      headers: auth(r.token),
    }),
  },
  {
    id: "finance.csvImport",
    name: "Finance — CSV intake",
    risk: "SAFE",
    requiresApproval: false,
    build: (r) => ({
      method: "POST",
      url: `${BASE}/finance/import`,
      headers: auth(r.token),
      body: JSON.stringify({ rows: financeCsvParse(r.csv) }),
    }),
  },
];

/** RFC 4180 CSV parse — quoted fields, escaped quotes, CRLF or LF. */
export function financeCsvParse(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(cell); cell = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      continue;
    }
    cell += c;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); if (row.length > 1 || row[0] !== "") rows.push(row); }
  const headers = rows.shift() ?? [];
  return { headers, rows };
}
