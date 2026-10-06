# Legacy compatibility

The honest position on old identifiers is not "zero legacy strings". Receipts,
licences, databases and credentials issued by earlier builds have to stay
readable, and a string baked into one of those cannot be renamed without a
storage migration that would orphan somebody's data.

So the contract is narrower and checkable:

1. Every surviving legacy identifier is **listed below with its reason**.
2. It is **matched by an allowlist** in `probe/legacyCompat.test.ts`.
3. It is **still doing real work** — the probe fails if an allowlisted shim
   disappears, because an unused shim is just a name you have not cleaned up
   yet.
4. Anything legacy that is *not* on this list fails the probe.

`probe/legacyCompat.test.ts` enforces all four. It also fails if this document
and the allowlist disagree, in either direction.

## The list

| Identifier | Why it survives |
|---|---|
| `mj-proof-receipt` | Wire format of pre-16.1 receipts. The verifier must keep accepting them; old files are already in users' hands. |
| `mj-commercial-v1-offline` | Licence-secret name. Renaming would invalidate every issued offline licence key. |
| `mj_evolution` | Vendored first-party Python module name (`vendor/evolution-service`). Import path, not ours to rename. |
| `legacy-mj-receipt` | Filename of the signed back-compat test fixture. |
| `mj-mission-record`, `mj-dossier`, `mj-incident-dossier`, `mj-merge-attestation`, `mj-provenance-statement` | MIME types on issued records. A reader has to recognise the old ones. |
| `mj.desktop` | Provenance predicate URI baked into issued credentials. |
| `mjVersion` | Schema field name in stored receipts and manifests. Renaming needs a storage migration. |
| `MJ_ACP_BIN`, `MJ_ACP_ARGS`, `MJ_BROWSER_DIR`, `MJ_BROWSER_NODE`, `MJ_BROWSER_URL` | Legacy environment-variable fallbacks. Read-only; kept so an old launcher still resolves. |
| `"mj.`, `` `mj. ``, `'mj.` | The one-time storage-key migration in `main.tsx` has to name the old prefix in order to move it. |
| `mj.sqlite` | On-disk database filename. Renaming orphans the user's data. |
| `mj-browser`, `mj-bridge`, `mj-control-mcp`, `mj-desktop`, `mj://event`, `join("mj")` | Names in the workspace database and the MCP event channel. |
| `MJ 1x.`, `MJ-era`, `pre-16.1`, `legacy MJ`, `LEGACY` | Historical documentation of the predecessor engine. |

## What is *not* on this list

The product name itself. It is not a compatibility problem, because nothing
user-facing was ever issued under it — it is a rename, and the old name is
gone from the tree rather than grandfathered.
