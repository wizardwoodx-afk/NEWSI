/**
 * THE VH TRUST ROOT — the anchor for the external canary verifier
 * (19.7.9 [Keyholder]).
 *
 * The 19.7.8 review found the P0: the verifier's PRIVATE key shipped
 * inside the artifact, so anyone holding the ZIP could forge verdicts the
 * pinned public key happily accepted. The pinned-key design was the
 * mistake — a client-side artifact cannot carry a secret meaningfully.
 * The root has been redesigned around that fact:
 *
 *   • NOTHING SECRET SHIPS. The verifier's keypair is provisioned at
 *     RUNTIME on the owner's machine (private key at
 *     ~/.selfimpulse/verifier.key, mode 0600, outside every artifact).
 *
 *   • REGISTRATION, NOT EMBEDDED KEYS — the provisioned public key is
 *     countersigned by the OWNER key (the same ECDSA P-256 authority that
 *     signs mandates and federation crossings) and stored in the owner
 *     trust store. Verdicts verify under the REGISTERED key; a stranger
 *     key is refused; re-provisioning requires the owner again.
 *
 *   • THE PROGRAM IS PINNED — verifierProgramDigest is the SHA-256 of the
 *     shipped verifier's exact source; the verifier re-digests itself at
 *     runtime and binds programDigest into every verdict signature. A
 *     modified verifier is refused even before its key matters. The
 *     battery digest (over every check's SOURCE) stays pinned alongside —
 *     the battery is EXTERNALLY EXECUTED and DIGEST-PINNED (honest words:
 *     it is not secret, and this design never claims it is).
 *
 *   • WHAT THE BATTERY IS, EXACTLY (19.7.10 [Screenwright]). Ten checks in
 *     two tiers: six LEXICAL markers (h1–h6) and four CAPABILITY-PATTERN
 *     screens (h7–h10: network egress, control weakening, evidence-store
 *     mutation, authority widening). The sixth external review proved the
 *     all-lexical 19.7.9 battery was EVADABLE — a destructive proposal
 *     reworded to dodge the keywords passed 6/6 and drew a valid signature.
 *     The capability-pattern tier does not read intent, so rewording the
 *     prose does not remove an endpoint, a deleted retention step, or a
 *     widened scope. It is still PATTERN MATCHING OVER SUBMITTED TEXT — not
 *     AST, diff, or capability analysis of the proposed code, and a change
 *     written in code that names none of the patterns can still pass.
 *
 *     THE ACCURATE SECURITY BOUNDARY: a ten-check, digest-pinned TEXTUAL /
 *     CAPABILITY-PATTERN SCREEN, plus human approval. Not structural
 *     semantic verification of the proposed code. A text screen cannot
 *     decide malice; the human door stays load-bearing and the ledger now
 *     says so.
 *
 * Rotation: change the verifier program → new programDigest → a new
 * release (reviewed, shipped). Re-provision a machine's key → the owner
 * countersigns again. Never runtime mutation of this root: it is frozen,
 * no setter, like plane T.
 */

export const TRUST_ROOT: Readonly<{
  protocol: "si-verifier/3";
  algorithm: "ECDSA_p256_sha256";
  verifierProgramDigest: string;
  expectedBatteryDigest: string;
  registrationKey: string;
  keyPathOutsideArtifact: string;
}> = Object.freeze({
  protocol: "si-verifier/3",
  algorithm: "ECDSA_p256_sha256",
  verifierProgramDigest: "9dc7f0f8e1fcb926aa74636d172e650d03f36c6b85d94863509d7fd6b01c17e8",
  expectedBatteryDigest: "1c5e31fac9b7fb3abbda7a76702d271527084c048305561c695c188924c4040c",
  registrationKey: "vh.verifier.registration.v3",
  keyPathOutsideArtifact: "~/.selfimpulse/verifier.key",
});
