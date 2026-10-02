import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/fedSigil.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

// src/engine/pureHash.ts
var K = [
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
];
var rotr = (x, n) => (x >>> n | x << 32 - n) >>> 0;
var utf8 = (text) => new TextEncoder().encode(text);
function sha256Bytes(data) {
  const bitLen = data.length * 8;
  const padded = new Uint8Array((data.length + 8 >> 6 << 6) + 64);
  padded.set(data);
  padded[data.length] = 128;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
  let h0 = 1779033703, h1 = 3144134277, h2 = 1013904242, h3 = 2773480762;
  let h4 = 1359893119, h5 = 2600822924, h6 = 528734635, h7 = 1541459225;
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const t1 = h + S1 + ch + K[i] + w[i] >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    h0 = h0 + a >>> 0;
    h1 = h1 + b >>> 0;
    h2 = h2 + c >>> 0;
    h3 = h3 + d >>> 0;
    h4 = h4 + e >>> 0;
    h5 = h5 + f >>> 0;
    h6 = h6 + g >>> 0;
    h7 = h7 + h >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, h0);
  ov.setUint32(4, h1);
  ov.setUint32(8, h2);
  ov.setUint32(12, h3);
  ov.setUint32(16, h4);
  ov.setUint32(20, h5);
  ov.setUint32(24, h6);
  ov.setUint32(28, h7);
  return out;
}
var toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
function pureSha256(text) {
  return toHex(sha256Bytes(utf8(text)));
}

// src/engine/avatarEngine.ts
var AVATAR_INKS = ["#2d3142", "#3a3f52", "#586a66", "#46554f", "#827278", "#695c5e"];
var AVATAR_FIELDS = ["#d8d5db", "#d5dfea", "#e2e6ed", "#c6cdd3"];

// src/engine/federation/sigil.ts
var PINNED_PALETTE = [
  ...AVATAR_INKS,
  ...AVATAR_FIELDS,
  "#7c4a55",
  // atelier wine
  "#b75346",
  // atelier brick
  "#c98a62",
  // atelier brass
  "#a5673b",
  // atelier clay
  "#dda97f",
  // atelier sand
  "#7a6b3a",
  // atelier olive
  "#9cafc7"
  // atelier steel
];
var SIGIL_TINCTURES = {
  iron: "#2d3142",
  slate: "#3a3f52",
  verdigris: "#586a66",
  moss: "#46554f",
  plum: "#827278",
  wine: "#7c4a55",
  brick: "#b75346",
  brass: "#c98a62",
  clay: "#a5673b",
  olive: "#7a6b3a",
  steel: "#9cafc7",
  sand: "#dda97f"
};
var SIGIL_GROUNDS = {
  paper: "#f7f5f1",
  mist: "#e2e6ed",
  ash: "#d8d5db",
  pale: "#d5dfea"
};
var SIGIL_TILTS = [-5, 0, 5];
var FIELDS = ["heater", "lozenge", "rondel"];
var DIVISIONS = ["plain", "bend", "chevron", "pale"];
var SEMES = ["none", "dots", "barry", "lozengy"];
var CHIEFS = ["none", "label", "wall"];
var CHARGES = ["cross", "saltire", "roundel", "lozenge", "estoile", "pile", "mullet"];
var BORDURES = ["none", "engrailed", "double"];
var TINCTURE_NAMES = Object.keys(SIGIL_TINCTURES);
var GROUND_NAMES = Object.keys(SIGIL_GROUNDS);
function wash(hex, amount, base = "#f7f5f1") {
  const parse = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(base);
  const k = Math.min(1, Math.max(0, amount));
  const to = (a, b) => Math.round(a * k + b * (1 - k));
  const hex2 = (n) => n.toString(16).padStart(2, "0");
  return `#${hex2(to(r1 ?? 0, r2 ?? 0))}${hex2(to(g1 ?? 0, g2 ?? 0))}${hex2(to(b1 ?? 0, b2 ?? 0))}`;
}
function deriveBytes(seed) {
  const hex = pureSha256(`vh.fed.sigil.v1:${seed}`);
  const out = [];
  for (let i = 0; i < hex.length; i += 2) out.push(Number.parseInt(hex.slice(i, i + 2), 16));
  return out;
}
function sigilOf(seed) {
  const b = deriveBytes(seed);
  const at = (i) => b[i % b.length] ?? 0;
  return {
    seed,
    field: FIELDS[at(0) % FIELDS.length] ?? "heater",
    division: DIVISIONS[at(1) % DIVISIONS.length] ?? "plain",
    seme: SEMES[at(2) % SEMES.length] ?? "none",
    chief: CHIEFS[at(3) % CHIEFS.length] ?? "none",
    charge: CHARGES[at(4) % CHARGES.length] ?? "cross",
    chargeCount: at(5) % 3 + 1,
    tincture: TINCTURE_NAMES[at(6) % TINCTURE_NAMES.length] ?? "iron",
    ground: GROUND_NAMES[at(7) % GROUND_NAMES.length] ?? "paper",
    bordure: BORDURES[at(8) % BORDURES.length] ?? "none",
    tilt: SIGIL_TILTS[at(9) % SIGIL_TILTS.length] ?? 0,
    fingerprint: fingerprintOf(seed)
  };
}
function fingerprintOf(seed) {
  const hex = pureSha256(`vh.fed.sigil.handle.v1:${seed}`).toUpperCase();
  return [hex.slice(0, 4), hex.slice(4, 8), hex.slice(8, 12), hex.slice(12, 16)].join("-");
}
function sigilTraits(s) {
  return [
    `${s.field} field`,
    s.division === "plain" ? "undivided" : `${s.division} division`,
    s.seme === "none" ? "plain ground" : `sem\xE9 of ${s.seme}`,
    s.chief === "none" ? "no chief" : `chief of ${s.chief}`,
    `${s.charge}${s.chargeCount > 1 ? ` \xD7${s.chargeCount}` : ""}`,
    `${s.tincture} charge`,
    s.bordure === "none" ? "unbordered" : `${s.bordure} bordure`,
    `on ${s.ground}`,
    s.tilt === 0 ? "upright" : s.tilt < 0 ? "tilted left" : "tilted right"
  ];
}
function sigilSummary(s) {
  return sigilTraits(s).join(" \xB7 ");
}
var SIGIL_ENCODING_BITS = 23;
var SIGIL_LAYERS = [
  "field",
  "division",
  "seme",
  "chief",
  "charge",
  "charge count",
  "tincture",
  "ground",
  "bordure",
  "tilt"
];
function sigilBits(s) {
  const idx = (list, v) => Math.max(0, list.indexOf(v));
  return idx(FIELDS, s.field) << 21 | idx(DIVISIONS, s.division) << 19 | idx(SEMES, s.seme) << 17 | idx(CHIEFS, s.chief) << 15 | idx(CHARGES, s.charge) << 12 | s.chargeCount - 1 << 10 | idx(TINCTURE_NAMES, s.tincture) << 6 | idx(GROUND_NAMES, s.ground) << 4 | idx(BORDURES, s.bordure) << 2 | idx(SIGIL_TILTS, s.tilt);
}
function popcount(x) {
  let n = 0;
  let v = x;
  while (v > 0) {
    n += v & 1;
    v >>= 1;
  }
  return n;
}
function sigilDistance(a, b) {
  return popcount(sigilBits(a) ^ sigilBits(b));
}
function collisionReport(seeds) {
  let min = Number.POSITIVE_INFINITY;
  let closest = null;
  const bits = seeds.map((s) => sigilBits(sigilOf(s)));
  const buckets = /* @__PURE__ */ new Set();
  for (const b of bits) buckets.add(b);
  let wellSeparated = 0;
  let pairs = 0;
  for (let i = 0; i < bits.length; i++) {
    for (let j = i + 1; j < bits.length; j++) {
      pairs += 1;
      const d = popcount((bits[i] ?? 0) ^ (bits[j] ?? 0));
      if (d < min) {
        min = d;
        closest = { a: seeds[i] ?? "", b: seeds[j] ?? "" };
      }
      if (d >= 6) wellSeparated += 1;
    }
  }
  return {
    sample: seeds.length,
    bits: SIGIL_ENCODING_BITS,
    minDistance: Number.isFinite(min) ? min : 0,
    closest,
    distinct: buckets.size,
    exactCollisions: seeds.length - buckets.size,
    shareWellSeparated: pairs === 0 ? 1 : wellSeparated / pairs
  };
}
var SIGIL_STATES = ["idle", "thinking", "acting", "gate", "sealed", "refused", "failed"];
var SIGIL_STATE_WORDS = {
  idle: "at rest",
  thinking: "working",
  acting: "acting",
  gate: "awaiting a human",
  sealed: "verified",
  refused: "refused",
  failed: "failed \u2014 the run broke"
};
var INK = "#26231d";
var FIELD_PATHS = {
  heater: "M 16 22 H 84 V 58 C 84 76 68 88 50 94 C 32 88 16 76 16 58 Z",
  lozenge: "M 50 16 L 86 56 L 50 94 L 14 56 Z",
  rondel: "M 16 24 H 84 V 50 A 34 34 0 0 1 50 92 A 34 34 0 0 1 16 50 Z"
};
function insetPath(field, inset) {
  const s = 100 - inset * 2;
  const cx = 50;
  const k = s / 100;
  const scale = (d) => d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_m, x, y) => `${(cx + (Number(x) - cx) * k).toFixed(1)} ${(cx + (Number(y) - cx) * k).toFixed(1)}`);
  return scale(FIELD_PATHS[field]);
}
function divisionPath(division) {
  switch (division) {
    case "plain":
      return null;
    case "bend":
      return "M -20 84 L -20 60 L 120 16 L 120 40 Z";
    case "chevron":
      return "M -10 74 L 50 40 L 110 74 L 110 54 L 50 20 L -10 54 Z";
    case "pale":
      return "M 41 0 H 59 V 100 H 41 Z";
  }
}
function semeMarkup(seme, tincture, chargeCount) {
  if (seme === "none" || chargeCount > 1) return "";
  const parts = [];
  if (seme === "dots") {
    for (let y = 14; y < 94; y += 15) {
      const offset = (y / 15 | 0) % 2 === 0 ? 0 : 7;
      for (let x = 12; x < 94; x += 15) {
        parts.push(`<circle cx="${(x + offset).toFixed(1)}" cy="${y}" r="1.5" fill="${tincture}" opacity="0.38"/>`);
      }
    }
  } else if (seme === "barry") {
    for (let y = 12; y < 96; y += 18) {
      parts.push(`<rect x="-10" y="${y}" width="120" height="3" fill="${tincture}" opacity="0.26"/>`);
    }
  } else {
    for (let y = 14; y < 94; y += 20) {
      const offset = (y / 20 | 0) % 2 === 0 ? 0 : 10;
      for (let x = 12; x < 94; x += 20) {
        const px = x + offset;
        parts.push(`<path d="M ${px} ${y - 4} L ${px + 4} ${y} L ${px} ${y + 4} L ${px - 4} ${y} Z" fill="${tincture}" opacity="0.3"/>`);
      }
    }
  }
  return parts.join("");
}
function bordureMarkup(bordure, field, tincture) {
  if (bordure === "none") return "";
  const path = insetPath(field, 5);
  if (bordure === "double") {
    return `<path d="${path}" fill="none" stroke="${tincture}" stroke-width="1.8" opacity="0.75"/>`;
  }
  return `<path d="${path}" fill="none" stroke="${tincture}" stroke-width="3" stroke-dasharray="1.6 4.4" stroke-linecap="round" opacity="0.85"/>`;
}
function chiefMarkup(chief, tincture) {
  if (chief === "none") return "";
  if (chief === "label") {
    const tabs = [34, 50, 66].map((x) => `<path d="M ${x - 5} 30 h 10 v 7 l -5 -3.5 l -5 3.5 Z" fill="${tincture}"/>`).join("");
    return `<rect x="14" y="24" width="72" height="7" fill="${tincture}"/>${tabs}`;
  }
  const castellations = [22, 38, 54, 70].map((x) => `<rect x="${x}" y="24" width="7" height="8" fill="#f7f5f1"/>`).join("");
  return `<rect x="14" y="24" width="72" height="8" fill="${tincture}"/>${castellations}`;
}
function chargeMarkup(charge, cx, cy, r, fill) {
  switch (charge) {
    case "cross": {
      const a = r * 0.3;
      return `<path d="M ${cx - a} ${cy - r} h ${a * 2} v ${r - a} h ${r - a} v ${a * 2} h ${-(r - a)} v ${r - a} h ${-(a * 2)} v ${-(r - a)} h ${-(r - a)} v ${-(a * 2)} h ${r - a} Z" fill="${fill}"/>`;
    }
    case "saltire":
      return `<path d="M ${cx - r} ${cy - r * 0.55} L ${cx - r * 0.72} ${cy - r} L ${cx + r} ${cy + r * 0.55} L ${cx + r * 0.72} ${cy + r} Z M ${cx + r} ${cy - r * 0.55} L ${cx + r * 0.72} ${cy - r} L ${cx - r} ${cy + r * 0.55} L ${cx - r * 0.72} ${cy + r} Z" fill="${fill}"/>`;
    case "roundel":
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
    case "lozenge":
      return `<path d="M ${cx} ${cy - r} L ${cx + r * 0.7} ${cy} L ${cx} ${cy + r} L ${cx - r * 0.7} ${cy} Z" fill="${fill}"/>`;
    case "estoile": {
      const pts = [];
      for (let i = 0; i < 12; i++) {
        const ang = i / 12 * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.44;
        pts.push(`${(cx + Math.cos(ang) * rr).toFixed(2)},${(cy + Math.sin(ang) * rr).toFixed(2)}`);
      }
      return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
    }
    case "pile":
      return `<path d="M ${cx - r} ${cy + r * 0.7} L ${cx} ${cy - r} L ${cx + r} ${cy + r * 0.7} Z" fill="${fill}"/>`;
    case "mullet": {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const ang = i / 10 * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.46;
        pts.push(`${(cx + Math.cos(ang) * rr).toFixed(2)},${(cy + Math.sin(ang) * rr).toFixed(2)}`);
      }
      return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
    }
  }
}
function chargesMarkup(s, fill) {
  if (s.chargeCount === 1) return chargeMarkup(s.charge, 50, 60, 16, fill);
  if (s.chargeCount === 2) {
    return chargeMarkup(s.charge, 50, 45, 11, fill) + chargeMarkup(s.charge, 50, 74, 11, fill);
  }
  return chargeMarkup(s.charge, 32, 78, 9.5, fill) + chargeMarkup(s.charge, 50, 60, 9.5, fill) + chargeMarkup(s.charge, 68, 42, 9.5, fill);
}
function chargeCentres(s) {
  if (s.chargeCount === 1) return [[50, 60]];
  if (s.chargeCount === 2) return [[50, 45], [50, 74]];
  return [[32, 78], [50, 60], [68, 42]];
}
function crestMarkup(state, tincture) {
  switch (state) {
    case "idle":
      return "";
    case "thinking":
      return `<g fill="${tincture}" opacity="0.9"><circle cx="38" cy="8" r="3.1"/><circle cx="50" cy="8" r="3.1"/><circle cx="62" cy="8" r="3.1"/></g>`;
    case "acting":
      return `<path d="M 39 1.8 L 63 8 L 39 14.2 Z" fill="${tincture}"/>`;
    case "gate":
      return `<g opacity="0.92"><path d="M 44 7 V 4.8 a 6 6 0 0 1 12 0 V 7" fill="none" stroke="${tincture}" stroke-width="2.2" stroke-linecap="round"/><rect x="39" y="6.6" width="22" height="7.4" rx="1.7" fill="${tincture}"/></g>`;
    case "sealed":
      return "";
    case "refused":
      return "";
    case "failed":
      return `<g stroke="${tincture}" stroke-width="2.8" stroke-linecap="round" opacity="0.92"><path d="M 42 3 L 58 15"/><path d="M 58 3 L 42 15"/></g>`;
  }
}
function sigilSvg(s, opts = {}) {
  const size = opts.size ?? 96;
  const state = opts.state ?? "idle";
  const ground = opts.ground ?? SIGIL_GROUNDS[s.ground];
  const tincture = SIGIL_TINCTURES[s.tincture];
  const clipId = `sigil-${s.fingerprint.replace(/-/g, "")}`;
  const field = FIELD_PATHS[s.field];
  const division = divisionPath(s.division);
  const label = opts.title ?? `sigil ${s.fingerprint} \u2014 ${sigilSummary(s)} \u2014 ${SIGIL_STATE_WORDS[state]}`;
  const body = [
    `<defs><clipPath id="${clipId}"><path d="${field}"/></clipPath></defs>`,
    crestMarkup(state, tincture),
    `<g transform="rotate(${s.tilt} 50 56)">`,
    `<path d="${field}" fill="${wash(tincture, 0.2, ground)}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
    `<g clip-path="url(#${clipId})">`,
    division ? `<path d="${division}" fill="${tincture}" opacity="0.2"/>` : "",
    semeMarkup(s.seme, tincture, s.chargeCount),
    chiefMarkup(s.chief, tincture),
    chargesMarkup(s, tincture),
    bordureMarkup(s.bordure, s.field, tincture),
    state === "refused" ? `<path d="M 2 90 L 98 22" stroke="${tincture}" stroke-width="4.5" stroke-linecap="round" opacity="0.9"/>` : "",
    `</g>`,
    `<path d="${field}" fill="none" stroke="${INK}" stroke-width="${state === "sealed" ? 4 : 2.4}" stroke-linejoin="round"/>`,
    `</g>`,
    state === "sealed" ? `<g><circle cx="82" cy="88" r="9" fill="${ground}" stroke="${tincture}" stroke-width="2.2"/><path d="M 78 88 l 2.6 2.8 l 5 -6" stroke="${tincture}" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>` : ""
  ].join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${label}" class="si-sigil si-sigil--${state}">${body}</svg>`;
}
function sigilCardHtml(s, opts = {}) {
  const traits = sigilTraits(s).map((t) => `<li>${t}</li>`).join("");
  return [
    `<figure class="si-sigil-card">`,
    sigilSvg(s, { size: opts.size ?? 96, state: opts.state ?? "idle" }),
    `<figcaption><code>${s.fingerprint}</code><ul>${traits}</ul></figcaption>`,
    `</figure>`
  ].join("");
}

// probe/fedSigil.test.ts
var SEEDS = Array.from({ length: 120 }, (_, i) => `identity:probe-${i}`);
test("federation sigil \u2014 a face that is derived, measured and never selectable", async (t) => {
  await t.test("\xA71 the derivation is the selfimpulse's own SHA-256, and it is total", () => {
    const s = sigilOf("selfimpulse:reykjavik");
    const hex = pureSha256("vh.fed.sigil.v1:selfimpulse:reykjavik");
    assert.equal(hex.length, 64);
    assert.equal(s.field, ["heater", "lozenge", "rondel"][Number.parseInt(hex.slice(0, 2), 16) % 3]);
    assert.equal(s.fingerprint, fingerprintOf("selfimpulse:reykjavik"));
    assert.match(s.fingerprint, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    assert.equal(s.fingerprint, fingerprintOf("selfimpulse:reykjavik"), "the handle is stable");
    assert.notEqual(s.fingerprint, fingerprintOf("selfimpulse:lisbon"));
    for (const layer of ["field", "division", "seme", "chief", "charge", "chargeCount", "tincture", "ground", "bordure", "tilt"]) {
      for (const seed of SEEDS.slice(0, 40)) assert.ok(sigilOf(seed)[layer] !== void 0, `${seed} has no ${layer}`);
    }
  });
  await t.test("\xA72 same identity, same face \u2014 every run; different identity, different face", () => {
    const a = sigilOf("owner:priya");
    const b = sigilOf("owner:priya");
    assert.deepEqual(a, b, "a sigil is a pure function of its identity");
    assert.equal(sigilDistance(sigilOf("owner:priya"), sigilOf("owner:ana")) > 0, true);
    const report = collisionReport(SEEDS);
    assert.equal(report.sample, 120);
    assert.equal(report.distinct, 120, `expected 120 distinct encodings, saw ${report.distinct}`);
    assert.equal(report.exactCollisions, 0, "no two identities in the sample encode identically");
    assert.ok(report.minDistance >= 2, `closest pair was ${report.minDistance} bits apart`);
    assert.ok(report.shareWellSeparated > 0.9, `only ${(report.shareWellSeparated * 100).toFixed(1)}% of pairs differ in >= 6 bits`);
    assert.ok(report.closest !== null);
    const dupes = collisionReport(["a", "a", "b"]);
    assert.equal(dupes.exactCollisions, 1, "an identical input is reported as a collision, not smoothed away");
    assert.equal(dupes.minDistance, 0);
  });
  await t.test("\xA73 the tincture is VH's palette \u2014 never a new hue", () => {
    for (const hex of Object.values(SIGIL_TINCTURES)) {
      assert.ok(PINNED_PALETTE.includes(hex), `${hex} is not a pinned VH token`);
    }
    for (const hex of Object.values(SIGIL_GROUNDS)) {
      assert.ok(PINNED_PALETTE.includes(hex) || hex === "#f7f5f1", `${hex} is not a pinned ground`);
    }
    for (const ink of [...AVATAR_INKS, ...AVATAR_FIELDS]) {
      assert.ok(PINNED_PALETTE.includes(ink), `${ink} missing from the pinned palette`);
    }
    assert.equal(wash("#2d3142", 1), "#2d3142");
    assert.equal(wash("#2d3142", 0), "#f7f5f1");
    assert.equal(wash("#7c4a55", 0, "#e2e6ed"), "#e2e6ed");
    const mixed = wash("#2d3142", 0.5, "#f7f5f1");
    assert.match(mixed, /^#[0-9a-f]{6}$/);
    const [r] = [Number.parseInt(mixed.slice(1, 3), 16)];
    assert.ok(r > 45 && r < 247, "a 50% wash lands between the tincture and the ground");
  });
  await t.test("\xA74 NO FACE: charges are never arranged as two eyes", () => {
    const one = chargeCentres({ chargeCount: 1 });
    const two = chargeCentres({ chargeCount: 2 });
    const three = chargeCentres({ chargeCount: 3 });
    assert.equal(one.length, 1);
    assert.equal(two.length, 2);
    assert.equal(three.length, 3);
    assert.equal(two[0]?.[0], two[1]?.[0], "two charges share an x \u2014 they are a column, not a pair of eyes");
    assert.notEqual(two[0]?.[1], two[1]?.[1], "and they are at different heights");
    for (let i = 0; i < two.length; i++) {
      for (let j = i + 1; j < two.length; j++) {
        const sameRow = two[i]?.[1] === two[j]?.[1];
        assert.equal(sameRow, false, "no two charges are ever drawn at the same height");
      }
    }
    assert.notEqual(three[0]?.[0], three[1]?.[0]);
    assert.notEqual(three[1]?.[0], three[2]?.[0]);
    assert.notEqual(three[0]?.[1], three[2]?.[1]);
  });
  await t.test("\xA75 every stated state renders a crest, and the words say what it means", () => {
    const states = SIGIL_STATES;
    const s = sigilOf("owner:priya");
    const seen = /* @__PURE__ */ new Set();
    for (const state of states) {
      const svg = sigilSvg(s, { state, size: 64 });
      assert.ok(svg.startsWith("<svg"), `${state} did not render`);
      assert.ok(svg.includes(`si-sigil--${state}`));
      assert.ok(svg.includes(`aria-label="sigil ${s.fingerprint}`), `${state} lost its readable label`);
      assert.ok(svg.includes(SIGIL_STATE_WORDS[state]), `${state} does not read its own state`);
      seen.add(svg);
    }
    assert.equal(seen.size, states.length, "each state renders differently");
    assert.equal(
      states.includes("refused") && states.includes("failed"),
      true,
      "a refusal and a fault are different facts and get different marks"
    );
    assert.notEqual(sigilSvg(s, { state: "refused" }), sigilSvg(s, { state: "failed" }), "refused is not failed");
    assert.equal(new Set(Object.values(SIGIL_STATE_WORDS)).size, states.length, "every state says something different");
    assert.equal(sigilSvg(s, { state: "idle" }), sigilSvg(s, { state: "idle" }), "rendering is a pure function");
    assert.equal(sigilSvg(s, { size: 24 }).includes('width="24"'), true, "the caller's size is honoured");
    assert.equal(sigilSvg(s).includes("<script"), false, "no script can ride a sigil");
  });
  await t.test("\xA76 the card describes the face in words, and claims nothing it cannot prove", () => {
    const s = sigilOf("peer:acme-corp");
    const traits = sigilTraits(s);
    assert.equal(traits.length, 9);
    assert.equal(sigilSummary(s), traits.join(" \xB7 "));
    assert.equal(traits.some((x) => x.includes(s.tincture)), true, "the tincture is named");
    assert.equal(traits.some((x) => x.includes(s.charge)), true, "the charge is named");
    const card = sigilCardHtml(s, { state: "sealed", size: 48 });
    assert.ok(card.includes(s.fingerprint));
    assert.ok(card.includes("<ul>"));
    assert.equal(card.includes("si-sigil-card"), true);
  });
  await t.test("\xA77 the encoding is wide enough that near-identical faces are rare", () => {
    assert.equal(SIGIL_TILTS.length, 3);
    assert.equal(SIGIL_ENCODING_BITS, 23, "the width is a stated number, not an accident of packing");
    assert.equal(SIGIL_LAYERS.length, 10, "ten layers carry the bits");
    assert.equal(collisionReport(["a", "b"]).bits, SIGIL_ENCODING_BITS, "the report states its own width");
    const bits = SEEDS.slice(0, 60).map((s) => sigilBits(sigilOf(s)));
    assert.equal(new Set(bits).size, 60);
    assert.equal(Math.max(...bits) > 0, true);
    assert.equal(bits.every((b) => b > 0), true, "no identity collapses to an empty encoding");
  });
});
