/**
 * SelfImpulse — the product's public identity. One source of truth for every
 * word a person reads: the title, the tagline, the engine credit.
 *
 * No version number lives here on purpose. The product ships under its name;
 * the build identity (src/version.ts) exists for manifests and receipts only.
 *
 * Product  : SelfImpulse
 * Engine   : MJ
 * The human the owner talks to is the Captain (never "Steward" on screen).
 */
export const PRODUCT_NAME = "SelfImpulse";
/* Owner's instruction, 2026-10-02: the tagline becomes "Agentic impulse for
 * remaining". Kept as the owner wrote it — no added comma, no sentence case, no
 * "the". It is the line they chose and it appears in the title bar, the About
 * panel and the window title verbatim. */
export const PRODUCT_TAGLINE = "Agentic impulse for remaining";
export const ENGINE_NAME = "MJ";
export const ENGINE_CREDIT = `Built on the ${ENGINE_NAME} engine`;
export const CAPTAIN_TITLE = "Captain";
