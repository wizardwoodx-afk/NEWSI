/**
 * The identity seam (src/security/identity.ts).
 *
 * WHY THIS IS A GATE
 * ------------------
 * The product is local-first now and a shared server later, so the question this
 * suite answers is not "is the owner logged in" â€” nothing is â€” but:
 *
 *   1. Is there ONE source of the subject id, with no hardcoded constant left
 *      behind it? A second hardcoded `USER` would mean receipts and audit rows
 *      could be attributed to different people, which is the exact failure an
 *      audit exists to detect.
 *   2. Does a future provider drop in WITHOUT any call site changing? That is
 *     only true if the interface is the real seam, and it is pinned by installing
 *     a restricted provider and watching capabilities actually narrow.
 *   3. Does the provider FAIL CLOSED? Every dangerous direction here is fail-open:
 *     no identity granting everything, a throwing provider reporting a user, an
 *     unknown capability treated as granted, an unknown data class silently
 *     treated as "general" (the unsafe direction, because "general" skips the
 *     HIPAA rules).
 *   4. Is the POSTURE stated honestly? A build that authenticates nobody must
 *     not be able to render itself as authenticated.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  ALL_CAPABILITIES,
  LocalIdentityProvider,
  dataClass,
  identityProvider,
  currentIdentity,
  ready,
  rotateSubject,
  subject,
  can,
  setDataClass,
  setIdentityProvider,
  setOwnerDisplay,
  type Capability,
  type Identity,
  type IdentityProvider,
} from "../src/security/identity";

/* Source pins resolve through SI_ROOT, not import.meta.url. The offline
 * pack bundles each suite into verify/suites/ and runs it with cwd = the tree
 * root, so `new URL("../src/...", import.meta.url)` resolves to verify/src/... and
 * throws ENOENT. probe/buildRoot.ts is the convention every other suite uses. */
const ROOT = process.env.SI_ROOT ? path.resolve(process.env.SI_ROOT) : process.cwd();
const readSrc = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` â€” ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` â€” ${detail}` : ""}`); }
}

class MemStore {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const store = new MemStore();
(globalThis as { localStorage?: Storage }).localStorage = store as unknown as Storage;

console.log("== 1. no hardcoded USER constant remains");
const storeSrc = readSrc("src/ui/store.ts");
const settingsSrc = readSrc("src/ui/screens/Settings.tsx");
ok("the store no longer exports a USER constant", !/export const USER\s*=/.test(storeSrc));
ok("no call site passes a hardcoded 'si-owner' as a userId", !/userId:\s*"si-owner"/.test(storeSrc));
ok("the store asks the identity seam for the subject", /identityProvider\(\)\.subject\(\)/.test(storeSrc), "the seam is imported but not used for attribution");
ok("a run with no subject is refused before the engine is called", /if \(!subject\)[\s\S]{0,400}?return;/.test(storeSrc),
  "the send() path must gate on a subject before askSelfImpulse19");

console.log("== 2. the local provider mints ONE stable subject");
setIdentityProvider(new LocalIdentityProvider());
const p1 = identityProvider();
const a = p1.current();
const b = p1.current();
ok("a subject exists", !!a?.subject);
ok("the subject is stable across calls", a?.subject === b?.subject);
ok("the subject is namespaced to this product", /^si-owner-[0-9a-f]{16}$/.test(a?.subject ?? ""), a?.subject);
ok("it is not a bare random number", !/^si-owner-\d{1,6}$/.test(a?.subject ?? ""));
ok("the provider reports ready", p1.ready());
ok("the subject accessor agrees with current()", p1.subject() === a?.subject);

console.log("== 3. capabilities are a closed vocabulary and are granted here");
for (const c of ALL_CAPABILITIES) ok(`the owner may "${c}"`, p1.can(c));
ok("the vocabulary is exactly the seven declared capabilities", ALL_CAPABILITIES.length === 7, String(ALL_CAPABILITIES.length));
ok("no capability is misspelled into the list", ALL_CAPABILITIES.every((c) => typeof c === "string" && c === c.toLowerCase()));

console.log("== 4. the posture is stated honestly, not as a green tick");
const d = p1.describe();
ok("the description says there is no login", /no login/i.test(d), d.slice(0, 80));
ok("the description says nobody is authenticated", /authenticates nobody/i.test(d), d.slice(0, 120));
ok("the description names what must replace it before a second person", /server identity provider|second person/i.test(d));
ok("the description does not claim the product is authenticated", !/\bauthenticated\b(?!\s*nobody)/i.test(d.replace(/authenticates nobody/i, "")));
ok("the method string says the same thing", /no password/i.test(a?.method ?? ""), a?.method);

console.log("== 5. a different provider narrows the SAME seam (the server path)");
/** A restricted provider â€” what a future "viewer" role would look like. */
class ViewerProvider implements IdentityProvider {
  current(): Identity {
    return { subject: "svc-viewer-001", display: "auditor", role: "viewer", capabilities: ["ask", "audit:read"], dataClass: "general", method: "test double" };
  }
  subject() { return "svc-viewer-001"; }
  can(c: Capability) { return (["ask", "audit:read"] as Capability[]).includes(c); }
  ready() { return true; }
  describe() { return "test double"; }
}
const inst = setIdentityProvider(new ViewerProvider());
ok("a restricted provider installs", inst.ok, inst.note);
ok("current() now reports the new subject", identityProvider().current()?.subject === "svc-viewer-001");
ok("the granted capability still works", identityProvider().can("ask"));
ok("the second granted capability works", identityProvider().can("audit:read"));
ok("approve is now REFUSED", !identityProvider().can("approve"));
ok("purge is now REFUSED", !identityProvider().can("purge"));
ok("configure is now REFUSED", !identityProvider().can("configure"));
ok("compute is now REFUSED", !identityProvider().can("compute"));

console.log("== 6. bad providers are refused â€” every failure mode here is fail-open");
const noSubject = setIdentityProvider({ current: () => ({ subject: "", display: "x", role: "r", capabilities: [], dataClass: "general", method: "m" }) as Identity, subject: () => "", can: () => true, ready: () => true, describe: () => "d" });
ok("a provider whose identity has NO subject is refused", !noSubject.ok);
ok("the refusal says why", /no subject/i.test(noSubject.note), noSubject.note);
ok("the previous provider is STILL installed after a refusal", identityProvider().current()?.subject === "svc-viewer-001");
const nul = setIdentityProvider(null);
ok("a null provider is refused", !nul.ok);
ok("the refusal says a caller cannot clear the identity layer by accident", /not something a caller can do by accident|cannot clear/i.test(nul.note), nul.note);
ok("a null provider does not DOWNGRADE an installed one to local", identityProvider().current()?.subject === "svc-viewer-001",
  "silently reverting to the single-user provider is the wrong direction");
const thrower = setIdentityProvider({ current: () => { throw new Error("session store offline"); }, subject: () => "x", can: () => true, ready: () => true, describe: () => "d" });
ok("a provider that throws on current() is refused", !thrower.ok);
ok("the refusal says a provider that fails open is not one", /fail open/i.test(thrower.note), thrower.note);
const wild = setIdentityProvider({ current: () => ({ subject: "s", display: "d", role: "r", capabilities: ["ask", "root"] as Capability[], dataClass: "general", method: "m" }) as unknown as Identity, subject: () => "s", can: () => true, ready: () => true, describe: () => "d" });
ok("a provider with an UNDECLARED capability is refused", !wild.ok);
ok("the refusal says why an unknown capability matters", /nobody reviews|unknown capability/i.test(wild.note), wild.note);
ok("a refused provider never takes effect", identityProvider().current()?.subject === "svc-viewer-001");

console.log("== 7. nobody signed in â€” a legitimate state, and it grants NOTHING");
/* 19.8 â€” a provider reporting `current() === null` is now ACCEPTED, because a
   shared deployment has to be able to install before its first login. An earlier
   cut refused it, which meant a server build could never be installed while
   logged out â€” the state it spends most of its unauthenticated life in. The
   fail-closed half of the deal lives in the seam, not in the install check. */
class SignedOutProvider implements IdentityProvider {
  current() { return null; }
  subject() { return null; }
  /* Deliberately MISIMPLEMENTED: a carelessly written provider that grants
     everything when nobody is signed in. The seam must not consult it. */
  can() { return true; }
  ready() { return false; }
  describe() { return "signed out"; }
}
const so = setIdentityProvider(new SignedOutProvider());
ok("a signed-out provider DOES install", so.ok, so.note);
ok("the install note says no capability is granted", /every capability is refused/i.test(so.note), so.note);
ok("the seam reports not ready", !ready());
ok("the seam reports no subject", subject() === null);
ok("the seam reports no identity", currentIdentity() === null);
ok("the seam grants NOTHING even though the provider's own can() returns true", ALL_CAPABILITIES.every((c) => !can(c)),
  "the seam must short-circuit before consulting a provider that has nobody");
ok("the provider itself is still reachable for the next install", identityProvider() instanceof SignedOutProvider);

/* A provider that installs cleanly and then goes offline — the realistic
   server failure: the session store is reachable at login and unreachable later. */
let online = true;
class FlakyProvider implements IdentityProvider {
  current(): Identity {
    if (!online) throw new Error("session store offline");
    return { subject: "svc-1", display: "svc", role: "viewer", capabilities: ["ask"], dataClass: "general", method: "flaky double" };
  }
  subject(): string { if (!online) throw new Error("session store offline"); return "svc-1"; }
  can(): boolean { return true; }          // carelessly grants everything
  ready(): boolean { return online; }
  describe(): string { return "flaky double"; }
}
const fl = setIdentityProvider(new FlakyProvider());
ok("a healthy provider installs", fl.ok, fl.note);
ok("while online it grants what the identity lists", can("ask"));
ok("while online, a capability it does not list is still refused", !can("purge"), "the provider's can() returns true for everything, so this proves the seam is what refuses");
online = false;
ok("once it goes offline the seam grants NOTHING", ALL_CAPABILITIES.every((c) => !can(c)), "a throwing provider must not fail open");
ok("and reports no subject", subject() === null);
ok("and reports not ready", !ready());
ok("and reports no identity", currentIdentity() === null);
online = true;
ok("when it comes back, the seam grants again", can("ask"), "recovering must not require a reinstall");

console.log("== 8. back to local, and the handle writes through the seam");
setIdentityProvider(new LocalIdentityProvider());
ok("the local provider is installed again", identityProvider().current()?.subject?.startsWith("si-owner-"));
const saved = setOwnerDisplay("  Ravi  ");
ok("a handle is saved", saved.ok);
ok("the handle is trimmed", identityProvider().current()?.display === "Ravi", identityProvider().current()?.display);
ok("the subject is unchanged by a rename", identityProvider().current()?.subject === saved.subject, "a rename must not re-mint the subject");
ok("an empty handle is refused", !setOwnerDisplay("   ").ok);
ok("the previous handle survives a refused save", identityProvider().current()?.display === "Ravi");

console.log("== 9. data class â€” the input the HIPAA/GDPR rules read");
ok("the default class is general", dataClass() === "general");
for (const c of ["financial", "pii", "phi"] as const) {
  const r = setDataClass(c);
  ok(`"${c}" is accepted`, r.ok);
  ok(`"${c}" is then in force`, dataClass() === c);
}
const bogus = setDataClass("confidential" as never);
ok("an UNKNOWN data class is refused", !bogus.ok);
ok("the refusal says an unrecognised class would be read as general", /treated as "general"|unsafe direction/i.test(bogus.note), bogus.note);
ok("a refused class leaves the previous one in force", dataClass() === "phi", "refusing a class must not silently downgrade to general");
setDataClass("general");

console.log("== 10. rotating the subject is an identity CHANGE, and says so");
const before = identityProvider().current()?.subject ?? "";
const rot = rotateSubject();
ok("rotation produces a new subject", rot.subject !== before, `${before} -> ${rot.subject}`);
ok("the new subject has the same shape", /^si-owner-[0-9a-f]{16}$/.test(rot.subject), rot.subject);
ok("the rotation says earlier records keep the old subject", /remain attributed to the previous subject|not undone/i.test(rot.note), rot.note);
ok("the rotation is immediate", identityProvider().current()?.subject === rot.subject);
ok("the handle survives a rotation", identityProvider().current()?.display === "Ravi", "re-minting the id must not wipe the owner's name");

console.log("== 11. the seam is what the store actually calls");
ok("the store imports from the identity seam", /from "\.\.\/security\/identity"/.test(storeSrc));
ok("the store exports a subject accessor for the UI", /export function currentSubject\(\)/.test(storeSrc));
ok("the heartbeat executor also resolves its subject through the seam",
  /engineExecutor\(\{ userId: currentSubject\(\)/.test(storeSrc), "the autonomy path still names a subject independently");
ok("Settings reads the seam rather than localStorage directly",
  /from "\.\.\/\.\.\/security\/identity"/.test(settingsSrc) &&
  !/localStorage\.setItem\("vh\.owner\.handle"/.test(settingsSrc),
  "the owner handle must be written through setOwnerDisplay, not a raw storage write");

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) { console.log("\nFAILURES:"); for (const f of failures) console.log(`  - ${f}`); }
if (failed > 0) process.exit(1);

