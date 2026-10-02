/**
 * SelfImpulse — shared contracts for the Generalist layer (18.0.0).
 *
 * The user talks to ONE agent (SelfImpulse). Everything else — the specialist bench,
 * the MoE-style router, the provider seam, the accept/reject memory, the 90%
 * autonomy exam — is internal machinery behind that single front door.
 *
 * Honesty rule (the product's own): no field in these contracts may claim work
 * that did not happen. `executed: false` with a reason in words is a complete
 * answer; a fabricated one is not.
 */

/* ── the specialist bench ─────────────────────────────────────────────────── */

export type SpecialistCategory =
  | "code"
  | "security"
  | "testing"
  | "review"
  | "data"
  | "devops"
  | "research"
  | "writing"
  | "analysis"
  | "design"
  | "product"
  | "business"
  | "legal"
  | "comms"
  | "finance"
  | "silicon";

/**
 * A filesystem adapter (19.4.0). The tool runtime is storage-agnostic: Node
 * probes and the desktop host run the genuine node:fs/promises; the browser
 * front door supplies a virtual or File-System-Access-backed adapter. One
 * tool boundary, honest on every surface — the resolver and the gate are
 * identical either way.
 */
export interface VhFs {
  /** "node" | "browser-memory" | "browser-fs-access" — provenance, not decoration. */
  kind: string;
  readdir(path: string): Promise<Array<{ name: string; isDirectory: boolean }>>;
  stat(path: string): Promise<{ isFile: boolean; size: number }>;
  readText(path: string, maxBytes: number): Promise<{ text: string; truncated: boolean }>;
  mkdir(path: string): Promise<void>;
  writeText(path: string, content: string): Promise<void>;
}

/** The risk vocabulary is the product's existing one (risk.tier). */
export type RiskTier = "safe" | "risky" | "critical";

export interface Specialist {
  id: string;
  name: string;
  category: SpecialistCategory;
  /** What this specialist can actually do — one sentence per capability. */
  capabilities: string[];
  /** Routing vocabulary: exact-token matches weigh heaviest. */
  keywords: string[];
  /** The tier this specialist's OUTPUT actions are gated at. */
  riskTier: RiskTier;
  /** The system prompt bound to this specialist when it runs. */
  systemPrompt: string;
  /** Where this specialist came from — seed catalog, merged OSS, learned. */
  provenance: string;
}

/* ── the router (MoE-style selection) ─────────────────────────────────────── */

export interface RouteCandidate {
  id: string;
  score: number;
  reasons: string[];
}

export interface RouteDecision {
  selected: RouteCandidate[];
  considered: number;
  strategy: "single" | "multi" | "none";
  /** Which mechanism produced the final order — never left ambiguous. */
  routedBy: "deterministic" | "llm-assisted";
  /** Present when an LLM re-rank was attempted but fell back, with the reason. */
  fallbackReason?: string;
  /** Candidates the ROUTER itself scored highly enough but the shift policy
   *  refused, each with the plain-words reason ("revenue is off shift").
   *
   *  This field exists so a refusal is visible rather than merely absent. A
   *  routed plan that is short because a desk was switched off looks identical
   *  to one that is short because nothing fit — and only one of those is the
   *  user's own decision, so the product has to be able to tell them apart. */
  policyDropped?: Array<{ id: string; domain: string; allowed: boolean; reason?: string }>;
}

/* ── the provider seam ────────────────────────────────────────────────────── */

export type ProviderKind = "openai-compatible" | "anthropic" | "gemini";

export interface ProviderConfig {
  kind: ProviderKind;
  /** Full base URL — overridable for proxies/gateways/local servers. */
  baseUrl: string;
  /** The key — held HERE only on the web edition. On the desktop it is empty: the key lives in the OS keychain. */
  apiKey: string;
  model: string;
  /**
   * Desktop only: a REFERENCE to the key in the native store (`vh.providerkey.<kind>`). When set, the
   * call goes through the native `llm_chat` and the key never enters this window (see nativeProvider.ts).
   */
  secretRef?: string;
}

export type ProviderResult =
  | { ok: true; text: string; model: string; latencyMs: number }
  | {
      ok: false;
      error: string;
      kind: "no-key" | "egress-blocked" | "http-error" | "network" | "timeout" | "bad-response";
    };

/* ── accept/reject memory ─────────────────────────────────────────────────── */

export interface DecisionRecord {
  id: string;
  ts: string;
  userId: string;
  /** What situation the decision was about (the real request text or a summary). */
  scenario: string;
  /** What the agent did or proposed. */
  action: string;
  kind: "accept" | "reject" | "correction";
  /** The user's stated reason — the learning payload. */
  reason?: string;
  specialistId?: string;
  category?: SpecialistCategory;
}

export interface PatternReport {
  total: number;
  accepts: number;
  rejects: number;
  corrections: number;
  acceptanceRate: number;
  bySpecialist: Array<{ id: string; accepts: number; rejects: number; rate: number }>;
  recentRejections: DecisionRecord[];
}

/* ── the 90% autonomy exam ────────────────────────────────────────────────── */

export interface ExamQuestion {
  id: string;
  /** A REAL scenario from the user's decision history. */
  sourceRecordId: string;
  scenario: string;
  /** What SelfImpulse proposes it would do next time. */
  proposedAction: string;
  /** Why — the agent must explain its own answer. */
  explanation: string;
}

export interface ExamGrade {
  questionId: string;
  verdict: "correct" | "wrong";
  /** Required in spirit when wrong: the user's correction text. */
  correction?: string;
}

export interface ExamSession {
  id: string;
  createdAt: string;
  userId: string;
  /** The category this exam is scoped to — null for an overall exam. */
  category: SpecialistCategory | null;
  questions: ExamQuestion[];
  grades: ExamGrade[];
  score: number | null;
  passed: boolean | null;
  state: "proposed" | "graded";
}

export interface AutonomyGrant {
  granted: boolean;
  score: number | null;
  grantedAt: string | null;
  /** Monitor + override is permanent — this flag is informational, not a switch. */
  monitorOverrideAlwaysOn: true;
  attempts: number;
}

/* ── the generalist front door ────────────────────────────────────────────── */

export interface GateAsk {
  action: string;
  riskTier: RiskTier;
  specialistIds: string[];
  summary: string;
}

export type GateDecision = { approved: true } | { approved: false; reason: string };

export interface PeerDelegation {
  peerName: string;
  task: string;
}

export interface GeneralistDeps {
  provider?: ProviderConfig | null;
  /** The human gate. Risky work without a gate is refused, never auto-run. */
  gate?: (ask: GateAsk) => Promise<GateDecision>;
  /** Injectable fetch (probes drive a fake; production uses global fetch). */
  fetchImpl?: typeof fetch;
  /**
   * Evidence-retrieval fetch (19.3.0). When wired, the live-data GuardRail
   * FETCHES the sources an answer cites and checks the claim markers inside
   * them — "LIVE-DATA VERIFIED" then means actual retrieval, not just
   * disclosure. Absent → the GuardRail stays disclosure-only and says so.
   */
  evidenceFetch?: typeof fetch;
  /**
   * Mission workspace root (19.3.0). When set, specialists carry real
   * filesystem/research tools and run a real act/observe loop; each tool
   * call is gated and receipted. Absent → toolless members, exactly the
   * 19.2.0 path.
   */
  workspaceRoot?: string;
  /**
   * The filesystem adapter for the workspace (19.4.0). Browser front door
   * supplies a virtual or File-System-Access-backed VhFs so specialists run
   * their real tool loop there too; Node surfaces leave it absent and get
   * the genuine node:fs/promises. This closes the reviewer's integration
   * gap: the shipped app no longer falls back to toolless members.
   */
  fsImpl?: VhFs;
  /** Injectable peer delegation — the real one is the A2A bridge. */
  peerDelegate?: (d: PeerDelegation) => Promise<{ ok: boolean; detail: string; receiptDigest?: string }>;
  /** A2A handoff ledger hook — every delegation attempt, including refusals, gets a receipt (18.7.0). */
  onHandoff?: (h: { peer: string; task: string; outcome: "delegated" | "refused"; detail: string; receiptDigest?: string }) => void;
  now?: () => Date;
}

/** Per-member execution detail (19.3.0) — the door's evidence view over each member's agent loop. */
export interface MemberRunView {
  specialistId: string;
  providerCalls: number;
  latencyMs: number;
  truncated: boolean;
  /** The tool ids this member carried ([] = toolless run). */
  tools: string[];
  toolReceipts: Array<{ tool: string; outcome: string; inputPreview: string; outputPreview: string; digest?: string }>;
}

/** The Consul's report to the Captain (19.0.0 as AgentLead, 19.1.0 Captain, restructured to Consul) — computed from real member results. */
export interface CaptainReport {
  captainId: string;
  captainName: string;
  domain: string;
  status: "completed" | "partial" | "planned" | "blocked";
  summary: string;
  members: { specialistId: string; name: string; outcome: string; note?: string; memberDigest?: string }[];
  failures: string[];
  nextStep: string;
}

/** One real retrieval attempt behind the live-data GuardRail (19.3.0). */
export interface RetrievalRecord {
  url: string;
  status: "retrieved" | "failed";
  /** How many of the reply's claim markers were found inside the fetched source. */
  claimHits: number;
  /** ISO timestamp of the attempt — freshness is a fact, not an assertion. */
  fetchedAt: string;
  bytes: number;
  /** The real failure reason when status is "failed". */
  detail?: string;
}

/** Live-data GuardRail verdict (19.2.0; retrieval upgrade 19.3.0) — computed at runtime over the real reply, sealed in the digest. */
export interface LiveDataVerdict {
  required: boolean;
  verified: boolean;
  /** Time-sensitive claim markers found in the answer itself. */
  claims: string[];
  /** URLs present in the answer. */
  sources: number;
  /** as-of / dated-claim markers present in the answer. */
  datedClaims: number;
  note: string;
  /**
   * How a "verified" verdict was earned (19.3.0): "retrieval" = the cited
   * sources were ACTUALLY FETCHED and contained the claim markers;
   * "disclosure" = URLs + dated markers present but no retrieval was
   * performed. Null when the answer is not verified. The distinction is
   * sealed in the provenance digest — a disclosure stamp can never pose
   * as a retrieval stamp.
   */
  verifiedBy?: "retrieval" | "disclosure" | null;
  /** The real retrieval attempts — present whenever retrieval was tried (19.3.0). */
  retrieval?: RetrievalRecord[];
}

/** The Captain's synthesis over its members' real results (19.3.0). */
export interface SynthesisRecord {
  /** The synthesized domain result — the Consul's OWN provider call. */
  text: string;
  captainId: string;
  captainName: string;
  model: string;
  latencyMs: number;
  /** 64-hex digest over the synthesis canonical — its own receipt, never a member's. */
  digest?: string;
  /** The computed divergence report the synthesis reasoned over. */
  divergences: { corroborated: string[]; singleSourced: Array<{ atom: string; kind: string; backedBy: string[] }>; membersCompared: number };
}

/** Classified failure with recovery advice (19.0.0). */
export interface FailureInfo {
  klass: string;
  severity: "error" | "info";
  meaning: string;
  advice: string;
  retryable: boolean;
}

export interface GeneralistResponse {
  reply: string;
  /** 19.5.1 — the live ECDSA mission mandate this run rode under (portable authority plane). */
  authority?: { mandateDigest: string; scheme: "ecdsa-p256"; owner: string } | null;
  routed: RouteDecision;
  /** True ONLY when a provider call (or delegated execution) actually completed. */
  executed: boolean;
  outcome: "answered" | "planned" | "refused" | "gated-out" | "peer-delegated" | "error";
  specialistIds: string[];
  /** sha256 over the canonical response — an evidence hook, NOT a proof receipt. */
  provenanceDigest: string;
  /** Refusals and non-execution carry their reason in words. */
  note?: string;
  /** The domain captain's report on the routed work — present whenever the bench was routed. */
  captain?: CaptainReport;
  /** Live-data GuardRail verdict (19.2.0; retrieval upgrade 19.3.0) — present when the answer makes time-sensitive claims in research/analysis. */
  liveData?: LiveDataVerdict;
  /** Classified failure + recovery advice whenever the outcome is not an execution (19.0.0). */
  failure?: FailureInfo;
  /**
   * The Captain's synthesis (19.3.0) — present when several members
   * executed and the Captain's own synthesis call completed. When absent on
   * a multi-member run, the note says why (attempted-and-failed or no
   * synthesis possible) — silence is never the explanation.
   */
  synthesis?: SynthesisRecord;
  /**
   * Per-member agent-loop detail (19.3.0) — provider-call counts, the
   * toolset carried, and every tool receipt, so the door can show the
   * evidence of execution, not just its claims.
   */
  memberRuns?: MemberRunView[];
  /**
   * The execution workspace this run rode on (19.4.0) — kind names the
   * storage seam (node / browser-memory / browser-fs-access). Null means
   * the toolless path, stated, never hidden.
   */
  workspace?: { kind: string; root: string } | null;
  /**
   * 11WORKSPACE — the office floor this run opened. Captain (CEO) is the
   * only human-facing seat; Consuls own domains; desks are Adept + HR; the
   * floor is the MoE-capped sub-agent crew.
   * Absent only when nothing was routed.
   */
  office?: {
    name: "11WORKSPACE";
    desks: Array<{ id: string; label: string; consulId: string; consul: string; lead: string; hr: string; pooled: number; onFloor: number }>;
    floor: Array<{ id: string; desk: string; name: string }>;
    cap: number;
    line: string;
  };
}
