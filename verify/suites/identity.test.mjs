import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/identity.test.ts
import * as fs from "node:fs";
import * as path from "node:path";

// src/security/identity.ts
var ALL_CAPABILITIES = [
  "ask",
  "compute",
  "teach",
  "approve",
  "configure",
  "audit:read",
  "purge"
];
var SUBJECT_KEY = "vh.identity.subject.v1";
var DISPLAY_KEY = "vh.identity.display.v1";
var DATACLASS_KEY = "vh.identity.dataClass.v1";
function readLs(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function writeLs(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
  }
}
function mintSubject() {
  const existing = readLs(SUBJECT_KEY);
  if (existing) return existing;
  const entropy = new Uint8Array(16);
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(entropy);
  else for (let i = 0; i < entropy.length; i++) entropy[i] = Math.floor(Math.random() * 256);
  const hex = [...entropy].map((b2) => b2.toString(16).padStart(2, "0")).join("");
  const subject2 = `si-owner-${hex.slice(0, 16)}`;
  writeLs(SUBJECT_KEY, subject2);
  return subject2;
}
function isCapabilitySet(list) {
  return Array.isArray(list) && list.every((c) => ALL_CAPABILITIES.includes(c));
}
var LocalIdentityProvider = class {
  cache = null;
  build() {
    const display = readLs(DISPLAY_KEY) ?? "owner";
    const rawClass = readLs(DATACLASS_KEY);
    const dataClass2 = rawClass === "phi" || rawClass === "pii" || rawClass === "financial" ? rawClass : "general";
    return {
      subject: mintSubject(),
      display,
      role: "owner",
      capabilities: [...ALL_CAPABILITIES],
      dataClass: dataClass2,
      method: "local owner \u2014 no password, no second factor; the vault passphrase is the only secret on this machine"
    };
  }
  current() {
    if (!this.cache) this.cache = this.build();
    return this.cache;
  }
  subject() {
    return this.current()?.subject ?? null;
  }
  can(capability) {
    const id = this.current();
    if (!id) return false;
    return id.capabilities.includes(capability);
  }
  ready() {
    return true;
  }
  describe() {
    return "Single-operator desktop. There is no login: this build authenticates nobody, because there is nobody to authenticate. Receipts and the audit log are attributed to one local subject id. Before this product serves a second person, a server identity provider must replace this one \u2014 the interface is already in place.";
  }
};
var active = new LocalIdentityProvider();
function identityProvider() {
  return active;
}
function setIdentityProvider(next) {
  if (!next) {
    return {
      ok: false,
      note: "refused a null identity provider and left the installed one in place. Clearing the identity layer is not something a caller can do by accident \u2014 a product with no identity must not look like a product with one."
    };
  }
  let probe;
  try {
    probe = next.current();
  } catch (e) {
    return { ok: false, note: `refused an identity provider that threw on current() (${String(e)}) \u2014 an identity layer that can fail open is not an identity layer.` };
  }
  if (probe !== null) {
    if (typeof probe.subject !== "string" || !probe.subject) {
      return { ok: false, note: "refused an identity provider whose identity has no subject \u2014 a subject id is what receipts and audit rows are attributed to." };
    }
    if (!isCapabilitySet(probe.capabilities)) {
      return { ok: false, note: "refused an identity provider whose capability set is not a subset of the declared vocabulary \u2014 an unknown capability would be a permission nobody reviews." };
    }
  }
  active = next;
  return {
    ok: true,
    note: probe ? `identity provider installed: ${next.describe()}` : `identity provider installed with NOBODY signed in: ${next.describe()} \u2014 every capability is refused until an identity is established.`
  };
}
function can(capability) {
  let id;
  try {
    id = active.current();
  } catch {
    return false;
  }
  if (!id || !id.subject) return false;
  if (!Array.isArray(id.capabilities) || !id.capabilities.includes(capability)) return false;
  try {
    return active.can(capability) === true;
  } catch {
    return false;
  }
}
function subject() {
  try {
    return active.current()?.subject ?? null;
  } catch {
    return null;
  }
}
function ready() {
  try {
    return active.ready() && !!active.current();
  } catch {
    return false;
  }
}
function currentIdentity() {
  try {
    return active.current();
  } catch {
    return null;
  }
}
function setOwnerDisplay(display) {
  const clean = display.trim().slice(0, 64);
  if (clean) writeLs(DISPLAY_KEY, clean);
  const id = active.current();
  if (id) active = new LocalIdentityProvider();
  return { ok: !!clean, subject: id?.subject ?? "" };
}
function setDataClass(cls) {
  if (cls !== "general" && cls !== "financial" && cls !== "phi" && cls !== "pii") {
    return { ok: false, note: `refused an unknown data class "${String(cls)}" \u2014 an unrecognised classification would be treated as "general" by every rule downstream, which is the unsafe direction.` };
  }
  writeLs(DATACLASS_KEY, cls);
  active = new LocalIdentityProvider();
  return { ok: true, note: `data class set to "${cls}".` };
}
function dataClass() {
  const raw = readLs(DATACLASS_KEY);
  return raw === "phi" || raw === "pii" || raw === "financial" ? raw : "general";
}
function rotateSubject() {
  try {
    globalThis.localStorage?.removeItem(SUBJECT_KEY);
  } catch {
  }
  const subject2 = mintSubject();
  active = new LocalIdentityProvider();
  return {
    ok: true,
    subject: subject2,
    note: `new subject id ${subject2}. Records written before this point remain attributed to the previous subject \u2014 that separation is the point, and it is not undone.`
  };
}

// probe/identity.test.ts
var ROOT = process.env.SI_ROOT ? path.resolve(process.env.SI_ROOT) : process.cwd();
var readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \xE2\u20AC\u201D ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \xE2\u20AC\u201D ${detail}` : ""}`);
  }
}
var MemStore = class {
  m = /* @__PURE__ */ new Map();
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, v);
  }
  removeItem(k) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
};
var store = new MemStore();
globalThis.localStorage = store;
console.log("== 1. no hardcoded USER constant remains");
var storeSrc = readSrc("src/ui/store.ts");
var settingsSrc = readSrc("src/ui/screens/Settings.tsx");
ok("the store no longer exports a USER constant", !/export const USER\s*=/.test(storeSrc));
ok("no call site passes a hardcoded 'si-owner' as a userId", !/userId:\s*"si-owner"/.test(storeSrc));
ok("the store asks the identity seam for the subject", /identityProvider\(\)\.subject\(\)/.test(storeSrc), "the seam is imported but not used for attribution");
ok(
  "a run with no subject is refused before the engine is called",
  /if \(!subject\)[\s\S]{0,400}?return;/.test(storeSrc),
  "the send() path must gate on a subject before askSelfImpulse19"
);
console.log("== 2. the local provider mints ONE stable subject");
setIdentityProvider(new LocalIdentityProvider());
var p1 = identityProvider();
var a = p1.current();
var b = p1.current();
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
var d = p1.describe();
ok("the description says there is no login", /no login/i.test(d), d.slice(0, 80));
ok("the description says nobody is authenticated", /authenticates nobody/i.test(d), d.slice(0, 120));
ok("the description names what must replace it before a second person", /server identity provider|second person/i.test(d));
ok("the description does not claim the product is authenticated", !/\bauthenticated\b(?!\s*nobody)/i.test(d.replace(/authenticates nobody/i, "")));
ok("the method string says the same thing", /no password/i.test(a?.method ?? ""), a?.method);
console.log("== 5. a different provider narrows the SAME seam (the server path)");
var ViewerProvider = class {
  current() {
    return { subject: "svc-viewer-001", display: "auditor", role: "viewer", capabilities: ["ask", "audit:read"], dataClass: "general", method: "test double" };
  }
  subject() {
    return "svc-viewer-001";
  }
  can(c) {
    return ["ask", "audit:read"].includes(c);
  }
  ready() {
    return true;
  }
  describe() {
    return "test double";
  }
};
var inst = setIdentityProvider(new ViewerProvider());
ok("a restricted provider installs", inst.ok, inst.note);
ok("current() now reports the new subject", identityProvider().current()?.subject === "svc-viewer-001");
ok("the granted capability still works", identityProvider().can("ask"));
ok("the second granted capability works", identityProvider().can("audit:read"));
ok("approve is now REFUSED", !identityProvider().can("approve"));
ok("purge is now REFUSED", !identityProvider().can("purge"));
ok("configure is now REFUSED", !identityProvider().can("configure"));
ok("compute is now REFUSED", !identityProvider().can("compute"));
console.log("== 6. bad providers are refused \xE2\u20AC\u201D every failure mode here is fail-open");
var noSubject = setIdentityProvider({ current: () => ({ subject: "", display: "x", role: "r", capabilities: [], dataClass: "general", method: "m" }), subject: () => "", can: () => true, ready: () => true, describe: () => "d" });
ok("a provider whose identity has NO subject is refused", !noSubject.ok);
ok("the refusal says why", /no subject/i.test(noSubject.note), noSubject.note);
ok("the previous provider is STILL installed after a refusal", identityProvider().current()?.subject === "svc-viewer-001");
var nul = setIdentityProvider(null);
ok("a null provider is refused", !nul.ok);
ok("the refusal says a caller cannot clear the identity layer by accident", /not something a caller can do by accident|cannot clear/i.test(nul.note), nul.note);
ok(
  "a null provider does not DOWNGRADE an installed one to local",
  identityProvider().current()?.subject === "svc-viewer-001",
  "silently reverting to the single-user provider is the wrong direction"
);
var thrower = setIdentityProvider({ current: () => {
  throw new Error("session store offline");
}, subject: () => "x", can: () => true, ready: () => true, describe: () => "d" });
ok("a provider that throws on current() is refused", !thrower.ok);
ok("the refusal says a provider that fails open is not one", /fail open/i.test(thrower.note), thrower.note);
var wild = setIdentityProvider({ current: () => ({ subject: "s", display: "d", role: "r", capabilities: ["ask", "root"], dataClass: "general", method: "m" }), subject: () => "s", can: () => true, ready: () => true, describe: () => "d" });
ok("a provider with an UNDECLARED capability is refused", !wild.ok);
ok("the refusal says why an unknown capability matters", /nobody reviews|unknown capability/i.test(wild.note), wild.note);
ok("a refused provider never takes effect", identityProvider().current()?.subject === "svc-viewer-001");
console.log("== 7. nobody signed in \xE2\u20AC\u201D a legitimate state, and it grants NOTHING");
var SignedOutProvider = class {
  current() {
    return null;
  }
  subject() {
    return null;
  }
  /* Deliberately MISIMPLEMENTED: a carelessly written provider that grants
     everything when nobody is signed in. The seam must not consult it. */
  can() {
    return true;
  }
  ready() {
    return false;
  }
  describe() {
    return "signed out";
  }
};
var so = setIdentityProvider(new SignedOutProvider());
ok("a signed-out provider DOES install", so.ok, so.note);
ok("the install note says no capability is granted", /every capability is refused/i.test(so.note), so.note);
ok("the seam reports not ready", !ready());
ok("the seam reports no subject", subject() === null);
ok("the seam reports no identity", currentIdentity() === null);
ok(
  "the seam grants NOTHING even though the provider's own can() returns true",
  ALL_CAPABILITIES.every((c) => !can(c)),
  "the seam must short-circuit before consulting a provider that has nobody"
);
ok("the provider itself is still reachable for the next install", identityProvider() instanceof SignedOutProvider);
var online = true;
var FlakyProvider = class {
  current() {
    if (!online) throw new Error("session store offline");
    return { subject: "svc-1", display: "svc", role: "viewer", capabilities: ["ask"], dataClass: "general", method: "flaky double" };
  }
  subject() {
    if (!online) throw new Error("session store offline");
    return "svc-1";
  }
  can() {
    return true;
  }
  // carelessly grants everything
  ready() {
    return online;
  }
  describe() {
    return "flaky double";
  }
};
var fl = setIdentityProvider(new FlakyProvider());
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
var saved = setOwnerDisplay("  Ravi  ");
ok("a handle is saved", saved.ok);
ok("the handle is trimmed", identityProvider().current()?.display === "Ravi", identityProvider().current()?.display);
ok("the subject is unchanged by a rename", identityProvider().current()?.subject === saved.subject, "a rename must not re-mint the subject");
ok("an empty handle is refused", !setOwnerDisplay("   ").ok);
ok("the previous handle survives a refused save", identityProvider().current()?.display === "Ravi");
console.log("== 9. data class \xE2\u20AC\u201D the input the HIPAA/GDPR rules read");
ok("the default class is general", dataClass() === "general");
for (const c of ["financial", "pii", "phi"]) {
  const r = setDataClass(c);
  ok(`"${c}" is accepted`, r.ok);
  ok(`"${c}" is then in force`, dataClass() === c);
}
var bogus = setDataClass("confidential");
ok("an UNKNOWN data class is refused", !bogus.ok);
ok("the refusal says an unrecognised class would be read as general", /treated as "general"|unsafe direction/i.test(bogus.note), bogus.note);
ok("a refused class leaves the previous one in force", dataClass() === "phi", "refusing a class must not silently downgrade to general");
setDataClass("general");
console.log("== 10. rotating the subject is an identity CHANGE, and says so");
var before = identityProvider().current()?.subject ?? "";
var rot = rotateSubject();
ok("rotation produces a new subject", rot.subject !== before, `${before} -> ${rot.subject}`);
ok("the new subject has the same shape", /^si-owner-[0-9a-f]{16}$/.test(rot.subject), rot.subject);
ok("the rotation says earlier records keep the old subject", /remain attributed to the previous subject|not undone/i.test(rot.note), rot.note);
ok("the rotation is immediate", identityProvider().current()?.subject === rot.subject);
ok("the handle survives a rotation", identityProvider().current()?.display === "Ravi", "re-minting the id must not wipe the owner's name");
console.log("== 11. the seam is what the store actually calls");
ok("the store imports from the identity seam", /from "\.\.\/security\/identity"/.test(storeSrc));
ok("the store exports a subject accessor for the UI", /export function currentSubject\(\)/.test(storeSrc));
ok(
  "the heartbeat executor also resolves its subject through the seam",
  /engineExecutor\(\{ userId: currentSubject\(\)/.test(storeSrc),
  "the autonomy path still names a subject independently"
);
ok(
  "Settings reads the seam rather than localStorage directly",
  /from "\.\.\/\.\.\/security\/identity"/.test(settingsSrc) && !/localStorage\.setItem\("vh\.owner\.handle"/.test(settingsSrc),
  "the owner handle must be written through setOwnerDisplay, not a raw storage write"
);
console.log(`
${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  - ${f}`);
}
if (failed > 0) process.exit(1);
