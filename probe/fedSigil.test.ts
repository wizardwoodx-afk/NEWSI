/**
 * probe/fedSigil.test.ts — the Face, derived and not selectable.
 *
 * A face in an identity product is a claim, so the claim is measured here:
 * derivation from the selfimpulse's own SHA-256, determinism, palette membership,
 * no eye/mouth arrangement by construction, and a distinctness number that
 * includes the TRUE collision count rather than a flattering average.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PINNED_PALETTE, SIGIL_TINCTURES, SIGIL_GROUNDS, SIGIL_TILTS, SIGIL_STATES, SIGIL_STATE_WORDS,
  SIGIL_ENCODING_BITS, SIGIL_LAYERS,
  sigilOf, fingerprintOf, sigilTraits, sigilSummary, sigilBits, sigilDistance, collisionReport,
  chargeCentres, sigilSvg, sigilCardHtml, wash, type SigilState,
} from "../src/engine/federation/sigil";
import { pureSha256 } from "../src/engine/pureHash";
import { AVATAR_INKS, AVATAR_FIELDS } from "../src/engine/avatarEngine";

/** A fixed spread: owners, selfimpulses, peers, specialists, seats — the real population. */
const SEEDS = Array.from({ length: 120 }, (_, i) => `identity:probe-${i}`);

test("federation sigil — a face that is derived, measured and never selectable", async (t) => {
  await t.test("§1 the derivation is the selfimpulse's own SHA-256, and it is total", () => {
    const s = sigilOf("selfimpulse:reykjavik");
    const hex = pureSha256("vh.fed.sigil.v1:selfimpulse:reykjavik");
    assert.equal(hex.length, 64);
    assert.equal(s.field, ["heater", "lozenge", "rondel"][Number.parseInt(hex.slice(0, 2), 16) % 3]);
    assert.equal(s.fingerprint, fingerprintOf("selfimpulse:reykjavik"));
    assert.match(s.fingerprint, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    assert.equal(s.fingerprint, fingerprintOf("selfimpulse:reykjavik"), "the handle is stable");
    assert.notEqual(s.fingerprint, fingerprintOf("selfimpulse:lisbon"));

    // every layer is populated for every seed — no undefined faces
    for (const layer of ["field", "division", "seme", "chief", "charge", "chargeCount", "tincture", "ground", "bordure", "tilt"] as const) {
      for (const seed of SEEDS.slice(0, 40)) assert.ok(sigilOf(seed)[layer] !== undefined, `${seed} has no ${layer}`);
    }
  });

  await t.test("§2 same identity, same face — every run; different identity, different face", () => {
    const a = sigilOf("owner:priya");
    const b = sigilOf("owner:priya");
    assert.deepEqual(a, b, "a sigil is a pure function of its identity");
    assert.equal(sigilDistance(sigilOf("owner:priya"), sigilOf("owner:ana")) > 0, true);

    const report = collisionReport(SEEDS);
    assert.equal(report.sample, 120);
    assert.equal(report.distinct, 120, `expected 120 distinct encodings, saw ${report.distinct}`);
    assert.equal(report.exactCollisions, 0, "no two identities in the sample encode identically");
    /* The honest floor. The field is 23 discrete bits, so over 120 identities
       the closest pair is EXPECTED to differ in 2-3 bits — that is arithmetic,
       not a defect, and inflating the bit count to make this number prettier
       would be designing for the test instead of for the reader. What matters
       is that no pair is identical and that the population is well spread;
       the precise handle is the fingerprint, never the drawing. */
    assert.ok(report.minDistance >= 2, `closest pair was ${report.minDistance} bits apart`);
    assert.ok(report.shareWellSeparated > 0.9, `only ${(report.shareWellSeparated * 100).toFixed(1)}% of pairs differ in >= 6 bits`);
    assert.ok(report.closest !== null);

    // The measurement is honest about a deliberately-colliding input.
    const dupes = collisionReport(["a", "a", "b"]);
    assert.equal(dupes.exactCollisions, 1, "an identical input is reported as a collision, not smoothed away");
    assert.equal(dupes.minDistance, 0);
  });

  await t.test("§3 the tincture is VH's palette — never a new hue", () => {
    for (const hex of Object.values(SIGIL_TINCTURES)) {
      assert.ok((PINNED_PALETTE as readonly string[]).includes(hex), `${hex} is not a pinned VH token`);
    }
    for (const hex of Object.values(SIGIL_GROUNDS)) {
      assert.ok((PINNED_PALETTE as readonly string[]).includes(hex) || hex === "#f7f5f1", `${hex} is not a pinned ground`);
    }
    for (const ink of [...AVATAR_INKS, ...AVATAR_FIELDS]) {
      assert.ok((PINNED_PALETTE as readonly string[]).includes(ink), `${ink} missing from the pinned palette`);
    }
    // `wash(hex, amount)` keeps `amount` of the tincture and blends the rest to
    // the base: 1 is the tincture itself, 0 is the ground.
    assert.equal(wash("#2d3142", 1), "#2d3142");
    assert.equal(wash("#2d3142", 0), "#f7f5f1");
    assert.equal(wash("#7c4a55", 0, "#e2e6ed"), "#e2e6ed");
    const mixed = wash("#2d3142", 0.5, "#f7f5f1");
    assert.match(mixed, /^#[0-9a-f]{6}$/);
    const [r] = [Number.parseInt(mixed.slice(1, 3), 16)];
    assert.ok(r > 0x2d && r < 0xf7, "a 50% wash lands between the tincture and the ground");
  });

  await t.test("§4 NO FACE: charges are never arranged as two eyes", () => {
    const one = chargeCentres({ chargeCount: 1 });
    const two = chargeCentres({ chargeCount: 2 });
    const three = chargeCentres({ chargeCount: 3 });
    assert.equal(one.length, 1);
    assert.equal(two.length, 2);
    assert.equal(three.length, 3);

    assert.equal(two[0]?.[0], two[1]?.[0], "two charges share an x — they are a column, not a pair of eyes");
    assert.notEqual(two[0]?.[1], two[1]?.[1], "and they are at different heights");
    for (let i = 0; i < two.length; i++) {
      for (let j = i + 1; j < two.length; j++) {
        const sameRow = two[i]?.[1] === two[j]?.[1];
        assert.equal(sameRow, false, "no two charges are ever drawn at the same height");
      }
    }
    // three charges are a diagonal (bend): x and y both move
    assert.notEqual(three[0]?.[0], three[1]?.[0]);
    assert.notEqual(three[1]?.[0], three[2]?.[0]);
    assert.notEqual(three[0]?.[1], three[2]?.[1]);
  });

  await t.test("§5 every stated state renders a crest, and the words say what it means", () => {
    // The states come from the module: a caller cannot render a state the
    // module does not define, and a sheet cannot show a different set.
    const states: readonly SigilState[] = SIGIL_STATES;
    const s = sigilOf("owner:priya");
    const seen = new Set<string>();
    for (const state of states) {
      const svg = sigilSvg(s, { state, size: 64 });
      assert.ok(svg.startsWith("<svg"), `${state} did not render`);
      assert.ok(svg.includes(`si-sigil--${state}`));
      assert.ok(svg.includes(`aria-label="sigil ${s.fingerprint}`), `${state} lost its readable label`);
      assert.ok(svg.includes(SIGIL_STATE_WORDS[state]), `${state} does not read its own state`);
      seen.add(svg);
    }
    assert.equal(seen.size, states.length, "each state renders differently");
    assert.equal(states.includes("refused") && states.includes("failed"), true,
      "a refusal and a fault are different facts and get different marks");
    assert.notEqual(sigilSvg(s, { state: "refused" }), sigilSvg(s, { state: "failed" }), "refused is not failed");
    assert.equal(new Set(Object.values(SIGIL_STATE_WORDS)).size, states.length, "every state says something different");
    assert.equal(sigilSvg(s, { state: "idle" }), sigilSvg(s, { state: "idle" }), "rendering is a pure function");
    assert.equal(sigilSvg(s, { size: 24 }).includes('width="24"'), true, "the caller's size is honoured");
    assert.equal(sigilSvg(s).includes("<script"), false, "no script can ride a sigil");
  });

  await t.test("§6 the card describes the face in words, and claims nothing it cannot prove", () => {
    const s = sigilOf("peer:acme-corp");
    const traits = sigilTraits(s);
    assert.equal(traits.length, 9);
    assert.equal(sigilSummary(s), traits.join(" · "));
    assert.equal(traits.some((x) => x.includes(s.tincture)), true, "the tincture is named");
    assert.equal(traits.some((x) => x.includes(s.charge)), true, "the charge is named");

    const card = sigilCardHtml(s, { state: "sealed", size: 48 });
    assert.ok(card.includes(s.fingerprint));
    assert.ok(card.includes("<ul>"));
    assert.equal(card.includes("si-sigil-card"), true);
  });

  await t.test("§7 the encoding is wide enough that near-identical faces are rare", () => {
    assert.equal(SIGIL_TILTS.length, 3);
    assert.equal(SIGIL_ENCODING_BITS, 23, "the width is a stated number, not an accident of packing");
    assert.equal(SIGIL_LAYERS.length, 10, "ten layers carry the bits");
    assert.equal(collisionReport(["a", "b"]).bits, SIGIL_ENCODING_BITS, "the report states its own width");
    const bits = SEEDS.slice(0, 60).map((s) => sigilBits(sigilOf(s)));
    assert.equal(new Set(bits).size, 60);
    assert.equal(Math.max(...bits) > 0, true);
    // All-zero encodings would mean a silent collapse of the derivation.
    assert.equal(bits.every((b) => b > 0), true, "no identity collapses to an empty encoding");
  });
});
