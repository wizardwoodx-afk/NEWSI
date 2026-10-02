/**
 * probe/securityReview.test.ts — the signed security-review artifact (16.9.5).
 *
 * 16.6.0 honestly named the signed audit report a PLANNED deliverable. This
 * probe pins the shipped artifact: it is a SELF-ASSESSMENT whose every claim
 * carries a machine-checkable evidence pointer, whose limitations are stated
 * in words, whose digest is canonical (tamper-evident), and whose signature
 * rides the SAME receipt issuer keychain — with the unsigned path honest.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildSecurityReview, verifySecurityReview, digestOf, securityScope, securityFindings } from "../src/mission/securityReview";

declare const SI_ROOT: string;
const root = SI_ROOT ?? process.cwd();

test("securityReview — the artifact is real, signed and honest about its limits", async () => {
  // 1. the scope is real and evidenced
  const scope = securityScope();
  assert.ok(scope.length >= 5, `scope inventory too thin: ${scope.length}`);
  for (const s of scope) {
    assert.ok(s.surface.length > 10 && s.posture.length > 20, `surface lacks posture: ${s.surface}`);
    assert.ok(/probe|gate|verifier|ledger|README/i.test(s.evidence), `surface lacks machine-checkable evidence: ${s.surface}`);
  }

  // 2. the limitations are stated, not hidden
  const { findings, refusals } = securityFindings();
  assert.ok(findings.some((f) => /no external penetration test/i.test(f)), "must admit: no external pen test");
  assert.ok(findings.some((f) => /single-host/i.test(f)), "must state the threat-model scope");
  assert.ok(refusals.length >= 3, "must refuse overclaiming");
  assert.ok(refusals.some((r) => /does NOT claim/i.test(r)), "refusals must be explicit");

  // 17.6.2 — the external-validation surfaces are inventoried, not implied
  const names = scope.map((x) => x.surface.toLowerCase());
  assert.ok(names.some((n) => n.includes("cross-selfimpulse")), "cross-selfimpulse anchoring is a named surface");
  assert.ok(names.some((n) => n.includes("grant authority")), "grant-authority delegation is a named surface");
  assert.ok(names.some((n) => n.includes("external-agent")), "the interop CLI boundary is a named surface");
  assert.ok(findings.some((f) => /replay protection is per-selfimpulse/i.test(f)), "replay limits are stated honestly");

  // 3. build → digest stable + canonical (digest covers the body only)
  const a = await buildSecurityReview();
  assert.equal(a.format, "si-security-review/1");
  assert.equal(a.digest.length, 64, "sha256 hex");
  // the auditor recomputes the CANONICAL body (deep key-sort, like the engine)
  const sortDeep = (v: unknown): unknown => Array.isArray(v) ? v.map(sortDeep) : v && typeof v === "object" ? Object.keys(v as object).sort().reduce<Record<string, unknown>>((acc, k) => { acc[k] = sortDeep((v as Record<string, unknown>)[k]); return acc; }, {}) : v;
  const canon = (o: object) => JSON.stringify(sortDeep(o));
  const bodyKey = canon({ format: a.format, issuedAt: a.issuedAt, product: a.product, scope: a.scope, findings: a.findings, refusals: a.refusals });
  assert.equal(await digestOf(bodyKey), a.digest, "digest covers exactly the canonical body");
  const b = await buildSecurityReview();
  b.issuedAt = a.issuedAt; // wall-clock differs; content digest must not
  const bodyB = canon({ format: b.format, issuedAt: b.issuedAt, product: b.product, scope: b.scope, findings: b.findings, refusals: b.refusals });
  assert.equal(await digestOf(bodyB), a.digest, "same content → same digest (no wall-clock in the digest)");

  // 4. tamper evidence: flip one finding → digest mismatch detected
  const forged: typeof a = { ...a, findings: [...a.findings, "tampered"] };
  const vForged = await verifySecurityReview(forged);
  assert.equal(vForged.ok, false, "a modified artifact must fail verification");
  assert.ok(vForged.reasons.some((r) => /digest mismatch/i.test(r)), "the reason is stated");

  // 5. the honest verification result: signed (key present) or UNSIGNED-stated (no key) — never a fake signature
  const v = await verifySecurityReview(a);
  if (a.signature) {
    assert.ok(v.ok, `signed artifact verifies: ${v.reasons.join("; ")}`);
    assert.ok(a.signature.alg === "EdDSA" && a.signature.sigHex.length === 128, "Ed25519 signature shape");
  } else {
    assert.ok(v.reasons.some((r) => /UNSIGNED/i.test(r)), "the unsigned path is stated in words");
  }

  // 6. the artifact is reachable from the Audit door (the composition is wired)
  // 19.7.12 (UI): this page was unmounted dead code since 19.6.6 and is now deleted; pin the seam it wrapped.
  const mod = fs.readFileSync(path.join(root, "src", "mission", "securityReview.ts"), "utf8");
  assert.ok(mod.includes("export async function buildSecurityReview"), "the artifact builder is exported at the seam");
  assert.ok(mod.includes('"si-security-review/1"'), "the seam names the wire format");
  assert.ok(!fs.existsSync(path.join(root, "src", "pages", "AuditPage.tsx")), "the retired Audit page is gone (19.7.12 UI)");
});
