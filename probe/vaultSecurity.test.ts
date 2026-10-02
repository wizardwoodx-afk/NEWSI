/**
 * probe/vaultSecurity.test.ts — the 19.7.1 owner vault + encrypted memory.
 *
 * Pins the review fixes:
 *   • the vault: AES-256-GCM under a PBKDF2 passphrase; the passphrase and
 *     key are never stored; sealed records hold no plaintext; wrong
 *     passphrases fail closed; locked records say locked;
 *   • the provider path: a legacy PLAINTEXT provider record is purged on
 *     first contact (treated as compromised) — never silently kept;
 *   • the memory graph: seals at rest when the vault is unlocked (no
 *     plaintext residue), reads honestly as locked when it is not, and
 *     the ON/OFF switch stops ingestion outright.
 */
import assert from "node:assert/strict";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

/* a functioning localStorage for the probe run */
class MemStore implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}
(globalThis as { localStorage?: Storage }).localStorage = new MemStore();

const vault = await import("../src/engine/vault");
const mg = await import("../src/engine/memoryGraph");

const PROVIDER_KEY = "vh.provider.remembered.v1";

console.log("== the vault: set, seal, open ==");
ok("a short passphrase is refused in words", !(await vault.setVaultPassphrase("short")).ok);
const created = await vault.setVaultPassphrase("correct horse battery staple");
ok("a real passphrase creates the vault", created.ok === true && created.created === true);
ok("the meta record stores NO passphrase material", !JSON.stringify(globalThis.localStorage?.getItem("vh.vault.meta.v1")).toLowerCase().includes("horse"));
await vault.vaultSeal("vh.test.secret", '{"apiKey":"sk-super-secret-value-123"}');
const sealedRaw = globalThis.localStorage?.getItem("vh.test.secret") ?? "";
ok("the sealed record is a vault envelope", sealedRaw.includes("si-vault/1"));
ok("the sealed record does NOT contain the plaintext", !sealedRaw.includes("sk-super-secret-value-123"));
const opened = await vault.vaultDecrypt("vh.test.secret");
ok("an unlocked vault reads the secret back", opened.found && !opened.locked && opened.text.includes("sk-super-secret-value-123"));

console.log("== wrong passphrases and locking fail closed ==");
vault.lockVault();
const lockedRead = await vault.vaultDecrypt("vh.test.secret");
ok("a locked vault says LOCKED, never guesses", lockedRead.found && lockedRead.locked === true);
const wrong = await vault.setVaultPassphrase("wrong passphrase entirely!!");
ok("a wrong passphrase does NOT open the vault", wrong.ok === false && wrong.error.toLowerCase().includes("did not open"));
const right = await vault.setVaultPassphrase("correct horse battery staple");
ok("the right passphrase reopens it (created:false)", right.ok === true && right.created === false);
const again = await vault.vaultDecrypt("vh.test.secret");
ok("the secret is readable again after re-unlock", again.found && !again.locked && again.text.includes("sk-super-secret-value-123"));

console.log("== the provider path: legacy plaintext is purged, never kept ==");
globalThis.localStorage?.setItem(PROVIDER_KEY, JSON.stringify({ kind: "openai-compatible", baseUrl: "https://api.openai.com/v1", apiKey: "sk-legacy-plaintext-key", model: "gpt-4.1" }));
const purged = vault.purgePlain(PROVIDER_KEY);
ok("the legacy plaintext record is found and REMOVED from storage", purged.found && globalThis.localStorage?.getItem(PROVIDER_KEY) === null);
ok("the purge returns the raw text so the caller can migrate it", purged.text?.includes("sk-legacy-plaintext-key") === true);
const resealed = await vault.vaultSeal(PROVIDER_KEY, purged.text ?? "");
ok("the migrated key re-seals into the vault", resealed.ok === true && !(globalThis.localStorage?.getItem(PROVIDER_KEY) ?? "").includes("sk-legacy-plaintext-key"));

console.log("== the memory graph: sealed at rest, honest when locked, pausable ==");
mg.clearGraph();
const at = (h: number) => new Date(Date.UTC(2026, 8, 19, 10 + h, 0, 0)).toISOString();
mg.ingestSession([
  { role: "user", text: "Plan the Zephyr migration for Friday and keep the ledger verified", at: at(0) },
  { role: "vh", text: "The Zephyr migration plan is staged with verification gates.", at: at(1) },
], { id: "chat-vault-1" });
await mg.flushGraphPersist();
ok("ingestion works while unlocked", mg.graphStats().sessions === 1);
const rawAfterSave = globalThis.localStorage?.getItem("engine.memgraph.v1") ?? "";
ok("with the vault unlocked, the graph at rest is a SEALED envelope", rawAfterSave.includes("si-vault/1"));
ok("the sealed graph does NOT contain conversation text", !rawAfterSave.includes("Zephyr migration"));
ok("graphSecurityStatus says sealed", mg.graphSecurityStatus().mode === "sealed");

vault.lockVault();
ok("locked: the status says so in words", mg.graphSecurityStatus().mode === "locked");
const hydLocked = await mg.hydrateGraph();
ok("hydration while locked reports locked and loads NOTHING", hydLocked.locked === true && hydLocked.loaded === false);
const right2 = await vault.setVaultPassphrase("correct horse battery staple");
ok("re-unlock works", right2.ok === true);
const hyd = await mg.hydrateGraph();
ok("hydration after unlock restores the graph", hyd.loaded === true && mg.graphStats().sessions === 1 && mg.listSessions()[0]?.keywords.includes("zephyr"));

console.log("== the memory ON/OFF switch ==");
mg.setMemoryEnabled(false);
ok("the switch reports off", mg.memoryEnabled() === false);
mg.ingestSession([{ role: "user", text: "this must not be stored anywhere at all", at: at(5) }], { id: "chat-vault-2" });
ok("memory OFF: ingestion stores nothing", mg.graphStats().sessions === 1 && mg.listSessions().every((s) => s.id !== "chat-vault-2"));
mg.setMemoryEnabled(true);
mg.ingestSession([{ role: "user", text: "resumed storage works again with fresh keywords quartz lantern", at: at(6) }], { id: "chat-vault-2" });
await mg.flushGraphPersist();
ok("memory ON resumes ingestion", mg.graphStats().sessions === 2);

console.log("== the plaintext mode is stated, never hidden ==");
vault.destroyVault();
mg.ingestSession([{ role: "user", text: "plain mode store frank pattern", at: at(7) }], { id: "chat-vault-3" });
await mg.flushGraphPersist();
const rawPlain = globalThis.localStorage?.getItem("engine.memgraph.v1") ?? "";
ok("without a vault, the graph persists as readable JSON (the honest fallback)", rawPlain.includes("frank") && !rawPlain.includes("si-vault/1"));
ok("graphSecurityStatus names the mode 'plaintext'", mg.graphSecurityStatus().mode === "plaintext");
mg.clearGraph();
ok("clearGraph wipes every form", mg.graphStats().sessions === 0 && globalThis.localStorage?.getItem("engine.memgraph.v1") === null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
