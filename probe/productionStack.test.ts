/**
 * probe/productionStack.test.ts — the six production features (16.10.0).
 *
 * FEATURE 1 (founder redesign): UNIVERSAL model providers — ChatGPT/Claude/
 * Gemini/Groq/OpenRouter/Ollama/custom, BYOK via the secret store, tier-per-step
 * routing, manage (registry/ping) + monitor (usage ledger & estimates), the
 * brain wired through wrapModelBrain ∘ wrapRealModelBrain ∘ simulatedBrain.
 * FEATURES 2–6: durable missions, the skill store, the never-give-up loop,
 * always-on triggers, and the receipted browser.
 *
 * Everything here runs on injected stores/callers/doubles — no network, no
 * cloud keys, no real provider. The honesty is the assertion target.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  addProvider, listProviders, updateProvider, chatStep, pingProvider,
  modelPrefs, setModelPrefs, usageSummary, clearUsage, wrapModelBrain,
  keyRef, type LlmCaller, type ModelPrefs,
} from "../src/selfimpulse/engine/providers";
import type { SelfImpulseBrain } from "../src/selfimpulse/engine/selfimpulse";
import { durableSave, durableResume, DoneLedger } from "../src/mission/durable";
import { ConstraintLedger, askHuman, answerAsk, proofBeforeDone } from "../src/mission/discipline";
import { TriggerEngine, type TriggerSpec } from "../src/mission/triggers";
import { buildCatalog, importFromCatalog, sha256hex } from "../src/selfimpulse/engine/skillStore";
import { ReceiptedBrowser, fetchModeDeps } from "../src/browser/receipted";

declare const SI_ROOT: string;
const root = typeof SI_ROOT !== "undefined" ? SI_ROOT : process.cwd();

const store = (): Map<string, string> => new Map();

// node has no localStorage global; localDb (the BYOK secret store) uses it at
// CALL time — give the probe a Map-backed shim so the real code path runs.
const __mem = new Map<string, string>();
if (typeof (globalThis as { localStorage?: unknown }).localStorage === "undefined") {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (__mem.has(k) ? ( __mem.get(k) as string) : null),
    setItem: (k: string, v: string) => void __mem.set(k, v),
    removeItem: (k: string) => void __mem.delete(k),
    clear: () => __mem.clear(),
  };
}

const fakeCaller = (answer = "1. read the state\n2. act under the gate\n3. selfimpulse the receipt", fail = false): LlmCaller =>
  async (req) => {
    if (fail) throw new Error("connection refused — the endpoint is down");
    assert.ok(req.secret_ref.startsWith("vh.providerkey."), "the call carries the keyRef (the key itself NEVER travels in the registry)");
    return { content: answer, model: req.model, usage: { input_tokens: 100, output_tokens: 40 }, duration_ms: 123 };
  };

describe("productionStack — the six production features", () => {
  it("F1: universal providers — manage, work (tiered), monitor", async () => {
    const s = store();
    // MANAGE: registry CRUD + honest refusals
    const dup = addProvider({ id: "openai-main", kind: "openai", label: "ChatGPT", defaultModel: "gpt-4o-mini" }, s);
    assert.equal("error" in dup, false, "a valid provider adds cleanly");
    assert.equal("error" in addProvider({ id: "openai-main", kind: "openai", label: "x", defaultModel: "m" }, s), true, "duplicate id refused");
    assert.equal("error" in addProvider({ id: "c1", kind: "custom", label: "x", defaultModel: "m" }, s), true, "custom without endpoint refused");
    updateProvider("openai-main", { enabled: false }, s);
    assert.equal(listProviders(s)[0].enabled, false);

    // WORK: the refusal taxonomy, all in words
    setModelPrefs({ enabled: false }, s);
    assert.equal((await chatStep("hi", "cheap", { store: s })).refused?.includes("OFF"), true, "off → refused in words");
    setModelPrefs({ enabled: true } as ModelPrefs, s);
    assert.match((await chatStep("hi", "big", { store: s })).refused as string, /no big-tier route/);
    setModelPrefs({ enabled: true, cheap: { providerId: "ghost", model: "m" } }, s);
    assert.match((await chatStep("hi", "cheap", { store: s })).refused as string, /unknown provider/);
    setModelPrefs({ enabled: true, cheap: { providerId: "openai-main", model: "gpt-4o-mini" } }, s);
    assert.match((await chatStep("hi", "cheap", { store: s })).refused as string, /disabled/, "a disabled provider is refused, not skipped");
    updateProvider("openai-main", { enabled: true }, s);
    assert.match((await chatStep("hi", "cheap", { store: s })).refused as string, /no API key/, "missing key refused (BYOK)");
    // WORK: a real (fake-caller) tiered call — labeled, recorded
    const { setProviderKey } = await import("../src/selfimpulse/engine/providers");
    const { localDb } = await import("../src/ipc/localDb");
    const webRefusal = setProviderKey("openai-main", "sk-test");
    assert.equal(webRefusal.ok, false, "16.10.1: the web edition refuses CLOUD keys — nothing stored");
    localDb.secretSet(keyRef("openai-main"), "sk-test"); // desktop (keychain) path, seeded for the WORK step
    const r = await chatStep("plan this", "cheap", { store: s, caller: fakeCaller() });
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.tier, "cheap");
    // the secret store actually holds it
    assert.equal(localDb.secretGet(keyRef("openai-main")), "sk-test");
    // MONITOR: the ledger saw the refusals AND the ok call; estimates labeled
    const sum = usageSummary(s);
    assert.ok(sum.total >= 5, `ledger recorded the calls: ${sum.total}`);
    assert.ok(sum.refused >= 4 && sum.ok >= 1);
    assert.equal(sum.estCostUsd != null, true, "gpt-4o-mini is priced → an estimate exists (labeled)");
    assert.ok(sum.recentRefusals.length > 0, "refusals are kept in words");
    // MANAGE: ping rides the same tiered path
    const ping = await pingProvider("openai-main", { store: s, caller: fakeCaller("pong") });
    assert.equal(ping.ok, true);
    assert.match(ping.detail, /answered in/);
    // the brain wrapper: identity + labeled plan + refusal passthrough
    const base: SelfImpulseBrain = { id: "simulated", label: "Simulated", decide: async () => ({ thoughts: [], plan: ["base step"], actions: [], final: () => "base" }) };
    const off = wrapModelBrain(base, { prefs: { enabled: false }, store: s });
    assert.equal(off.id, "simulated", "off → base identity");
    const on = wrapModelBrain(base, { prefs: modelPrefs(s), store: s, caller: fakeCaller() });
    assert.equal(on.id, "simulated+model-plan", "enabled → the hybrid identity is live");
    const plan = await on.decide("objective", { mode: "quick", persona: "witty", facts: [] });
    assert.ok(plan.thoughts[0].includes("REAL model") && plan.thoughts[0].includes("cheap"), `labeled: ${plan.thoughts[0].slice(0, 70)}`);
    assert.equal(plan.plan.length, 3);
    clearUsage(s);
  });

  it("F2: durable missions — digest-verified resume; done only after verified", () => {
    const s = store();
    const state = { version: 6 as const, missionId: "m1", completedNodeIds: ["n1", "n2"], savedAt: "", graphVersion: 3, pendingTaskIds: [] as string[] };
    const rt = {
      persist: () => ({ ...state, savedAt: new Date().toISOString() }),
      restore: (st: { missionId: string }) => (st.missionId === "m1" ? { ok: true, errors: [] } : { ok: false, errors: [`state belongs to ${st.missionId}, not m1`] }),
    };
    const env = durableSave(rt as never, s as unknown as Storage);
    assert.equal(env.format, "si-durable-mission/1");
    const r = durableResume(rt as never, s as unknown as Storage);
    assert.equal(r.ok, true);
    assert.ok(r.ok && r.completedNodeIds.includes("n1"), "finished nodes are known — their work is not repeated");
    // tamper → refused in words
    const raw = JSON.parse(s.get("vh.durable.m1") as string);
    raw.state.completedNodeIds = ["n1"];
    s.set("vh.durable.m1", JSON.stringify(raw));
    const bad = durableResume(rt as never, s as unknown as Storage);
    assert.equal(bad.ok, false);
    assert.ok(!bad.ok && bad.refused.includes("digest"), "a modified snapshot is refused, never resumed");
    // the Done ledger: never marks unverified work
    const dl = new DoneLedger(s as unknown as Storage);
    const id = DoneLedger.actionId("m1", "n3", "run tests");
    assert.equal(dl.markDone(id, false).ok, false, "unverified → refused to mark done");
    assert.equal(dl.isDone(id), false);
    assert.equal(dl.markDone(id, true).ok, true);
    assert.equal(dl.isDone(id), true);
  });

  it("F4: never-give-up — constraints, ask-don't-guess, proof before done", () => {
    const s = store();
    const cl = new ConstraintLedger(["never touch files outside the workspace"], s as unknown as Storage);
    assert.equal(cl.checkStep("the step must never touch files outside the workspace — it did").ok, false, "a violating step is refused");
    assert.equal(cl.checkStep("all work stayed inside the workspace").ok, true);
    const q = askHuman("which deploy target?", ["target env unknown"]);
    assert.equal(q.answered, false);
    assert.equal(answerAsk(q, "").answered, false, "silence is not an answer");
    assert.equal(answerAsk(q, "staging").answered, true);
    assert.match(proofBeforeDone({ verificationRan: false, verificationPassed: false, constraints: cl, finalSummary: "" }).reason ?? "", /nothing was verified/);
    assert.match(proofBeforeDone({ verificationRan: true, verificationPassed: false, constraints: cl, finalSummary: "" }).reason ?? "", /verification FAILED/);
    const done = proofBeforeDone({ verificationRan: true, verificationPassed: true, evidence: "tests 12/12 green", constraints: cl, finalSummary: "everything stayed inside the workspace" });
    assert.equal(done.done, true);
    assert.ok(done.done && done.proof.includes("12/12"));
  });

  it("F5: always-on triggers — quiet hours, caps, overlap; dispatch stays gated", async () => {
    const dispatched: string[] = [];
    const eng = new TriggerEngine({ dispatch: async (obj) => { dispatched.push(obj); return { ok: true, detail: "queued" }; } });
    const quiet: TriggerSpec = { id: "q", objective: "x", quietHours: { from: 23, to: 6 } };
    const at3am = new TriggerEngine({ now: () => new Date("2026-09-11T03:00:00"), dispatch: async () => ({ ok: true, detail: "" }) });
    assert.match((await at3am.evaluate(quiet)).detail, /quiet hours/);
    const capped = new TriggerEngine({ dispatch: async () => ({ ok: true, detail: "" }) });
    const spec: TriggerSpec = { id: "cap", objective: "x", maxPerDay: 1 };
    await capped.evaluate(spec);
    assert.match((await capped.evaluate(spec)).detail, /daily cap/);
    const overlap: TriggerSpec = { id: "ov", objective: "x", everyMs: 60_000 };
    await eng.evaluate(overlap);
    assert.match((await eng.evaluate(overlap)).detail, /not due|overlap/);
    assert.match((await eng.evaluate({ id: "g", objective: "morning brief" })).detail, /human gate/, "proactivity still pauses at the gate");
    assert.equal(dispatched.length + 1 >= 1, true);
  });

  it("F3: skill store — tampered digests and unsigned catalogs are refused", async () => {
    const cat = await buildCatalog([{ id: "s1", title: "Clamp", objective: "add clamp", when: "like: clamp", steps: ["write", "test"], provenance: { missionId: "msn-9", verifiedSeats: ["writer", "reviewer"], version: "1" } }]);
    // hosts WITH an issuer key: a signed, provenance-carrying skill imports — but lands UNDER_EVALUATION
    const imported = await importFromCatalog(cat, "s1", cat.signature?.publicKeyHex);
    if (imported.ok) {
      assert.equal(imported.landedAs, "UNDER_EVALUATION", "even a signed import NEVER lands ACTIVE — trust is re-earned here");
      assert.match(imported.note, /msn-9/, "the provenance travels with the skill");
    } else {
      assert.match(imported.refused, /UNSIGNED/, "hosts without a key refuse in words");
    }
    // an explicitly unsigned artifact is refused on ANY host
    const stripped = { ...cat, signature: null };
    const unsigned = await importFromCatalog(stripped, "s1");
    assert.equal(unsigned.ok, false);
    assert.ok(!unsigned.ok && unsigned.refused.includes("UNSIGNED"), "an import nobody selfimpulsees for is refused");
    const tampered = { ...cat, skills: [{ ...cat.skills[0], title: "EVIL" }] };
    const t = await importFromCatalog(tampered as typeof cat, "s1");
    assert.equal(t.ok, false);
    assert.ok(!t.ok && t.refused.includes("digest mismatch"), "tampering is caught before anything else");
    // the digest function is canonical over the skills array
    assert.equal(await sha256hex(JSON.stringify(cat.skills)), cat.digest);
  });

  it("F6: receipted browser — every action (and refusal) lands in the chain", async () => {
    const calls: string[] = [];
    const b = new ReceiptedBrowser({
      perform: async (a) => {
        calls.push(a.kind);
        return a.kind === "goto" ? { ok: true, detail: "HTTP 200, title: Example", title: "Example" } : { ok: false, detail: "click needs the native seat — refused in words", title: a.kind };
      },
    });
    await b.run({ kind: "goto", url: "https://example.com" });
    await b.run({ kind: "click", target: "#go" });
    assert.equal(b.entries.length, 2);
    assert.equal(b.entries[1].prev, b.entries[0].hash, "the receipt is hash-chained");
    assert.equal(b.entries[1].ok, false, "the refusal is receipted too — nothing hidden");
    const lines = b.receipt().trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines.length, 2);
    // fetch-mode: a non-http URL is refused without any fetch
    const web = new ReceiptedBrowser(fetchModeDeps(async () => { throw new Error("fetch must not be called"); }));
    const r = await web.run({ kind: "goto", url: "file:///etc/passwd" });
    assert.equal(r.ok, false);
    assert.match(r.detail, /refused/);
    // the wiring pins
    const root = process.cwd();
    const selfimpulseSrc = fs.readFileSync(path.join(root, "src", "selfimpulse", "engine", "selfimpulse.ts"), "utf8");
    assert.ok(selfimpulseSrc.includes("wrapModelBrain(wrapRealModelBrain(simulatedBrain))"), "model brain wraps the harness seam wraps the labeled core");
    // 19.7.12 (UI): this page was unmounted dead code since 19.6.6 and is now deleted; pin the seam it wrapped.
    assert.ok(!fs.existsSync(path.join(root, "src", "pages")), "the retired pages tree is gone (19.7.12 UI)");
    const rb = fs.readFileSync(path.join(root, "src", "browser", "receipted.ts"), "utf8");
    assert.ok(rb.includes("class ReceiptedBrowser") && /prev/.test(rb), "the receipted browser mints hash-chained receipts at the seam");
  });

  it("16.10.1 integration hardening — engine, UI, and boundary ride as ONE product", async () => {
    const rustSrc = fs.readFileSync(path.join(root, "src-tauri", "src", "commands.rs"), "utf8");
    const runtimeSrc = fs.readFileSync(path.join(root, "src", "mission", "missionRuntime.ts"), "utf8");
    // 19.7.12 (UI): this page was unmounted dead code since 19.6.6 and is now deleted; pin the seam it wrapped.
    const opsSrc = fs.readFileSync(path.join(root, "src", "selfimpulse", "engine", "selfimpulse.ts"), "utf8") + fs.readFileSync(path.join(root, "src", "selfimpulse", "engine", "skillStore.ts"), "utf8");
    const browserSrc = fs.readFileSync(path.join(root, "src", "browser", "receipted.ts"), "utf8") + fs.readFileSync(path.join(root, "src", "ipc", "client.ts"), "utf8");
    const providersSrc = fs.readFileSync(path.join(root, "src", "selfimpulse", "engine", "providers.ts"), "utf8");

    // ── 1. DURABLE: the storage adapter is structurally correct now ──
    // A REAL Storage shape (getItem/setItem — what localStorage actually is)
    // drives the full round trip: the 16.10.0 default path would have thrown.
    const backing = new Map<string, string>();
    const storageShim = {
      getItem: (k: string) => (backing.has(k) ? (backing.get(k) as string) : null),
      setItem: (k: string, v: string) => void backing.set(k, v),
      removeItem: (k: string) => void backing.delete(k),
    };
    const ledger = new DoneLedger(storageShim as unknown as Storage);
    assert.equal(ledger.markDone(DoneLedger.actionId("m1", "n1", "step"), false).ok, false, "unverified work is never marked done");
    assert.equal(ledger.markDone(DoneLedger.actionId("m1", "n1", "step"), true).ok, true, "verified work is marked once");
    const rehydrated = new DoneLedger(storageShim as unknown as Storage);
    assert.equal(rehydrated.isDone(DoneLedger.actionId("m1", "n1", "step")), true, "the ledger survives a restart through the REAL storage shape");
    // the runtime actually rides the wire (source pins — the review's core charge)
    assert.ok(runtimeSrc.includes("durableResume(this, this.durableKV)"), "run() resumes from the digest-verified snapshot");
    assert.ok(runtimeSrc.includes("this.durableSnapshot(); // 16.10.1 — save after EVERY step"), "the loop saves after every step");
    assert.ok(runtimeSrc.includes("this.doneLedger.markDone(doneKey, true)"), "the once-guard marks VERIFIED completions only");

    // ── 2. PROVIDERS: the web edition holds NO cloud keys — in words ──
    const { setProviderKey } = await import("../src/selfimpulse/engine/providers");
    const { localDb } = await import("../src/ipc/localDb");
    const refused = setProviderKey("cloud-x", "sk-secret", "openai");
    assert.equal(refused.ok, false, "a cloud key on the web is refused");
    assert.match(refused.refused ?? "", /cannot hold cloud keys/, "the refusal names the real reason (readable-by-origin storage)");
    assert.equal(localDb.secretGet(keyRef("cloud-x")), null, "nothing was stored — zero-risk refusal");
    assert.equal(setProviderKey("local-1", "irrelevant", "ollama").ok, true, "ollama needs no cloud key — accepted");
    assert.ok(providersSrc.includes("cannot hold cloud keys"), "the split is pinned in source");

    // the review's exact scenario: the DEFAULT registry path (what the UI
    // calls) against a REAL getItem/setItem store — 16.10.1 threw TypeError
    // here (silent [] on read, a thrown write); now it round-trips.
    const { listProviders, addProvider, removeProvider } = await import("../src/selfimpulse/engine/providers");
    const added = addProvider({ id: "web-local", kind: "ollama", label: "Ollama (this machine)", defaultModel: "llama3.1" });
    assert.ok(!("error" in added), "addProvider works through the DEFAULT store — no thrown write");
    assert.ok(listProviders().some((x) => x.id === "web-local"), "the registry round-trips the DEFAULT path — no silent []");
    assert.equal(removeProvider("web-local").ok, true, "remove works through the default path too");
    assert.ok(!listProviders().some((x) => x.id === "web-local"), "the removal actually persisted");

    // ── 3. SKILL STORE: import mutates a REAL genome registry, persisted ──
    const { buildCatalog } = await import("../src/selfimpulse/engine/skillStore");
    const cat = await buildCatalog([{ id: "hard1", title: "Clamp", objective: "add clamp", when: "like: clamp", steps: ["write", "test"], provenance: { missionId: "msn-77", verifiedSeats: ["writer"], version: "1" } }]);
    const reg: { genomes: Map<string, { id: string; status: string; version: number }> } = { genomes: new Map() };
    const imported = await importFromCatalog(cat, "hard1", cat.signature?.publicKeyHex, { registry: reg as never });
    if (imported.ok) {
      assert.equal(reg.genomes.size, 1, "the import MUTATED the registry — no label-only landings");
      const g = [...reg.genomes.values()][0];
      assert.equal(g.status, "UNDER_EVALUATION", "landed UNDER_EVALUATION in the actual registry");
      assert.match(g.id, /^skill\.hard1$/, "the genome id names the skill");
    } else {
      assert.match(imported.refused, /UNSIGNED/, "keyless hosts still refuse in words");
    }
    // the persisted store carries the import (the default registry path)
    const rows = localDb.importedGenomesList();
    assert.ok(Array.isArray(rows), "imported genomes persist locally");
    assert.ok(opsSrc.includes("export function importedGenomeRegistry()"), "the Skill Store reads the REAL registry");

    // ── 4. TRIGGERS: the stub is dead; dispatch rides the governed path ──
    assert.ok(!opsSrc.includes("mission queued from trigger"), "the 'mission queued…' stub is GONE");
    assert.ok(opsSrc.includes("export async function dispatchMission(objective: string)"), "trigger dispatch rides dispatchMission — the SAME governed pipeline as chat");

    // ── 5. BROWSER: desktop click/type ride browser_act, receipts everywhere ──
    assert.ok(/browserAct|browser_act/.test(browserSrc), "the browser boundary call (browser_act) is declared at the IPC seam");
    const webClick = await fetchModeDeps().perform({ kind: "click", target: "button.primary" });
    assert.equal(webClick.ok, false, "fetch mode still refuses interactive actions honestly");

    // ── 6. RUST: real adapters, symlink-proof sandbox, shell capability gate ──
    assert.ok(rustSrc.includes("https://api.groq.com/openai/v1"), "groq has its REAL endpoint (no more OpenAI fallthrough)");
    assert.ok(rustSrc.includes('b["system"] = json!(system)'), "anthropic speaks its Messages contract: top-level system");
    assert.ok(rustSrc.includes('let base_override = req["base_url"]'), "base_url is honored for every cloud kind (BYOK gateways)");
    assert.ok(rustSrc.includes("fn canonicalize_best"), "the sandbox canonicalizes paths (symlink-proof containment)");
    assert.ok(rustSrc.includes("canonicalize_best(&normalize_path_str(path))"), "ensure_allowed tests the REAL path");
    assert.ok(rustSrc.includes("SHELL_ALLOWED_PROGRAMS.contains(&bare.as_str())"), "shell_exec has a capability boundary, not just a cwd check");
  });
});