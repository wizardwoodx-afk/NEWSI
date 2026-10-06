# Documentation

SelfImpulse is the product; **MJ** is the engine underneath it. The documents
here describe the product, the engine's design, and how to verify both. None
of them carry a version number — the runners report their own counts.

## Start here

- [STORY.md](STORY.md) — the product narrative, one spine: authorize → execute → verify → measure → prove
- [releases/FEATURES.md](releases/FEATURES.md) — every feature, and where it lives in the tree
- [VERIFICATION.md](VERIFICATION.md) — the two-tier verification gate (offline pack + full toolchain)

## Set up

- [setup/INSTALL-ON-LAPTOP.md](setup/INSTALL-ON-LAPTOP.md) — install and first run
- [setup/DESKTOP-NATIVE.md](setup/DESKTOP-NATIVE.md) — the desktop shell
- [setup/BUILD-NATIVE.md](setup/BUILD-NATIVE.md) — building the native pieces
- [setup/DEPLOY-VERCEL.md](setup/DEPLOY-VERCEL.md) — the web build
- [setup/VENDOR.md](setup/VENDOR.md) — the vendored dependencies

## Design

- [design/specialist-routing.md](design/specialist-routing.md) — how requests become crews
- [design/palette-notes.txt](design/palette-notes.txt) — early colour ideation (kept as history; the live palette law is `src/ui/vh.css`, machine-checked by `tools/contrast-check.mjs`)

## Engine

- [RSIRALS.md](RSIRALS.md) — bounded self-improvement and its external verifier
- [VERSIONING.md](VERSIONING.md) — what carries which version number, and why
- [oss/PARSER-PROVENANCE.md](oss/PARSER-PROVENANCE.md) — parser origins

## Internal (engineering records)

- [internal/PLATFORM-LIMITS.md](internal/PLATFORM-LIMITS.md) — what the product does not do, stated plainly
- [internal/LEGACY-COMPAT.md](internal/LEGACY-COMPAT.md) — compatibility contracts with issued data
- [internal/IMPLEMENTATION-GAP.md](internal/IMPLEMENTATION-GAP.md) — the gap audit: what was found, fixed, and deliberately left
- [internal/POSITIONING.md](internal/POSITIONING.md) and [internal/UNIQUE-FEATURES.md](internal/UNIQUE-FEATURES.md) — market maps and the differentiated-feature ledger

## History

`history/` holds the engine's complete versioned record — release notes,
upgrade guides, verification records, design notes, and the previous
README/FEATURES. `history/releases/CHANGELOG.md` and
`history/releases/RELEASE-VERIFICATION.md` are the authoritative build
records; they are archived as written.
