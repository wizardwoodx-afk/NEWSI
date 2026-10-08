# Third-Party Notices

## Document readers adopted for the Docs door (§13)

Three published packages do the format-reading behind `src/mission/`. Each was
license-checked against the artifact's own license text rather than against its
registry label — which mattered once, and `docs/oss/PARSER-PROVENANCE.md` records
how. That page carries the exact versions, artifact hashes and the transitive
license review; the full field-by-field adoption record lives in the register of
record, outside the distributed tree.

### pdfjs-dist — PDF text and outline

- Project: https://github.com/mozilla/pdf.js
- Used: its `legacy/build/pdf.mjs` parser, plus that build's PDF worker vendored
  byte-for-byte at `vendor/pdfjs/pdf.worker.min.mjs` so both the offline
  verification pack and the browser build have a worker to start.
- License: Apache License, Version 2.0. Full text:
  `LICENSES/pdfjs-dist-APACHE-2.0.txt`.
- Our code calls it; no line of it was modified.

### mammoth — DOCX structure

- Project: https://github.com/mwilliamson/mammoth.js
- Used: `convertToHtml`, to carry Word heading levels and list structure into the
  knowledge proposal.
- License: BSD 2-Clause. Copyright (c) 2013, Michael Williamson. Full text:
  `LICENSES/mammoth-BSD-2-CLAUSE.txt`.
- Its dependencies are all permissive (MIT / BSD); none is copyleft.

### jszip — ZIP container and PPTX parts

- Project: https://github.com/Stuk/jszip
- Used: to inflate archive members that SelfImpulse's own central-directory scan has
  already approved by name and by size. jszip is not the security gate;
  `src/mission/archiveScan.ts` is.
- License: **dual MIT or GPL-3.0-or-later, at the licensee's choice. SelfImpulse
  uses it under the MIT license.** Copyright (c) 2009 Stuart Knightley, David
  Duponchel, Franz Buchinger, António Afonso. Both license texts are reproduced
  verbatim in `LICENSES/jszip-MIT-OR-GPL-3.txt`.

### clawpdf — rasterising a page that has no text layer

- Package: `clawpdf` (npm). Version adopted: 0.3.2, integrity
  `sha512-1JudW0rZ5B7O2E9+cgnU5F4As7K6HZ3/s/3CHUXm5uG0+965uPOk11gvhmprpwXGJaRXhrmywZ1WWc5a+GZ7TQ==`.
  **Zero runtime dependencies.**
- Used: `createEngine` → `open` → `page(n).png({dpi})`, to turn the pages of a PDF
  that carries no text layer into images the local recogniser can read. Nothing
  else in the system uses it; the text path still belongs to pdf.js, which is
  better at text and is already security-hardened here.
- Why a second PDF engine rather than pdf.js for both: pdf.js cannot rasterise
  under Node without a native canvas module, and a native build would have to
  compile on every target the desktop app ships to. clawpdf is WebAssembly, needs
  no compiler, and has its own build for the browser as well as Node.
- License: MIT. Its copyright notice is reproduced verbatim, as the licence
  requires, in `LICENSES/clawpdf-MIT.txt` — that file is the authoritative
  attribution and is shipped unmodified.
- Our code calls it; no line of it was modified. It renders in-process and reaches
  no network: its PDFium build ships inside the package.

### The image formats the door accepts — PNG and JPEG

- A document that *is* an image (a screenshot, a photographed invoice, a page exported as a
  picture) is read by the same route as a scanned PDF page. Two formats are accepted, PNG
  and JPEG, each recognised by its own signature rather than by the file's name.
- **No new dependency decodes them.** The recogniser's core WebAssembly carries the image
  decoders it needs; `tesseract.js-core` is already recorded above and already Apache-2.0.
  Nothing was added to the tree for this.

### tesseract.js — reading those images, on this machine

- Project: https://github.com/naptha/tesseract.js
- Version adopted: 7.0.0.
- Used: `createWorker` → `recognize`, to turn a page image into text. Wrapped by
  `src/mission/ocr.ts`, which owns the caps, the refusals and the local-data rule.
- Why this recogniser and not a better-scoring one: every higher-accuracy open
  engine in 2026 (PaddleOCR-VL, docTR, EasyOCR, Surya) is a Python stack with
  PyTorch or PaddlePaddle behind it and 2–4 GB of VRAM recommended. That is the
  wrong language and the wrong shape for a WebAssembly desktop app that must run
  on a machine with no GPU. Tesseract is the one that runs acceptably on a CPU
  alone, in a single-digit-megabyte footprint, under Apache-2.0.
- **The language data is not fetched.** The upstream default for the language
  pack, the core WebAssembly and the worker script are all remote content-delivery
  locations. `tools/vendor-ocr-assets.mjs` copies all three into the tree at build
  time, the language pack pinned by SHA-256; `src/mission/ocr.ts` refuses to start
  in a browser that has not been given local paths rather than reaching out.
- License: Apache License, Version 2.0. Full text:
  `LICENSES/tesseract.js-APACHE-2.0.txt`.
- Its dependency `tesseract.js-core` 7.0.0 is Apache-2.0 as well; full text:
  `LICENSES/tesseract-core-APACHE-2.0.txt`. The compiled Tesseract engine inside
  it is Apache-2.0. Its remaining transitive dependencies were reviewed and are
  all permissive; none is copyleft.
- Distributed language pack: `eng.traineddata` from the tessdata project, itself
  Apache-2.0 and derived from the Tesseract project's own training data.

## Agent-User Interaction Protocol (AG-UI)

- Project: https://github.com/ag-ui-protocol/ag-ui
- Adopted: the AG-UI event vocabulary and base event contract, read from the
  upstream versioned `spec/` schema directory and re-expressed as first-party
  TypeScript in `src/engine/aguiProtocol.ts`. No runtime dependency was added;
  the module is SelfImpulse's own code implementing an adopted specification.
- Commit adopted: `b8ebd02c84a3` (31 event types; upstream protocol revision
  one point oh — this is the AG-UI protocol's own revision, not a SelfImpulse
  release number).
- License: MIT License. Copyright (c) 2025 AG-UI contributors.
- MIT license text: https://github.com/ag-ui-protocol/ag-ui/blob/main/LICENSE
- Integrity: `probe/aguiBoundary.test.ts` pins the adopted vocabulary and every
  rule the boundary must keep.

## Content-bound durable approvals (open-multi-agent)

- Project: https://github.com/open-multi-agent/open-multi-agent
- Adopted: one durable-approval *property*, not a dependency — that a gate
  approval hashes exactly what the reviewer was shown, so a later dispute proves
  what was approved rather than merely that something was. Read from upstream
  `approval/durable.ts`, `journal/hash.ts`, `journal/verify.ts` and
  `memory/checkpoint.ts`, and re-expressed as first-party TypeScript in
  `src/security/approvalEvidence.ts`. **No runtime dependency was added** and no
  upstream source line is included — the module is SelfImpulse's own code, built
  on its existing seams (the `stableStringify` canonicaliser in
  `src/security/actionGraph.ts`, the cross-platform `pureSha256`, the `durable.ts`
  KV ledger, and the Ed25519 issuer in `src/mission/signing.ts`).
- It adds **evidence, never authority**: the native OS dialog remains the only
  satisfier of the gate; the digest, the sealed receipt and the offline verifier
  only describe and bind a decision the gate already reached.
- License: MIT License. Copyright (c) Shenzhen YuanASI Technology Co., Ltd. and
  open-multi-agent contributors. The MIT license text is reproduced verbatim, as
  the licence requires, in `LICENSES/open-multi-agent-MIT.txt` — that file is the
  authoritative attribution and is shipped unmodified.
- Commit adopted: `75a6758` (pushed 2026-10-04).
- Integrity: `probe/approvalEvidence.test.ts` pins canonical-digest determinism
  (key-order and platform independent), drift refusal, offline chain
  verification, the stale/second-decision ledger refusals, and the binding of an
  approval into a signed mission receipt chain.

## Secret-scrubbed audit trail and bounded seat ceiling (claw-enterprise)

- Project: https://github.com/openclaw/openclaw-enterprise
- Commit adopted: `096ce70` (pushed 2026-10-06).
- License: MIT License. Copyright (c) 2026 OpenAI. Reproduced verbatim, as the
  licence requires, in `LICENSES/claw-enterprise-MIT.txt` — that file is the
  authoritative attribution and is shipped unmodified.
- Adopted from upstream `packages/audit`, as re-expressed first-party TypeScript
  in `src/security/auditScrub.ts`: the posture that an audit trail is scrubbed on
  its way *into* storage rather than by asking the caller to be careful — a
  key-shaped value in free text, a `Bearer …` header quoted into a reason, a
  member named `accessToken`, an embedded control character, a `__proto__` key.
  SelfImpulse needed it because a gate ask, a ledger row and a tool receipt all
  carry operator-authored strings, and an auditor's trail is a secret store
  wearing a different hat.
- Adopted from upstream `apps/controller/src/drivers/repo/credentials/provider-queue.ts`,
  as `src/mission/dispatchLanes.ts`: a bounded ceiling on how many seats may hold
  a provider connection at once, before the wave is drained. Upstream ceilings
  per credential; the seam here is per wave, and the ceiling is derived from the
  team's own configuration rather than imposed on it.
- No runtime dependency was added and no upstream source line is included. Both
  modules are SelfImpulse's own code on its existing seams.
- Integrity: `probe/auditScrub.test.ts` (65) and `probe/dispatchLanes.test.ts` (43).

## Retry lanes — a wait is not a failure (paperclip)

- Project: https://github.com/paperclipai/paperclip
- Commit adopted: `a6306ba` (pushed 2026-10-06).
- License: MIT License. Copyright (c) 2025 Paperclip AI. Reproduced verbatim, as
  the licence requires, in `LICENSES/paperclip-MIT.txt` — that file is the
  authoritative attribution and is shipped unmodified.
- Adopted from upstream `server/src/services/execution-recovery-attempt.ts` and
  `server/src/services/approved-execution-wait.ts`, as `src/mission/retryLanes.ts`:
  the separation of a *retry charge* from a *wait*, decided by the reason for the
  retry rather than by its occurrence, and the discipline of reading an ambiguous
  historical record conservatively instead of resetting it. SelfImpulse's two
  existing retry counters could not tell a failure from a human reading an ask,
  so a crew parked at the gate burned its failure budget and then its 30-minute
  ceiling on somebody's response time.
- Wired into `src/mission/missionRuntime.ts` and `src/mission/runCheckpoints.ts`;
  the durable run chain now carries lane-classified accounting, and the repair
  ladder survives a resume.
- No runtime dependency was added and no upstream source line is included.

---

SelfImpulse (built on the MJ engine) includes clean-room TypeScript implementations of token-
compression techniques proven in the open-source community. The following
projects informed the design of LOTUS (Lean Optimal Token Utilisation System,
`src/engine/lotus.ts`); no source code from either project is included — the
implementations in this repository were written for SelfImpulse's audited pipeline —
but their MIT licenses require this notice, and their authors have our thanks.

## context-compress (Open330)

- Project: https://github.com/Open330/context-compress
- Techniques informed: the compression mode ladder (conservative / balanced /
  aggressive / auto), dedup references for repeated tool output, and the
  net-win gate (skip any pass that would not pay for its own markers).
- License: MIT License. Copyright (c) 2026 Open330 and contributors.
- MIT license text: https://github.com/Open330/context-compress/blob/main/LICENSE

## LLMLingua (Microsoft Research)

- Project: https://github.com/microsoft/LLMLingua
- Techniques informed: the principle that a small, deterministic scorer can
  identify low-value tokens before inference — the research baseline for
  prompt compression (up to 20× with minimal performance loss). SelfImpulse's LOTUS
  uses deterministic, model-free passes today; the LLMLingua line marks the
  path for model-scored compression later.
- License: MIT License. Copyright (c) Microsoft Corporation.
- MIT license text: https://github.com/microsoft/LLMLingua/blob/main/LICENSE

Permission is hereby granted, free of charge, to any person obtaining a copy
of the above-referenced software, to deal in the software without restriction,
including without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the software, subject to the
following conditions: the above copyright notice and this permission notice
shall be included in all copies or substantial portions of the software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
