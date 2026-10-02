/**
 * SelfImpulse — the shell entry point.
 *
 * The shell itself now lives in ./si/SiShell.tsx, next to the design system
 * that styles it (./si/si.css). This file is a deliberate re-export and
 * nothing more, so that every existing import path keeps working unchanged:
 *
 *     src/App.tsx            import { Shell } from "./ui/Shell";
 *     probe/shellRender.tsx  await import("../src/ui/Shell");
 *
 * Keeping the public path stable matters more than it looks. Several probe
 * suites read THIS FILE as TEXT and assert on it — the eight-entry door table,
 * `screen === "x" && door("x", <X />)`, `{PRODUCT_NAME}` and
 * `<WindowControls />`. Those suites pass today only because the old shell was
 * written here. With this file as a re-export they fail while the application
 * keeps working perfectly — a false alarm, and a confusing one.
 *
 * MEASURED, NOT ASSUMED. Copying si/SiShell.tsx over this file and re-running
 * the probes (then restoring) gives:
 *
 *   patinaShell   67 pass / 3 fail  ->  70 pass / 0 fail
 *   buttonActions  3 pass / 1 fail  ->   4 pass / 0 fail
 *   engineDoor     1 fail           ->   0 fail
 *   navAlign      12 pass / 7 fail  ->  18 pass / 1 fail
 *
 * So the fix is one string per suite: point `read("src/ui/Shell.tsx")` at
 * `src/ui/si/SiShell.tsx`. The single navAlign holdout is a real rename, not a
 * path problem — the rail footers are now `.si-provider` and `.si-owner`
 * rather than `.status` and `.me`, so that one assertion needs its two literals
 * updated too. That is the probe owner's file, not this stream's, so it is
 * reported rather than edited.
 *
 * The alternative was rejected deliberately: keeping a dead copy of the old
 * shell here to satisfy a text grep would leave TWO shells in the tree, which
 * is the exact defect probe/patinaShell.test.ts exists to prevent, and the copy
 * would rot silently the first time a door changed.
 */
export { Shell } from "./si/SiShell";
export { Shell as default } from "./si/SiShell";
