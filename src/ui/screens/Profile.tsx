import React, { useState } from "react";
import { useVh } from "../store";
import { GeneralistFace, setGeneralistName, DEFAULT_GENERALIST_NAME } from "../../engine/face";

/* THE PROFILE — who you are, as distinct from how the app is configured (Settings).
 * It is NOT a rail door: the rail is contractually eight entries, so this is
 * reachable only from the owner card that names you.
 * NO KEY MATERIAL here — not masked, not truncated, not hashed. A profile is
 * exactly where someone looks for credentials, and vault.status already carries
 * the state; nothing else is needed. */

type Line = { k: string; v: string; note?: string };

const PROVIDER_LABEL: Record<string, string> = {
  "openai-compatible": "OpenAI-compatible endpoint",
  anthropic: "Anthropic",
  gemini: "Gemini",
};

/** Origin only. A configured URL can carry a key in its query or path, and a
 *  profile is the worst place to leak one — so anything past the host is dropped
 *  rather than trimmed, and an unparseable URL yields nothing at all. */
function safeOrigin(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return new URL(raw).origin === "null" ? undefined : new URL(raw).origin;
  } catch {
    return undefined;
  }
}

export function Profile(): React.ReactElement {
  const { ownerHandle, stewardName, vault, provider, go } = useVh();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stewardName || DEFAULT_GENERALIST_NAME);

  const vaultLine: Line =
    vault.status === "unlocked"
      ? { k: "Vault", v: "Unlocked", note: "The owner key is in memory for this session only." }
      : vault.status === "sealed-locked"
        ? { k: "Vault", v: "Locked", note: "Sealed on disk. Unlocking needs the passphrase." }
        : { k: "Vault", v: "Not set", note: "No passphrase has been chosen on this machine yet." };

  /* The provider KIND is named in plain words rather than as the internal token
     ("openai-compatible" means nothing to an owner). The endpoint HOST is shown
     so two configured providers are distinguishable at a glance — the host is
     already visible to anyone who configured it, and a path or a query on that
     URL could carry a secret, so only the origin is ever rendered. */
  const providerLine: Line = provider
    ? {
        k: "Provider",
        v: PROVIDER_LABEL[provider.kind] ?? provider.kind,
        note: [provider.model, safeOrigin(provider.baseUrl)].filter(Boolean).join(" · ") || undefined,
      }
    : { k: "Provider", v: "Plan-only", note: "No key configured — the Captain plans and says so rather than pretending." };

  const rows: Line[] = [
    { k: "Handle", v: ownerHandle },
    { k: "Captain", v: stewardName || DEFAULT_GENERALIST_NAME },
    vaultLine,
    providerLine,
  ];

  const commit = (): void => {
    const next = draft.trim();
    if (next) {
      setGeneralistName(next);
      setEditing(false);
    } else {
      setDraft(stewardName || DEFAULT_GENERALIST_NAME);
    }
  };

  return (
    <div className="stack">
      <header className="top">
        <h2>Profile</h2>
        <p className="sub">Who this machine is working for.</p>
      </header>

      <section className="card profile-facts" aria-labelledby="profile-who">
        <div className="card-h" id="profile-who">
          <GeneralistFace />
          <div className="cb-desk-head">
            <b>{stewardName || DEFAULT_GENERALIST_NAME}</b>
            <span className="sub">{ownerHandle}</span>
          </div>
          {editing ? (
            <div className="acts">
              <label className="sr" htmlFor="profile-name">Captain name</label>
              <input
                id="profile-name"
                className="input"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") { setDraft(stewardName || DEFAULT_GENERALIST_NAME); setEditing(false); }
                }}
              />
              <button className="btn primary" onClick={commit}>Save</button>
              <button
                className="btn ghost"
                onClick={() => { setDraft(stewardName || DEFAULT_GENERALIST_NAME); setEditing(false); }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button className="btn" onClick={() => setEditing(true)}>Rename</button>
          )}
        </div>

        {/* One <dl> per fact, and the description as a second <dd> rather than a
            run-on tail inside the first. A <dl> laid out as one row puts the label at
            one end and the value at the other; wrapping all four pairs in <div>s
            inside a single <dl> made them four COLUMNS, and the sentence that followed
            its value inside the same <dd> then read as part of it —
            "Not setNo passphrase has been chosen…". The value and the sentence about
            the value now share one column, so each is legible on its own. */}
        {rows.map((r) => (
          <dl key={r.k} className="kv">
            <dt>{r.k}</dt>
            <dd>{r.v}</dd>
            {r.note ? <dd className="hint">{r.note}</dd> : null}
          </dl>
        ))}

        <div className="acts">
          {/* The assurance and the door out of it are two different things; side by
              side with nothing between them, the eye reads one label on one button. */}
          <span className="hint" style={{ marginRight: "auto" }}>Keys are never shown here.</span>
          <button className="btn sm ghost" onClick={() => go("settings")}>Open Settings</button>
        </div>
      </section>
    </div>
  );
}