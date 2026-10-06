# Versioning — the policy of record

SelfImpulse ships with **two** release numbers, on purpose. They are defined here so no
installer, manifest or diligence review has to guess which is which.

Version of record: product 1.9.1 · engine MJ 19.7.15 ("SelfImpulse")

| Number | What it versions | Where it appears |
|---|---|---|
| **Product release: 1.0.0** | the product a customer installs | `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `VERSION.txt`, installer metadata |
| **Engine release: MJ 19.7.15 ("SelfImpulse")** | the MJ engine lineage | `src/version.ts` (single source), `verify/BUILD-INFO.txt` (`built:`), `verify/MANIFEST.json`, receipts and proof artifacts |

Rules:

1. Product manifests never carry the engine number, and engine manifests never carry
   the product number. `probe/versionDrift.test.ts` fails the build on any drift.
2. Current-facing documents show **no** version numbers at all, except lines labelled
   `Version of record:` (this file, the release note, `VERSION.txt`) — `probe/docIdentity.test.ts`.
3. The archive a user is given is named after the product release (`SelfImpulse-v1.0.0.zip`).
4. Engine identity is what receipts sign and manifests attest; the product number is
   what a person reads. Nothing else mixes them.
