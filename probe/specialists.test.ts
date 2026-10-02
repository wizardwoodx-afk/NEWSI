/**
 * The specialist pack probe.
 *
 * Two jobs, and the first one is the one that scales: EVERY tool is driven with its own
 * declared defaults, twice, and the two runs must be identical. That is what makes the pack
 * deterministic in fact rather than in intention — a tool that reaches for the clock, the
 * network or Math.random() fails here, and so does one that throws on its own defaults or
 * forgets its basis line.
 *
 * The second job is the vectors: known answers for the arithmetic that has a published one
 * (WCAG's 4.48:1 for #777 on white, SemVer prerelease precedence, the IQR fence, Flesch on a
 * fixed sample). Where a number is my own implementation's, the label says which formula it
 * pins, so a future change is a deliberate act rather than a silent drift.
 */
import * as sp from "../src/specialists";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

// ─────────────────────────────────────────────────────────────────────────────
section("1. every tool drives from its own defaults, twice, identically");

ok("the pack ships a substantial set of tools", sp.TOOLS.length >= 30, `${sp.TOOLS.length} tools`);
// 19.7.15 [Cartographer]: the pack widens from nine domains to twenty-five — sixteen new
// ones, each with engines of its own, because a domain with no tool is a label, not a domain.
ok("across all twenty-five domains", sp.DOMAINS.length === 25, `${sp.DOMAINS.length} domains`);
const TOOL_DOMAINS = [...new Set(sp.TOOLS.map((t) => t.domain))];
ok("every domain except finance-in has tools of its own",
  TOOL_DOMAINS.length === 25 && !TOOL_DOMAINS.includes("finance-in"),
  TOOL_DOMAINS.join(" · "));
ok("and every one of those domains has at least two deterministic tools",
  sp.DOMAINS.every((d) => sp.toolsForDomain(d.id).length >= 2),
  sp.DOMAINS.filter((d) => sp.toolsForDomain(d.id).length < 2).map((d) => d.id).join(", "));
ok("the pack ships sixty-seven tools of its own (seven more arrive with the finance pack)",
  sp.TOOLS.length === 67, `${sp.TOOLS.length} tools`);

const toolFailures: string[] = [];
const nondeterministic: string[] = [];
const missingBasis: string[] = [];
for (const t of sp.TOOLS) {
  const defaults = Object.fromEntries(t.fields.map((f) => [f.key, f.def]));
  try {
    const a = t.run(defaults);
    const b = t.run(defaults);
    if (JSON.stringify(a) !== JSON.stringify(b)) nondeterministic.push(t.id);
    if (!a.headline || a.headline.length < 5) toolFailures.push(`${t.id}: empty headline`);
    if (!a.basis || a.basis.length < 20) missingBasis.push(t.id);
  } catch (e) {
    toolFailures.push(`${t.id}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
ok("every tool runs on its declared defaults without throwing", toolFailures.length === 0, toolFailures.slice(0, 4).join(" | "));
ok("every tool is deterministic — two runs are byte-identical", nondeterministic.length === 0, nondeterministic.join(", "));
ok("every tool states the rule or formula behind its answer", missingBasis.length === 0, missingBasis.join(", "));
ok("every tool declares at least one field", sp.TOOLS.every((t) => t.fields.length > 0));
ok("tool ids are unique", new Set(sp.TOOLS.map((t) => t.id)).size === sp.TOOLS.length);
ok("every field has a default that matches its kind",
  sp.TOOLS.every((t) => t.fields.every((f) => f.kind === "toggle" ? typeof f.def === "boolean" : typeof f.def === "string")));
ok("a domain's tools are reachable by domain",
  sp.toolsForDomain("dev").length === 5 && sp.toolById("contrast")?.domain === "frontend");

// ─────────────────────────────────────────────────────────────────────────────
section("2. frontend — WCAG's own published numbers");

ok("black on white is the maximum 21:1",
  sp.contrastRatio(sp.parseColor("#000000")!, sp.parseColor("#ffffff")!) === 21);
const grey = sp.contrastRatio(sp.parseColor("#777777")!, sp.parseColor("#ffffff")!);
ok("WCAG's worked example #777 on white is 4.48:1", Math.abs(grey - 4.48) < 0.01, grey.toFixed(4));
ok("and it is graded as failing AA for body text", !sp.wcagVerdict(grey).aaNormal && sp.wcagVerdict(grey).aaLarge);
ok("7:1 passes AAA for body text", sp.wcagVerdict(7).aaaNormal);
ok("identical colours are 1:1", sp.contrastRatio(sp.parseColor("#123456")!, sp.parseColor("#123456")!) === 1);
ok("shorthand hex expands", sp.parseColor("#abc")!.r === 170 && sp.parseColor("#abc")!.g === 187);
ok("rgb() is read", sp.parseColor("rgb(1, 2, 3)")!.b === 3);
ok("hsl() is read", sp.parseColor("hsl(0, 100%, 50%)")!.r === 255);
ok("alpha is preserved from an 8-digit hex", Math.abs(sp.parseColor("#00000080")!.a - 0.502) < 0.01);
ok("an unreadable colour is refused, not approximated", sp.parseColor("cornflowerblue") === null);
ok("hex round-trips", sp.toHex(sp.parseColor("#D5B26B")!) === "#d5b26b");

const scale = sp.typeScale(16, 1.25, 6);
ok("a 16px / 1.25 scale produces whole and quarter-pixel steps",
  scale.every((s) => (s.px * 4) % 1 === 0), scale.map((s) => s.px).join(", "));
ok("the base step is exactly the base size", scale.some((s) => s.step === 0 && s.px === 16));
ok("rem is px over 16", scale.every((s) => Math.abs(s.rem - s.px / 16) < 0.001));

const snap = sp.snapToGrid([4, 10, 16, 24, 30, 40, 55], 8);
ok("off-grid values are snapped and the movement reported",
  snap.onGrid === 3 && snap.worst === 4, `onGrid=${snap.onGrid} worst=${snap.worst}`);

// ─────────────────────────────────────────────────────────────────────────────
section("3. engineering — versions, commits, statuses, ladders, cron");

ok("a prerelease sorts BELOW its release",
  sp.compareSemver(sp.parseSemver("1.4.2-rc.3")!, sp.parseSemver("1.4.2")!) === -1);
ok("numeric identifiers compare numerically, not as strings",
  sp.compareSemver(sp.parseSemver("1.0.0-rc.10")!, sp.parseSemver("1.0.0-rc.9")!) === 1);
ok("build metadata is ignored in precedence",
  sp.compareSemver(sp.parseSemver("1.0.0+a")!, sp.parseSemver("1.0.0+b")!) === 0);
ok("a caret range admits 1.4.2 for ^1.2.0", sp.satisfiesRange(sp.parseSemver("1.4.2")!, "^1.2.0").ok);
ok("and refuses 2.0.0", !sp.satisfiesRange(sp.parseSemver("2.0.0")!, "^1.2.0").ok);
ok("a tilde range stops at the minor", sp.satisfiesRange(sp.parseSemver("1.2.9")!, "~1.2.0").ok
  && !sp.satisfiesRange(sp.parseSemver("1.3.0")!, "~1.2.0").ok);
ok("the range is expanded so the answer is checkable",
  sp.satisfiesRange(sp.parseSemver("1.4.2")!, "^1.2.0").expanded.some((e) => e.includes(">=1.2.0")),
  sp.satisfiesRange(sp.parseSemver("1.4.2")!, "^1.2.0").expanded.join(" | "));
ok("unions work", sp.satisfiesRange(sp.parseSemver("1.1.0")!, "2.x || 1.x").ok);
ok("bumping rolls the right digit", sp.nextVersion(sp.parseSemver("1.4.2")!, "major") === "2.0.0"
  && sp.nextVersion(sp.parseSemver("1.4.2")!, "minor") === "1.5.0"
  && sp.nextVersion(sp.parseSemver("1.4.2")!, "patch") === "1.4.3");
ok("a prerelease bump increments the last number", sp.nextVersion(sp.parseSemver("1.4.2-rc.3")!, "prerelease") === "1.4.2-rc.4");
ok("a nonsense version is refused", sp.parseSemver("1.4") === null);

ok("a clean conventional commit has no errors",
  sp.lintCommit("feat(auth): add device-bound session keys").errors.length === 0);
ok("a missing type is an error", sp.lintCommit("Fixed some stuff.").errors.length > 0);
ok("an unknown type is caught", sp.lintCommit("wibble: something").errors.some((e) => e.includes("not a conventional type")));
ok("a body glued to the subject is caught",
  sp.lintCommit("fix: thing\nthis line should have been blank").errors.some((e) => e.includes("second line must be blank")));
ok("a BREAKING CHANGE footer marks the commit",
  sp.lintCommit("feat: change\n\nBREAKING CHANGE: the field moved").breaking === true);
ok("over-length descriptions are caught",
  sp.lintCommit(`feat: ${"x".repeat(80)}`).errors.some((e) => e.includes("72")));

ok("504 is retryable but only for an idempotent request",
  sp.httpSemantics(504).retry === "yes" && sp.httpSemantics(504).idempotentSafe.includes("idempotent"));
ok("404 is never retryable", sp.httpSemantics(404).retry === "no");
ok("an unassigned code is unclassified rather than guessed", sp.httpSemantics(599).known === false);

const ladder = sp.backoffSchedule(5, 200, 2, 30000);
ok("the ladder doubles and totals 6.2s",
  ladder.rows.map((r) => r.delayMs).join(",") === "200,400,800,1600,3200" && ladder.human === "6.2s",
  `${ladder.rows.map((r) => r.delayMs).join(",")} / ${ladder.human}`);
const capped = sp.backoffSchedule(8, 1000, 3, 10000);
ok("the cap binds and is reported", capped.rows.some((r) => r.delayMs === 10000));
ok("the ladder is deterministic — jitter is a fixed permille, not randomness",
  JSON.stringify(sp.backoffSchedule(4, 100, 2, 9999, 100)) === JSON.stringify(sp.backoffSchedule(4, 100, 2, 9999, 100)));

const cron = sp.parseCron("0 3 * * 1", "2026-09-22", 3);
ok("a weekly 03:00 Monday job parses", cron.valid && cron.errors.length === 0);
ok("and its next run is the following Monday", cron.next[0] === "2026-09-28 03:00", cron.next.join(" | "));
ok("a six-field expression is refused with the dialect named",
  !sp.parseCron("0 0 3 * * 1", "2026-09-22").valid
  && sp.parseCron("0 0 3 * * 1", "2026-09-22").errors[0]!.includes("exactly 5"));
ok("an out-of-range value is refused", !sp.parseCron("0 25 * * *", "2026-09-22").valid);
/* cron's oddity: with BOTH day fields restricted, EITHER match fires the job */
const both = sp.parseCron("0 0 1 * 1", "2026-09-22", 8);
ok("both day fields restricted means either day fires the job",
  both.next.some((d) => d.endsWith("-28 00:00")) && both.next.some((d) => d.includes("-01 00:00")),
  both.next.join(" | "));

// ─────────────────────────────────────────────────────────────────────────────
section("4. API — limits, payloads, keys, paging");

const bucket = sp.tokenBucketPlan(600, 20, 15, 30);
ok("a 10/s refill cannot sustain 15/s demand", bucket.steadyState === 10);
ok("the burst absorbs two seconds before the limit bites", bucket.firstRejection === 3, String(bucket.firstRejection));
ok("and the refill is a per-SECOND rate, which is the part people miss",
  sp.tokenBucketPlan(60, 5, 2, 10).steadyState === 1);

const small = sp.payloadBudget('{"a":1}');
ok("a payload is measured in UTF-8 bytes as the wire sees it", small.totalBytes === 7, String(small.totalBytes));
const big = sp.payloadBudget('{"id":"x","notes":"' + "n".repeat(300) + '"}');
ok("the dominant field is named", big.largest?.field === "notes", String(big.largest?.field));
ok("invalid JSON is refused with the parse error",
  sp.payloadBudget("{not json}").ok === false && (sp.payloadBudget("{not json}").error ?? "").includes("not valid JSON"));

const key = sp.checkIdempotencyKey("3f8a1c9b-6d2e-4f71-9a55-2c7e8b0d4e13");
ok("a UUIDv4 is accepted and recognised as such", key.ok && key.charset === "uuid");
ok("a short, human-typed key is refused", !sp.checkIdempotencyKey("dev-key-1").ok
  && sp.checkIdempotencyKey("dev-key-1").issues.some((i) => i.includes("too short")));
ok("entropy is measured, not asserted", sp.stringEntropyBits("aaaaaaaa") === 0 && sp.stringEntropyBits("abcd") === 8);

const paging = sp.paginationPlan(250000, 100, 25000, 10000);
ok("page arithmetic is exact", paging.pages === 2500 && paging.lastPageSize === 100);
ok("deep paging is called out with the reason", paging.deep && paging.lines.some((l) => l.includes("keyset")));
ok("a shallow offset is not flagged", !sp.paginationPlan(500, 25, 50).deep);

// ─────────────────────────────────────────────────────────────────────────────
section("5. data — the statistics, checked against known values");

ok("the median of an even set interpolates", sp.percentile([1, 2, 3, 4], 50) === 2.5);
ok("the median of an odd set is the middle", sp.percentile([1, 2, 3, 4, 5], 50) === 3);
/* percentile() takes a SORTED array by contract; percentiles() sorts internally. Pin both facts. */
ok("p0 and p100 are the extremes of a sorted series",
  sp.percentile([1, 5, 9], 0) === 1 && sp.percentile([1, 5, 9], 100) === 9);
ok("percentiles() sorts for the caller, so an unsorted series still measures correctly",
  sp.percentiles([5, 1, 9], [50])[0]!.value === 5);
ok("one point is its own percentile", sp.percentile([42], 95) === 42);

const fence = sp.outliersIqr([10, 11, 12, 12, 13, 13, 14, 15, 16, 17, 18, 120]);
ok("Tukey's fences find the single outlier", fence.outliers.join(",") === "120", fence.outliers.join(","));
ok("the fences are computed from interpolated quartiles",
  Math.abs(fence.q1 - 12) < 0.001 && Math.abs(fence.upperFence - 22.625) < 0.001,
  `q1=${fence.q1} fence=${fence.upperFence}`);
ok("a degenerate quartile spread is reported as degenerate",
  sp.outliersIqr([5, 5, 5, 5, 5, 5, 5, 5, 5, 99]).whys.some((w) => w.includes("degenerate")));

const exp = sp.abTest(5000, 400, 5000, 452);
ok("the observed rates are exact", Math.abs(exp.rateA - 8) < 1e-9 && Math.abs(exp.rateB - 9.04) < 1e-9);
ok("a +13% relative lift is measured", Math.abs(exp.liftPct - 13) < 0.05, exp.liftPct.toFixed(3));
ok("and at this sample size it is NOT yet significant", !exp.significant95, `p=${exp.p.toFixed(4)}`);
ok("the interval spans zero exactly when the test is not significant",
  exp.ciLowPct < 0 && exp.ciHighPct > 0, `${exp.ciLowPct.toFixed(2)} … ${exp.ciHighPct.toFixed(2)}`);
ok("the peeking warning is always attached", exp.guardrails.some((g) => g.includes("peeking")));
ok("a tiny arm is flagged as too small for this test",
  sp.abTest(40, 3, 40, 5).guardrails.some((g) => g.includes("fewer than 100 trials")));
const n = sp.sampleSize(8, 10, 0.8, 0.05);
ok("the two-proportion sample size matches this implementation's formula", n === 18878, String(n));
ok("halving the effect roughly quadruples the sample",
  Math.abs(sp.sampleSize(8, 5, 0.8, 0.05) / n - 3.9) < 0.4,
  `${sp.sampleSize(8, 5, 0.8, 0.05)} vs ${n}`);

// ─────────────────────────────────────────────────────────────────────────────
section("6. security — and the limits each tool admits");

const hits = sp.scanSecrets('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nDATABASE_URL=postgres://app:hunter2@db.internal:5432/prod');
ok("an AWS key id is found by its fixed prefix", hits.some((h) => h.name === "AWS access key id"));
ok("a connection string with an embedded password is found", hits.some((h) => h.name === "Connection string"));
ok("matches are masked, so a finding is not a second copy of the secret",
  hits.every((h) => h.samples.every((s) => s.includes("•"))));
ok("a private key block is found", sp.scanSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIE").some((h) => h.name === "Private key block"));
ok("clean text yields nothing — and the tool says that is not a clean bill of health",
  sp.scanSecrets("just some ordinary prose").length === 0);
const tool = sp.toolById("secrets")!;
const scanResult = tool.run({ ...Object.fromEntries(tool.fields.map((f) => [f.key, f.def])) });
ok("the scan result states what it cannot find",
  (scanResult.lines ?? []).some((l) => l.includes("does NOT find")), "the limits must be printed, not implied");

const jwt = sp.jwtInspect("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhY2N0XzlmMiIsImF1ZCI6ImFwaS5leGFtcGxlLmNvbSIsImV4cCI6MTc5MDAwMDAwMH0.sig", "2026-09-22");
ok("a JWT decodes to its claims", jwt.ok && jwt.payload?.sub === "acct_9f2", JSON.stringify(jwt.payload));
ok("the algorithm is reported", jwt.algorithm === "HS256");
ok("and the tool states plainly that nothing was verified",
  jwt.lines.some((l) => l.includes("NOT verified")), jwt.lines.join(" | ").slice(0, 90));
const none = sp.jwtInspect("eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.", "2026-09-22");
ok("alg=none is called out as unsigned authority", none.algorithm === "none" && none.lines.some((l) => l.includes("NO signature")));
ok("a token with no exp is a finding", none.lines.some((l) => l.includes("never expires")));
ok("a malformed token is refused", !sp.jwtInspect("not.a.jwt", "2026-09-22").ok);

const csp = sp.cspAudit("default-src 'self'; script-src 'self' 'unsafe-inline'; img-src *", false);
ok("unsafe-inline without a nonce is a high finding",
  csp.findings.some((f) => f.severity === "high" && f.finding.includes("unsafe-inline")));
ok("a wildcard source is a high finding", csp.findings.some((f) => f.directive === "*"));
ok("a missing base-uri is flagged", csp.findings.some((f) => f.directive === "base-uri"));
ok("a policy with a nonce is not flagged for inline",
  !sp.cspAudit("default-src 'self'; script-src 'self' 'unsafe-inline' 'nonce-abc'", true).findings.some((f) => f.finding.includes("unsafe-inline")));

// ─────────────────────────────────────────────────────────────────────────────
section("7. reliability — budgets, runways, severity, deploy risk");

const budget = sp.sloErrorBudget(99.9, 30, 35);
ok("a 99.9% SLO over 30 days allows 43.2 minutes", Math.abs(budget.allowedDownMinutes - 43.2) < 1e-9,
  budget.allowedDownMinutes.toFixed(3));
ok("the remaining budget is the arithmetic remainder", Math.abs(budget.remainingMinutes - 28.08) < 1e-9,
  budget.remainingMinutes.toFixed(3));
ok("a spent budget is stated as breached", sp.sloErrorBudget(99.9, 30, 120).state.includes("exhausted"));
ok("a 99% SLO is far more permissive than 99.9%",
  Math.abs(sp.sloErrorBudget(99, 30, 0).allowedDownMinutes - 432) < 1e-9);

const runway = sp.capacityHeadroom(42, 6, 80, 24);
ok("compound growth crosses an 80% ceiling in month 12", runway.breachMonth === 12, String(runway.breachMonth));
ok("flat growth never breaches", sp.capacityHeadroom(42, 0, 80, 24).breachMonth === null);

ok("a 12% user impact with a workaround is S3", sp.incidentSeverity(12, 1, false, true).severity === "S3");
ok("the same impact without a workaround is S2", sp.incidentSeverity(12, 1, false, false).severity === "S2");
ok("data loss is always S1", sp.incidentSeverity(1, 0, true, true).severity === "S1");
ok("trivial impact is S4", sp.incidentSeverity(0.5, 0, false, true).severity === "S4");
ok("the rules are printed with the verdict", sp.incidentSeverity(1, 0, true, true).rules.length === 4);

const risk = sp.deployRisk(23, false, true, true, false, true);
ok("a clean deploy with a wide diff and peak timing scores 18", risk.score === 18, String(risk.score));
ok("a failing test suite alone outweighs everything else",
  sp.deployRisk(5, false, false, true, true, true).score === 30);
ok("a fully addressed deploy scores zero", sp.deployRisk(3, false, true, true, true, true).score === 0);
ok("the score comes with the factors that produced it", risk.factors.length === 6 && risk.recommendation.length > 20);

// ─────────────────────────────────────────────────────────────────────────────
section("8. docs — readability against the published formulas");

ok("syllables are estimated by vowel groups", sp.syllables("steward") === 2 && sp.syllables("the") === 1);
const prose = sp.readability("The cat sat on the mat. The dog ran fast. A bird flew away.");
ok("Flesch-Kincaid is finite and low on simple prose", prose.fleschKincaidGrade < 4, String(prose.fleschKincaidGrade));
ok("the sentence count is right", prose.sentences === 3, String(prose.sentences));
ok("code blocks are excluded from the prose measure",
  sp.readability("Short words here.\n```\ncomplicated_identifier.with.many.parts()\n```").avgWordSyllables < 2);
const long = sp.readability(`${"magnificent extraordinary implementation ".repeat(20)}.`);
ok("dense prose scores a higher grade", long.fleschKincaidGrade > 12, String(long.fleschKincaidGrade));
ok("reading time is words over the rate",
  Math.abs(sp.readingTime("word ".repeat(400), 200).minutes - 2) < 0.01);
ok("code lines are counted separately", sp.readingTime("text\n```\na\nb\nc\n```").codeLines === 3);

const headings = sp.headingLint("# Title\n\n### Skipped\n\n# Second title");
ok("a skipped heading level is caught", headings.issues.some((i) => i.issue.includes("jumps from h1 to h3")));
ok("two h1 headings are caught", headings.issues.some((i) => i.issue.includes("h1 headings")));
ok("duplicate headings are caught",
  sp.headingLint("# A\n\n## Same\n\n## Same").issues.some((i) => i.issue.includes("duplicate")));
ok("a clean document reports nothing", sp.headingLint("# A\n\n## B\n\n### C").issues.length === 0);

const drift = sp.terminologyDrift("The Kubernetes cluster is live. Developers use the Kubernetes API. Another kubernetes note. One more kubernetes mention.");
ok("casing drift on a repeated term is caught", drift.some((d) => d.term === "kubernetes"));
ok("hyphenation variants are caught when both forms appear",
  sp.terminologyDrift("Send an e-mail. Then send email. Another e-mail follows.").some((d) => d.term === "email"));
ok("consistent text reports nothing", sp.terminologyDrift("The email was sent. The email arrived.").length === 0);

// ─────────────────────────────────────────────────────────────────────────────
section("9. growth — the ratios a business is run on");

const econ = sp.unitEconomics(1200, 78, 9000, 1.8);
ok("lifetime value is margin over churn", Math.abs(econ.ltv - 52000) < 1, econ.ltv.toFixed(2));
ok("the ratio is computed against acquisition cost", Math.abs(econ.ltvCac - 5.777) < 0.01, econ.ltvCac.toFixed(3));
ok("payback is acquisition cost over monthly margin", Math.abs(econ.paybackMonths - 9.615) < 0.01, econ.paybackMonths.toFixed(3));
ok("zero churn is called out as a modelling artefact",
  sp.unitEconomics(1000, 80, 5000, 0).caveats.some((c) => c.includes("infinite")));
ok("negative economics are stated as such",
  sp.unitEconomics(100, 50, 9000, 5).verdict.includes("Negative unit economics"));

const f = sp.funnel([12000, 2400, 900, 260, 180], ["a", "b", "c", "d", "e"]);
ok("end-to-end conversion is top over bottom", Math.abs(f.overall - 1.5) < 1e-9, f.overall.toFixed(4));
ok("the worst step is the one with the lowest carry-through", f.worst?.stage === "b", String(f.worst?.stage));
ok("stage-to-stage conversion is exact", Math.abs(f.steps[1]!.fromPrevious - 20) < 1e-9);

ok("RICE is reach × impact × confidence ÷ effort",
  Math.abs(sp.riceScore(800, 2, 80, 6) - 213.333) < 0.01, sp.riceScore(800, 2, 80, 6).toFixed(3));
ok("zero effort cannot divide", sp.riceScore(100, 1, 100, 0) === 0);

const model = sp.growthModel(40000, 12, 24, 1.5);
ok("the trajectory is computed month by month", model.rows.length === 25);
ok("net growth is growth minus churn", model.exitMrr > 40000 * Math.pow(1.105, 24) && model.exitMrr < 40000 * Math.pow(1.106, 24),
  model.exitMrr.toFixed(0));
ok("exit ARR is twelve times exit MRR", Math.abs(model.exitArr - model.exitMrr * 12) < 1e-6);

// ─────────────────────────────────────────────────────────────────────────────
section("10. the roster holds itself to its own claims");

const status = sp.specialistStatus();
// 19.7.15: two hundred specialists joined the roster — sixteen new domains carrying eleven
// each, and the original eight deepened by three. The count is pinned so a silent loss is a
// failure rather than a smaller number nobody notices.
ok("the generalist pack ships two hundred and fifty-one specialists", status.total === 251, String(status.total));
ok("across twenty-five domains", status.domains === 25, String(status.domains));
ok("every domain carries at least eight specialists",
  sp.DOMAINS.every((d) => sp.specialistsByDomain(d.id).length >= 8),
  sp.DOMAINS.map((d) => `${d.id}:${sp.specialistsByDomain(d.id).length}`).join(" "));
ok("an id is unique per specialist", new Set(sp.SPECIALISTS.map((s) => s.id)).size === status.total);
ok("every specialist declares a purpose and a receipt",
  sp.SPECIALISTS.every((s) => s.purpose.length > 40 && s.receipt.length > 20));

/* The anti-lying check, carried over from the finance pack: an engine a specialist names must
   be a function the pack actually exports. "workflow" specialists name engines too — their
   steps are engine-backed — so the same rule applies to every row. */
const exported = new Set(Object.keys(sp));
const allowed = new Set(["all"]);            // a phrase, not a symbol
const missing: string[] = [];
for (const s of sp.SPECIALISTS) {
  for (const part of s.engine.split(/[+,]/)) {
    const lead = part.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    if (!lead) continue;
    if (!exported.has(lead[1]!) && !allowed.has(lead[1]!)) missing.push(`${s.id} → ${lead[1]}`);
  }
}
ok("every engine a specialist claims exists in the pack", missing.length === 0, missing.slice(0, 5).join(", "));

/* The gate. A read-only audit needs none; anything that touches production, a credential, a
   customer or money does. Pin that as an invariant over the ids, not as a headcount. */
const MUST_BE_GATED = /^(ops\.deploy-gate|ops\.change|ops\.postmortem-publish|dev\.migration|dev\.release-tag|sec\.rotation|sec\.key-ceremony|growth\.price|growth\.pricing-page|docs\.release|docs\.publish-runbook|api\.contract|api\.version-retire|fe\.a11y|fe\.release|data\.publish-dataset|mobile\.release|mobile\.push-send|cloud\.autoscale-apply|cloud\.rotation-run|cloud\.budget-commit|db\.migration-apply|db\.partition-plan|embedded\.firmware-release|embedded\.key-provision|ml\.model-promote|ml\.training-run|research\.ethics-submit|research\.preprint-post|media\.rendition-publish|media\.rights-clearance|finops\.budget-commit|finops\.showback-invoice|legal\.filing-submit|legal\.regulatory-filing|legal\.notice-serve|privacy\.dsar-respond|privacy\.consent-change|people\.offer-send|people\.comp-change|revenue\.quote-issue|revenue\.discount-approve|marketing\.campaign-launch|marketing\.spend-commit|locale\.locale-release|locale\.glossary-commit|supply\.po-issue|supply\.supplier-commit|web3\.tx-sign|web3\.key-ceremony|health\.discharge-plan|health\.protocol-publish)/;
const gatedIds = sp.SPECIALISTS.filter((s) => s.requiresApproval).map((s) => s.id);
const ungatedDestructive = sp.SPECIALISTS.filter((s) => MUST_BE_GATED.test(s.id) && !s.requiresApproval).map((s) => s.id);
ok("specialists that change production, spend money or touch customers are gated",
  ungatedDestructive.length === 0, ungatedDestructive.join(", "));
ok("and the gate is a real set, not a single token", gatedIds.length === 49 && gatedIds.length < status.total / 2,
  `${gatedIds.length} gated of ${status.total}`);
// Every specialist GATED by this release is a workflow, because each one's last step changes
// something real. The original pack also gates a few engine tools (a measurement whose next
// step acts), which is a different and legitimate shape — the distinction is pinned, not blurred.
const NEW_DOMAINS = /^(mobile|cloud|db|embedded|ml|research|media|finops|legal|privacy|people|revenue|marketing|locale|supply|web3|health)\./;
ok("every specialist this release gated is a workflow that changes something",
  sp.SPECIALISTS.filter((s) => s.requiresApproval && NEW_DOMAINS.test(s.id)).every((s) => s.status === "workflow"),
  sp.SPECIALISTS.filter((s) => s.requiresApproval && NEW_DOMAINS.test(s.id) && s.status !== "workflow").map((s) => s.id).join(", "));
ok("and no domain is mostly gates — in every one, the ungated specialists outnumber the gated",
  sp.DOMAINS.every((d) => {
    const list = sp.specialistsByDomain(d.id);
    return list.filter((s) => !s.requiresApproval).length > list.filter((s) => s.requiresApproval).length;
  }),
  sp.DOMAINS.map((d) => {
    const list = sp.specialistsByDomain(d.id);
    return `${d.id}:${list.filter((s) => !s.requiresApproval).length}/${list.filter((s) => s.requiresApproval).length}`;
  }).join(" "));
ok("a read-only audit is NOT gated, because a gate that always fires is noise",
  sp.SPECIALISTS.filter((s) => /(audit|sweep|inspect|read|check|watch|scan)/i.test(s.id)).every((s) => !s.requiresApproval),
  sp.SPECIALISTS.filter((s) => /(audit|sweep|inspect|read|check|watch|scan)/i.test(s.id) && s.requiresApproval).map((s) => s.id).join(", "));
ok("every domain has at least four specialists",
  sp.DOMAINS.every((d) => sp.specialistsByDomain(d.id).length >= 4),
  sp.DOMAINS.map((d) => `${d.id}:${sp.specialistsByDomain(d.id).length}`).join(" "));
ok("findSpecialist resolves an id", sp.findSpecialist("ops.deploy-gate")?.requiresApproval === true);

/* ── 11 · the sixteen new domains (19.7.15) ────────────────────────────────────
   Every engine added by the Cartographer release gets a pinned vector here: a number the
   published rule or formula fixes, computed by hand, so a refactor that quietly changes an
   answer fails the gate instead of shipping a different number to a user. */

/* Every figure below is produced the way the surface produces it: through the registry, with
   the tool's own declared defaults — not by calling an engine with an empty form. */
const drive = (id: string) => {
  const t = sp.toolById(id);
  if (!t) throw new Error(`no such tool: ${id}`);
  const defaults: Record<string, string | boolean> = {};
  for (const f of t.fields) defaults[f.key] = f.def;
  return t.run(defaults);
};

section("11. the new domains — mobile, cloud, database, embedded");
const targets = drive("touch-targets");
ok("a 32×32 control is under the 44pt floor and a 44×44 one is not",
  targets.table!.rows.filter((r) => r[4] === "meets the floor").length === 1, JSON.stringify(targets.kpis));
ok("an undersized-but-spaced target is reported as passing only by the spacing exception",
  targets.table!.rows.some((r) => /spacing exception/.test(r[4]!)));
ok("the smallest target is named", targets.table!.rows.some((r) => r[1] === "32×32"));

const size = drive("app-size-budget");
ok("2.52 MB per release crosses a 60 MB budget at release eight", /release 8/.test(size.headline), size.headline);
ok("compounded at 6% the same budget lasts 6.1 releases",
  size.kpis!.some((k) => k.label === "releases if it compounds" && k.value === "6.1"), JSON.stringify(size.kpis));

const inst = drive("instance-sizing");
ok("72% p95 against a 60% ceiling needs eight instances, not six",
  inst.kpis!.some((k) => k.label === "instances needed" && k.value === "8"), JSON.stringify(inst.kpis));
ok("and lands the fleet at 54% at the same load", inst.kpis!.some((k) => k.value === "54.0%"));

const egress = drive("egress-cost");
ok("an 85% hit rate turns a 360 bill into 122 — 238 saved",
  egress.kpis!.some((k) => k.label === "with the cache" && k.value === "122") &&
  egress.kpis!.some((k) => k.label === "saved / month" && k.value === "238"), JSON.stringify(egress.kpis));

const idx = drive("index-selectivity");
ok("a predicate matching 0.01% of a table should use the index", idx.ok === true, idx.headline);
ok("and the rows-per-key figure is 333", idx.kpis!.some((k) => k.value === "333"));

const pool = drive("pool-sizing");
ok("300 rps at 18 ms is 5.4 queries in flight", pool.kpis!.some((k) => k.value === "5.4"), JSON.stringify(pool.kpis));
ok("which is a pool of three per instance across three instances", pool.kpis!.some((k) => k.label === "pool per instance" && k.value === "3"));

const power = drive("power-budget");
ok("2000 mAh at a 4% duty of 45 mA with 20 µA sleep lasts about 1099 hours",
  Math.abs(Number(power.kpis!.find((k) => k.label === "hours")!.value) - 1099.4) < 0.5, JSON.stringify(power.kpis));

const sched = drive("timing-slack");
ok("Liu & Layland on 2/20, 5/50, 12/200 gives U = 0.26",
  sched.kpis!.some((k) => k.label === "utilisation" && k.value === "26.0%"), JSON.stringify(sched.kpis));
ok("against a three-task bound of 0.780", sched.kpis!.some((k) => k.label === "RM bound" && k.value === "78.0%"));
ok("so the task set passes the sufficient test", sched.ok === true);

section("12. the new domains — ml, research, media, finops");
const ev = drive("eval-interval");
const evLo = Number(ev.kpis!.find((k) => k.label.startsWith("95%"))!.value.split("–")[0]!.replace("%", ""));
const evHi = Number(ev.kpis!.find((k) => k.label.startsWith("95%"))!.value.split("–")[1]!.replace("%", ""));
ok("431/500 is 86.2%, and the Wilson interval is about 82.9–88.9%",
  Math.abs(evLo - 82.9) < 0.4 && Math.abs(evHi - 88.9) < 0.4, `${evLo}–${evHi}`);
ok("the interval clears an 80% baseline, so the result is not sampling noise", ev.ok === true);

const split = drive("split-audit");
ok("an 80/10/10 split of 50,000 rows with no duplicates is clean",
  split.ok === true && split.kpis!.some((k) => k.value === "5,000"), JSON.stringify(split.kpis));

const cite = drive("citation-lint");
ok("the draft cites two claims and leaves one numeric line uncited",
  cite.kpis!.some((k) => k.label === "citations" && k.value === "2") &&
  cite.kpis!.some((k) => k.label === "uncited numeric lines" && k.value === "1"), JSON.stringify(cite.kpis));

const kap = drive("rater-agreement");
ok("seven of eight labels agree — Po = 0.875",
  kap.kpis!.some((k) => k.label === "observed agreement" && k.value === "87.5%"), JSON.stringify(kap.kpis));
ok("and Cohen's κ is 0.805 once chance is removed",
  Math.abs(Number(kap.kpis!.find((k) => k.label === "Cohen's κ")!.value) - 0.805) < 0.003, JSON.stringify(kap.kpis));

const loud = drive("loudness-gain");
ok("−9.4 LUFS to a −14 target is a 4.6 dB cut, peak still under the ceiling",
  loud.kpis!.some((k) => k.value === "-4.6 dB") && loud.ok === true, JSON.stringify(loud.kpis));

const bits = drive("bitrate-budget");
ok("a 42-minute piece at 2000 kbps + 128 kbps audio is 670 MB, the only rung inside 800",
  bits.kpis!.some((k) => k.value === "2000"), JSON.stringify(bits.kpis));

const fc = drive("spend-forecast");
ok("the six-month spend series trends up by about 1136 a month",
  Math.abs(Number(fc.kpis!.find((k) => k.label === "trend / month")!.value) - 1135.7) < 1.5, JSON.stringify(fc.kpis));
ok("and the projection for month nine is about 26,938",
  Math.abs(Number(fc.kpis!.find((k) => k.label.startsWith("month 9"))!.value) - 26938) < 6, JSON.stringify(fc.kpis));

const anom = drive("anomaly-z");
ok("one day out of twelve is flagged at 3σ — the 24,000 day",
  anom.kpis!.some((k) => k.label === "≥ 3σ" && k.value === "1") && !anom.ok, JSON.stringify(anom.kpis));
ok("and it names day six", anom.table!.rows.some((r) => r[0] === "6"));

section("13. the new domains — legal, privacy, people, revenue");
const clause = drive("clause-lint");
ok("the sample clause carries five undefined terms", clause.kpis!.some((k) => k.value === "5"), JSON.stringify(clause.kpis));
ok("and the most frequent one is named in the lines",
  clause.lines!.join(" ").includes("reasonable efforts"), clause.lines!.join(" "));

const dates = drive("date-terms");
ok("effective 1 Apr 2026 + 12 months ends 1 Apr 2027",
  dates.kpis!.some((k) => k.value === "2027-04-01"), JSON.stringify(dates.kpis));
ok("with 90 days' notice the last day to serve it is 1 Jan 2027",
  dates.kpis!.some((k) => k.value === "2027-01-01"), JSON.stringify(dates.kpis));

const pii = drive("pii-scan");
ok("personal-data patterns are found, and every sample in the table is masked",
  pii.table!.rows.every((r) => r[3]!.includes("•")) && !pii.table!.rows.some((r) => /@|\d{4} \d{4} \d{4} \d{4}/.test(r[3]!)),
  JSON.stringify(pii.table!.rows.map((r) => r[3])));
ok("a card-shaped number is only counted when Luhn passes",
  pii.table!.rows.some((r) => r[0] === "card-shaped number" && r[1] === "1"), JSON.stringify(pii.table!.rows));

const ret = drive("retention-clock");
ok("two of the four categories are past their retention date", ret.kpis!.some((k) => k.value === "2"), JSON.stringify(ret.kpis));
ok("and the overdue ones are at the top of the table", ret.table!.rows[0]![4]!.startsWith("-"), JSON.stringify(ret.table!.rows[0]));

const hc = drive("headcount-model");
ok("40 people, 3 hires a month and 1.5% attrition ends at 66.5 after a year",
  Math.abs(Number(hc.kpis!.find((k) => k.label === "month 12")!.value) - 66.5) < 0.2, JSON.stringify(hc.kpis));

const band = drive("comp-band");
ok("2.52 against a 1.8–3.2 band is 51.4% of the way up",
  band.kpis!.some((k) => k.value === "51.4%"), JSON.stringify(band.kpis));
ok("and a compa-ratio of 105.0", band.kpis!.some((k) => k.value === "105.0"));

const pipe = drive("pipeline-coverage");
ok("a 12,000,000 quota against 9,790,000 weighted is 0.82× coverage",
  pipe.kpis!.some((k) => k.value === "0.82×"), JSON.stringify(pipe.kpis));
ok("which is under the 3.5× convention, so the tool says so", pipe.ok === false);

const sla = drive("sla-clock");
ok("two of four tickets miss their first-response target", sla.kpis!.some((k) => k.value === "2"), JSON.stringify(sla.kpis));
ok("at 50% attainment", sla.kpis!.some((k) => k.value === "50.0%"));

section("14. the new domains — marketing, localisation, supply chain, web3");
const meta = drive("meta-lint");
ok("the sample title fits the 60-character display limit",
  meta.kpis!.some((k) => k.label === "title" && k.value.startsWith("52/")), JSON.stringify(meta.kpis));
ok("and two filler words in the slug are flagged", meta.kpis!.some((k) => k.label === "filler words" && k.value === "2"));

const crawl = drive("crawl-budget");
ok("250,000 pages at 320 ms against a 5 req/s limit is under a day",
  crawl.ok === true && /0\.2 days/.test(crawl.headline), crawl.headline);

const cov = drive("locale-coverage");
ok("two of four locales clear the 98% bar", cov.table!.rows.filter((r) => r[4] === "shippable").length === 2, JSON.stringify(cov.table!.rows));
ok("and the worst locale is named as Tamil", /Tamil|ta-IN/.test(cov.headline), cov.headline);

const expn = drive("string-expansion");
ok("17 English characters become 21–23 in German",
  expn.kpis!.some((k) => k.value === "21–23"), JSON.stringify(expn.kpis));
ok("which overflows an 18-character budget, so the tool refuses to call it fine", expn.ok === false);

const eoqRes = drive("eoq");
ok("EOQ for 24,000 units at 450 an order and 12 held is 1,342 units",
  eoqRes.kpis!.some((k) => k.value === "1342"), JSON.stringify(eoqRes.kpis));
ok("meaning 17.9 orders a year", eoqRes.kpis!.some((k) => k.value === "17.9"));

const ss = drive("safety-stock");
ok("a 95% service level on 42 units of daily spread over 9 days holds 207 units",
  ss.kpis!.some((k) => k.value === "207"), JSON.stringify(ss.kpis));
ok("putting the reorder point at 1,827", ss.kpis!.some((k) => k.value === "1827"));

const gas = drive("gas-plan");
ok("145,000 gas at 19.5 gwei with ETH at 3,200 is 9.05 a call",
  gas.kpis!.some((k) => k.value === "9.05"), JSON.stringify(gas.kpis));
ok("and 2,262 for the batch of 250, which the tool flags", gas.ok === false);

const dec = drive("token-decimals");
ok("1.234567890123456789 tokens is exactly its base-unit integer",
  dec.headline.includes("1.234567890123456789") && dec.ok === true, dec.headline);
ok("and 1.5 tokens at 18 decimals is 1500000000000000000 base units",
  dec.lines!.join(" ").includes("1500000000000000000"), dec.lines!.join(" "));

section("15. healthcare — NEWS2 and occupancy, never a diagnosis");
const news = drive("news2");
ok("NEWS2 defaults score 7 — high band, labelled not a diagnosis",
  news.kpis!.some((k) => k.label === "NEWS2 total" && k.value === "7") && /not a diagnosis/.test(news.headline),
  news.headline);
ok("and the band is high", news.kpis!.some((k) => k.label === "band" && k.value === "high"), JSON.stringify(news.kpis));
const occ = drive("bed-occupancy");
ok("28 of 32 beds is 87.5% occupancy", occ.kpis!.some((k) => k.value === "87.5%"), JSON.stringify(occ.kpis));
ok("Little's law implies 4.67 days length of stay at 6 arrivals",
  occ.kpis!.some((k) => k.label === "implied LOS (days)" && k.value === "4.67"), JSON.stringify(occ.kpis));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f2 of failures) console.log(`  - ${f2}`); }
process.exit(failed > 0 ? 1 : 0);
