/**
 * federation/SigilFace.tsx — the Face, on screen, and honest about what it is.
 *
 * A thin React shell over `sigil.ts` and `identity.ts`. It holds no design
 * decisions of its own: geometry, colour and state words all come from the
 * module, so a mark rendered here is byte-identical to the mark the same
 * identity renders anywhere else in the product.
 *
 * TWO KINDS OF MARK, LABELLED NOT CONFUSED (19.6.1):
 *
 *   • `KeyFace`   — KEY-derived (`faceForKey`). The subject is a selfimpulse
 *                   identity, whose identity of record IS its public key. The
 *                   mark changes when the key rotates, and the hover text says
 *                   so. This is the mark a peer's anchor attests to.
 *   • `SigilFace` — SUBJECT-derived (`sigilOf("<kind>:<id>")`). The subject is a
 *                   run-derived thing with no key of its own — a crew member, a
 *                   specialist, a seat. The hover text says it is an identity
 *                   string mark and never implies a key stands behind it.
 *
 * Both are RECOGNITION aids. Neither is a security identifier: the key, and the
 * signature it makes, are the proof. Every hover title in this file says that.
 */
import { useEffect, useMemo, useState } from "react";
import { sigilOf, sigilSvg, SIGIL_STATE_WORDS, type Sigil, type SigilState } from "./sigil";
import { faceForKey, publicKeyPemFromJwk } from "./identity";

export interface SigilFaceProps {
  /** A subject id — a crew member, a specialist, a seat. NOT a key. */
  identity: string;
  /** Pixel size of the square mark. Small is normal: 20–28 in lists, 64+ on cards. */
  size?: number;
  /** Working state. Defaults to `idle`, which is a plain field and no crest. */
  state?: SigilState;
  /** Prefix the subject with `selfimpulse:` before seeding it. */
  seeded?: boolean;
  className?: string;
}

/** Derive a mark from a subject id — the subject-derived path, one way only. */
export function subjectFace(identity: string, seeded = true): Sigil {
  return sigilOf(seeded ? `selfimpulse:${identity}` : identity);
}

function Frame({ markup, title, label, kind, className }: {
  markup: string; title: string; label: string; kind: string; className?: string;
}) {
  return (
    <span
      className={className ? `si-sigil-face ${className}` : "si-sigil-face"}
      title={title}
      data-sigil-kind={kind}
      aria-label={label}
      style={{ display: "inline-flex", flex: "0 0 auto", lineHeight: 0 }}
      // The markup comes from sigil.ts as a fully-formed SVG string: no script,
      // no external reference, and no user input interpolated into it.
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

/** A subject-derived mark: an identity string, no key behind it. */
export function SigilFace({ identity, size = 26, state = "idle", seeded = true, className }: SigilFaceProps) {
  const face = useMemo(() => subjectFace(identity, seeded), [identity, seeded]);
  const markup = useMemo(() => sigilSvg(face, { size, state }), [face, size, state]);
  return (
    <Frame
      markup={markup}
      kind="subject"
      className={className}
      title={`${face.fingerprint} — a recognition mark derived from this identity string, not from a key, and not a security proof`}
      label={`identity mark of ${identity} — ${face.fingerprint} — ${SIGIL_STATE_WORDS[state]}`}
    />
  );
}

/**
 * A key-derived mark, from a JWK. The JWK is re-encoded to the canonical SPKI
 * form before hashing, so this renders the SAME mark as the anchor of the same
 * key. Until the (local, microsecond) re-encoding resolves, a neutral outline
 * is drawn — never a different face, because a wrong face is worse than no face.
 */
export function KeyFace({ jwk, size = 26, state = "idle", className }: {
  jwk: JsonWebKey; size?: number; state?: SigilState; className?: string;
}) {
  const [pem, setPem] = useState<string | null>(null);
  const key = useMemo(() => JSON.stringify(jwk), [jwk]);
  useEffect(() => {
    let live = true;
    setPem(null);
    publicKeyPemFromJwk(jwk)
      .then((p) => { if (live) setPem(p); })
      .catch(() => { if (live) setPem(null); });
    return () => { live = false; };
    // `key` is the stable identity of the JWK; the object identity is not.
  }, [key]);
  void key;

  if (pem === null) {
    return (
      <span
        className={className ? `si-sigil-face ${className}` : "si-sigil-face"}
        title="resolving the key-derived mark for this public key"
        data-sigil-kind="key-pending"
        style={{ display: "inline-block", width: size, height: size, flex: "0 0 auto", borderRadius: 4, border: "1px dashed var(--px-line, #c9c5bb)" }}
      />
    );
  }
  const face = faceForKey(pem);
  return (
    <Frame
      markup={sigilSvg(face, { size, state })}
      kind="key"
      className={className}
      title={`${face.fingerprint} — a recognition mark derived from this public key. Rotate the key and the mark changes; the key is the proof, this is how you recognise it.`}
      label={`key mark ${face.fingerprint} — ${SIGIL_STATE_WORDS[state]}`}
    />
  );
}
