/**
 * SelfImpulse — the identity seam.
 *
 * WHY THIS IS AN INTERFACE AND NOT A CONSTANT
 * -------------------------------------------
 * Until 19.8 the UI store carried `export const USER = "si-owner"` and passed it
 * to every engine call as `userId`. That is fine for one person on one machine
 * and wrong the moment a second person appears, and the cost of changing it later
 * is not the constant — it is every call site that reads it.
 *
 * The product's direction is local-first now and a shared server later, so the
 * shape of the answer is fixed by the destination, not by today's deployment:
 *
 *   - `IdentityProvider` is the seam. It answers "who is acting, what may they
 *     do, and on whose behalf is this run recorded" and nothing else.
 *   - `LocalIdentityProvider` is today's implementation: one owner, resolved
 *     from the vault-backed owner record, with the full capability set.
 *   - A future `ServerIdentityProvider` implements the SAME interface — it
 *     verifies a session, resolves real users, and reports per-role
 *     capabilities. Nothing above this file changes when it arrives.
 *
 * What this module does NOT pretend
 * ---------------------------------
 * `LocalIdentityProvider` is not authentication. There is no password, no second
 * factor and no session token, because on a single-user desktop there is nobody
 * to authenticate against: the person at the keyboard already holds the machine
 * and the vault passphrase is the only secret in play. It says so in
 * `describe()`, and Settings renders that sentence rather than a green tick.
 *
 * What it DOES do, and what the compliance regimes actually need:
 *   - a STABLE subject id, so receipts and audit rows are attributable;
 *   - explicit CAPABILITIES, so a future role-restricted provider has something
 *     to narrow, and so "who may do this" is a fact rather than an assumption;
 *   - a DATA-HANDLING classification per subject, which is the input the HIPAA /
 *     GDPR surfaces need in order to decide what may be stored at all.
 *
 * The capability vocabulary is deliberately small. A long list of permissions
 * nobody checks is a list nobody maintains.
 */

/** What a subject is allowed to do. Narrow on purpose — see the note above. */
export type Capability =
  /** ask the Captain things, and read its answers */
  | "ask"
  /** use the deterministic engines (the finance pack and the generalist pack) */
  | "compute"
  /** propose documents for approval */
  | "teach"
  /** decide a proposal or a gate — the human half of the product */
  | "approve"
  /** change product settings */
  | "configure"
  /** read and export the audit log */
  | "audit:read"
  /** erase retained data */
  | "purge";

/**
 * How a subject's data may be treated.
 *
 * `phi` exists because HIPAA is in scope. A subject marked `phi` means their
 * records may contain protected health information, which pulls in the
 * encryption-at-rest and minimum-necessary rules elsewhere. It is a property of
 * the SUBJECT, not of the data, so it can be set once and then govern every
 * record that subject touches.
 */
export type DataClass = "general" | "financial" | "phi" | "pii";

export interface Identity {
  /** stable across sessions — this is what receipts and audit rows name */
  subject: string;
  /** what the owner calls themselves, shown in the UI */
  display: string;
  /** a role label, for a future server provider. "owner" today. */
  role: string;
  capabilities: Capability[];
  dataClass: DataClass;
  /** how this identity was established, in words the UI can show verbatim */
  method: string;
}

export interface IdentityProvider {
  /** who is acting right now, or null when nobody has established an identity */
  current(): Identity | null;
  /** the subject id to stamp on a run, or null when there is no identity */
  subject(): string | null;
  /** whether this subject may do X. An unknown subject may do NOTHING. */
  can(capability: Capability): boolean;
  /**
   * Whether a provider is installed at all. A future server build reports false
   * here until its session is live, and the UI must then say so rather than
   * silently behaving as if a user were signed in.
   */
  ready(): boolean;
  /** a sentence describing the authentication posture, for Settings → About. */
  describe(): string;
}

/** Every capability the product defines. Used to build the default owner set. */
export const ALL_CAPABILITIES: readonly Capability[] = [
  "ask", "compute", "teach", "approve", "configure", "audit:read", "purge",
] as const;

const SUBJECT_KEY = "vh.identity.subject.v1";
const DISPLAY_KEY = "vh.identity.display.v1";
const DATACLASS_KEY = "vh.identity.dataClass.v1";

function readLs(key: string): string | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function writeLs(key: string, value: string): void {
  try {
    (globalThis as { localStorage?: Storage }).localStorage?.setItem(key, value);
  } catch {
    /* a full or blocked origin still gets an identity, just not a durable one */
  }
}

/**
 * Derive a stable subject id from the vault/owner identity.
 *
 * Why it is not `Math.random()`: a subject id that changes on every launch would
 * silently break the attribution an audit depends on — two runs by the same
 * person would look like two subjects. The id is minted ONCE and persisted; the
 * owner can re-mint it deliberately, which is an identity change and is
 * recorded as one.
 */
function mintSubject(): string {
  const existing = readLs(SUBJECT_KEY);
  if (existing) return existing;
  const entropy = new Uint8Array(16);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(entropy);
  else for (let i = 0; i < entropy.length; i++) entropy[i] = Math.floor(Math.random() * 256);
  const hex = [...entropy].map((b) => b.toString(16).padStart(2, "0")).join("");
  const subject = `si-owner-${hex.slice(0, 16)}`;
  writeLs(SUBJECT_KEY, subject);
  return subject;
}

function isCapabilitySet(list: readonly Capability[]): list is Capability[] {
  return Array.isArray(list) && list.every((c) => (ALL_CAPABILITIES as readonly string[]).includes(c));
}

/**
 * The single-user implementation.
 *
 * Every capability is granted because there is exactly one operator and it is
 * them. That is a FACT about this deployment, not a policy decision — and the
 * moment a second person exists this class stops being the right answer, which
 * is why the seam is an interface.
 */
export class LocalIdentityProvider implements IdentityProvider {
  private cache: Identity | null = null;

  private build(): Identity {
    const display = readLs(DISPLAY_KEY) ?? "owner";
    const rawClass = readLs(DATACLASS_KEY);
    const dataClass: DataClass = rawClass === "phi" || rawClass === "pii" || rawClass === "financial" ? rawClass : "general";
    return {
      subject: mintSubject(),
      display,
      role: "owner",
      capabilities: [...ALL_CAPABILITIES],
      dataClass,
      method: "local owner — no password, no second factor; the vault passphrase is the only secret on this machine",
    };
  }

  current(): Identity | null {
    if (!this.cache) this.cache = this.build();
    return this.cache;
  }

  subject(): string | null {
    return this.current()?.subject ?? null;
  }

  can(capability: Capability): boolean {
    const id = this.current();
    // No identity, no capability. Anything else is a fail-open.
    if (!id) return false;
    return id.capabilities.includes(capability);
  }

  ready(): boolean {
    return true;
  }

  describe(): string {
    return "Single-operator desktop. There is no login: this build authenticates nobody, because there is nobody to authenticate. Receipts and the audit log are attributed to one local subject id. Before this product serves a second person, a server identity provider must replace this one — the interface is already in place.";
  }
}

let active: IdentityProvider = new LocalIdentityProvider();

/** The provider the product runs on. Replaceable; nothing above it changes. */
export function identityProvider(): IdentityProvider {
  return active;
}

/**
 * Install a different provider (the future server build; the probes).
 *
 * Refuses rather than repairs, but the refusals are only the ones that indicate
 * a BROKEN provider — not a provider that simply has nobody signed in:
 *
 *   - a null argument is NOT treated as "reset to local". Doing that let any
 *     caller silently DOWNGRADE an installed server provider back to the
 *     single-user one, which is precisely the wrong direction. The probe caught
 *     it. It is now a no-op that leaves the installed provider alone.
 *   - a provider whose `current()` returns an identity that is malformed, or
 *     whose capability set escapes the declared vocabulary, is refused: those
 *     are ways to hand out authority the product cannot account for.
 *
 * `current() === null` IS accepted. "Nobody is signed in" is a legitimate state
 * a server provider has to be able to be in — refusing it would mean a shared
 * deployment could never install before its first login. The fail-closed
 * behaviour for that state is enforced by this module rather than trusted to the
 * provider: see `can()`, which short-circuits before consulting a provider that
 * has nobody.
 */
export function setIdentityProvider(next: IdentityProvider | null): { ok: boolean; note: string } {
  if (!next) {
    return {
      ok: false,
      note: "refused a null identity provider and left the installed one in place. Clearing the identity layer is not something a caller can do by accident — a product with no identity must not look like a product with one.",
    };
  }
  let probe: Identity | null;
  try {
    probe = next.current();
  } catch (e) {
    return { ok: false, note: `refused an identity provider that threw on current() (${String(e)}) — an identity layer that can fail open is not an identity layer.` };
  }
  // Nobody signed in is a valid state; a MALFORMED identity is not.
  if (probe !== null) {
    if (typeof probe.subject !== "string" || !probe.subject) {
      return { ok: false, note: "refused an identity provider whose identity has no subject — a subject id is what receipts and audit rows are attributed to." };
    }
    if (!isCapabilitySet(probe.capabilities)) {
      return { ok: false, note: "refused an identity provider whose capability set is not a subset of the declared vocabulary — an unknown capability would be a permission nobody reviews." };
    }
  }
  active = next;
  return {
    ok: true,
    note: probe
      ? `identity provider installed: ${next.describe()}`
      : `identity provider installed with NOBODY signed in: ${next.describe()} — every capability is refused until an identity is established.`,
  };
}

/* ── the fail-closed boundary ───────────────────────────────────────────────────
 * The provider is TRUSTED to describe who is acting. It is NOT trusted to decide
 * what that person may do, and the two are combined rather than one deferring to
 * the other:
 *
 *     may(capability) === identity lists it  AND  provider's policy allows it
 *
 * Both halves must agree. The identity record is the AUTHORITY — it is the
 * explicit, reviewable statement of what this subject holds — and the provider's
 * `can()` is a POLICY that may only ever be MORE restrictive. A provider whose
 * `can()` is written carelessly (returning true for everything, which is the
 * easy mistake) can therefore never widen what the identity record grants.
 *
 * Two ways this fails closed rather than open, both found by the probe:
 *   - no identity: the provider is not consulted at all. "Nobody is signed in"
 *     must not be a state in which a provider's opinion matters.
 *   - the provider throws: treated as a refusal.
 */

export function can(capability: Capability): boolean {
  let id: Identity | null;
  try {
    id = active.current();
  } catch {
    return false;
  }
  // No identity, no capability — the provider is never asked.
  if (!id || !id.subject) return false;
  // The identity record is the authority. A capability it does not list is refused
  // before the provider's policy is consulted at all.
  if (!Array.isArray(id.capabilities) || !id.capabilities.includes(capability)) return false;
  try {
    return active.can(capability) === true;
  } catch {
    return false;
  }
}

/** The subject id, or null. Never a placeholder. */
export function subject(): string | null {
  try {
    return active.current()?.subject ?? null;
  } catch {
    return null;
  }
}

/** Whether an identity is established. A provider that throws is not ready. */
export function ready(): boolean {
  try {
    return active.ready() && !!active.current();
  } catch {
    return false;
  }
}

/** The current identity, or null. */
export function currentIdentity(): Identity | null {
  try {
    return active.current();
  } catch {
    return null;
  }
}

/** Owner-facing settings, so the handle and the data class are changeable. */
export function setOwnerDisplay(display: string): { ok: boolean; subject: string } {
  const clean = display.trim().slice(0, 64);
  if (clean) writeLs(DISPLAY_KEY, clean);
  const id = active.current();
  if (id) active = new LocalIdentityProvider(); // rebuild so display() is fresh
  return { ok: !!clean, subject: id?.subject ?? "" };
}

/** Declare what kind of data this operator handles. Governs the HIPAA/GDPR paths. */
export function setDataClass(cls: DataClass): { ok: boolean; note: string } {
  if (cls !== "general" && cls !== "financial" && cls !== "phi" && cls !== "pii") {
    return { ok: false, note: `refused an unknown data class "${String(cls)}" — an unrecognised classification would be treated as "general" by every rule downstream, which is the unsafe direction.` };
  }
  writeLs(DATACLASS_KEY, cls);
  active = new LocalIdentityProvider();
  return { ok: true, note: `data class set to "${cls}".` };
}

/** The data class currently in force, for the surfaces that must disclose it. */
export function dataClass(): DataClass {
  const raw = readLs(DATACLASS_KEY);
  return raw === "phi" || raw === "pii" || raw === "financial" ? raw : "general";
}

/**
 * Deliberately re-mint the subject id.
 *
 * This is an IDENTITY CHANGE, not a rename: receipts and audit rows before and
 * after belong to different subjects, which is exactly what a "this is a
 * different person" event should look like in the record. It is offered as an
 * explicit action rather than happening implicitly anywhere.
 */
export function rotateSubject(): { ok: boolean; subject: string; note: string } {
  try {
    (globalThis as { localStorage?: Storage }).localStorage?.removeItem(SUBJECT_KEY);
  } catch { /* a new id is still minted below */ }
  const subject = mintSubject();
  active = new LocalIdentityProvider();
  return {
    ok: true,
    subject,
    note: `new subject id ${subject}. Records written before this point remain attributed to the previous subject — that separation is the point, and it is not undone.`,
  };
}
