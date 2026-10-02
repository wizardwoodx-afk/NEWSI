/**
 * probe/fedFleet.test.ts — the fleet claim, made falsifiable.
 *
 * "2,140 specialists" is marketing until someone can say which are wired and
 * which are catalogued. This suite pins the arithmetic, the drift gate on each
 * generated snapshot, disjointness across all THREE registered benches, and the
 * two facts that keep the number honest: the registered benches are NOT routed,
 * and no surface can state the total without the breakdown.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FEDERATION_BATCH_DOMAINS, FEDERATION_BATCH_PROVENANCE,
  buildFederationBatch, federationBatchCensus, federationEntryId,
} from "../src/engine/federation/federationSpec";
import { FEDERATION_BATCH_SPECIALISTS } from "../src/engine/federation/federationBatch";
import {
  ESTABLISHED_SPECIALISTS, REACH_REGISTERED, FEDERATION_REGISTERED, REGULATED_REGISTERED, FLEET_SPECIALISTS,
  ESTABLISHED_SIZE, REACH_REGISTERED_SIZE, FEDERATION_REGISTERED_SIZE, REGULATED_REGISTERED_SIZE, REGISTERED_SIZE, FLEET_SIZE,
  fleetClaim, routedFleet, unroutedIds, fleetBreakdown,
} from "../src/engine/federation/fleet";
import { SPECIALISTS, catalogStats } from "../src/engine/registry";
import { REACH_BATCH_SPECIALISTS } from "../src/engine/reach/reachBatch";
import { REACH_BATCH_STATIONS } from "../src/engine/reach/batchSpec";
import {
  REGULATED_BATCH_DOMAINS, REGULATED_BATCH_PROVENANCE,
  buildRegulatedBatch, regulatedBatchCensus, regulatedEntryId,
} from "../src/engine/federation/regulatedSpec";
import { REGULATED_BATCH_SPECIALISTS } from "../src/engine/federation/regulatedBatch";
import {
  REGULATED_DISCLAIMER, ACTIVATION_REQUIREMENTS, judgeActivation, activationGaps, regulatedNotice,
} from "../src/engine/federation/regulatedPolicy";

/* The domains the two EARLIER registered benches already claimed, so the third
   cannot re-use one and inflate the count. Derived from the batches themselves,
   not from a hand-kept list. */
const REACH_BATCH_DOMAINS_SLUGS = [...new Set(REACH_BATCH_SPECIALISTS.map((s) => s.id.split(".")[0]))];

import * as fs from "node:fs";
import * as path from "node:path";
import { generateOwnerKeysWeb } from "../src/engine/authorityWeb";
import { keyHandle } from "../src/engine/federation/identity";
import {
  issueRegulatedActivation, verifyRegulatedActivation, activationRecord, activationDigest,
  ACTIVATION_ATTESTATION, ACTIVATION_NOT_ATTESTED, type SignedRegulatedActivation,
} from "../src/engine/federation/regulatedPolicy";

declare const SI_ROOT: string | undefined;
const PROBE_ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();
test("federation fleet — 2,140 catalogued, stated as 1,500 established + 640 registered", async (t) => {
  await t.test("§1 every snapshot IS its spec, byte for byte", () => {
    const fed = buildFederationBatch();
    assert.equal(JSON.stringify(FEDERATION_BATCH_SPECIALISTS), JSON.stringify(fed),
      "snapshot drifted from federationSpec — run: node tools/generate-batch.mjs federation");
    const reg = buildRegulatedBatch();
    assert.equal(JSON.stringify(REGULATED_BATCH_SPECIALISTS), JSON.stringify(reg),
      "snapshot drifted from regulatedSpec — run: node tools/generate-batch.mjs regulated");
  });

  await t.test("§2 the arithmetic is exact and nothing is counted twice", () => {
    assert.equal(ESTABLISHED_SIZE, SPECIALISTS.length);
    assert.equal(ESTABLISHED_SPECIALISTS.length, ESTABLISHED_SIZE);
    assert.equal(REACH_REGISTERED_SIZE, REACH_BATCH_SPECIALISTS.length);
    assert.equal(FEDERATION_REGISTERED_SIZE, FEDERATION_BATCH_SPECIALISTS.length);
    assert.equal(REGULATED_REGISTERED_SIZE, REGULATED_BATCH_SPECIALISTS.length);
    assert.equal(REGISTERED_SIZE, REACH_REGISTERED_SIZE + FEDERATION_REGISTERED_SIZE + REGULATED_REGISTERED_SIZE);
    assert.equal(REGISTERED_SIZE, 640);
    assert.equal(FLEET_SIZE, 2_140);
    assert.equal(FLEET_SIZE, ESTABLISHED_SIZE + REGISTERED_SIZE);
    assert.equal(FLEET_SPECIALISTS.length, FLEET_SIZE);

    const claim = fleetClaim();
    assert.equal(claim.established, ESTABLISHED_SIZE);
    assert.equal(claim.registered, REGISTERED_SIZE);
    assert.equal(claim.fleet, FLEET_SIZE);
    assert.equal(claim.routed, ESTABLISHED_SIZE, "the claim says how many are fielded today");

    /* The ORDER is part of the claim: the routed number leads, the registered
       bench is named as registered, and the total arrives last. A sentence that
       puts 1,560 first invites "1,560 active specialists", which this product
       does not have. */
    assert.equal(claim.sentence,
      "1,500 established specialists + 640 registered specialists — 2,140 catalogued, 1,500 routed today");
    assert.ok(claim.sentence.indexOf("1,500 established") < claim.sentence.indexOf("2,140"),
      "the routed number is stated before the total");
    assert.equal(/\b2,140 (active|specialists are|fielded|routed)\b/.test(claim.sentence), false,
      "the total is never presented as the active bench");
    assert.equal(claim.sentence.includes(String(FLEET_SIZE - 1)), false, "the sentence must not name a neighbouring count");
  });


  await t.test("§2b THE PROVENANCE FILE STATES THE SAME CENSUS THE CODE DOES — drift fails the gate", () => {
    /* The reviewer found `verify/BUILD-INFO.txt` still carrying the 1,560 census while
       the build ships 2,140 — release-record drift that versionDrift did not catch,
       because it pins versions and counts, not the fleet sentence. This is the pin
       that closes it: the file a reader opens to identify the artifact must state the
       same fleet the code does. */
    const info = fs.readFileSync(path.join(PROBE_ROOT, "verify", "BUILD-INFO.txt"), "utf8");
    assert.equal(/1,560 census/.test(info), false, "BUILD-INFO still calls the census 1,560 — that is the 19.6.0 number, not this build's");
    const line = /^fleet: (.+)$/m.exec(info);
    assert.ok(line, "verify/BUILD-INFO.txt must state the fleet on one `fleet: ` line, so a reader sees it without hunting");
    const stated = line[1];
    const claim = fleetClaim();
    assert.match(stated, /2,140/, `BUILD-INFO's fleet line does not carry this build's 2,140: ${stated}`);
    assert.match(stated, /1,500/, "…and not the routed count");
    assert.match(stated, /640/, "…and not the registered count");
    assert.ok(stated.includes(String(claim.established)) || stated.includes("1,500"), "BUILD-INFO and fleet.ts must agree on the established count");
  });

  await t.test("§3 no id collides across the six benches", () => {
    const breakdown = fleetBreakdown();
    assert.deepEqual(breakdown.duplicates, [], `duplicate ids: ${breakdown.duplicates.join(", ")}`);
    const ids = new Set(FLEET_SPECIALISTS.map((s) => s.id));
    assert.equal(ids.size, FLEET_SPECIALISTS.length, "the fleet has no duplicate id");
    /* Three registered benches, none of which may re-use a slug or an id from
       another — the failure this guards is a "new" bench that quietly duplicates
       an existing specialist and inflates the count.

       Two separate checks, because they answer two different questions:
         · IDS are the routing key: no id may exist twice anywhere in the fleet.
         · SLUGS are the domain claim: the three benches' 40 + 42 + 46 domains
           must be 128 distinct domains, so "46 more domains" is a real widening
           rather than a re-slice of the same ground. */
    const idsSoFar = new Set([...SPECIALISTS, ...REACH_BATCH_SPECIALISTS].map((s) => s.id));
    const batchSlugs = new Set(REACH_BATCH_DOMAINS_SLUGS);
    assert.equal(batchSlugs.size, 40, "the reach bench claims 40 domains");

    for (const d of FEDERATION_BATCH_DOMAINS) {
      assert.equal(idsSoFar.has(d.slug), false, `${d.slug} is already an id in the fleet`);
      assert.equal(batchSlugs.has(d.slug), false, `${d.slug} was claimed by an earlier bench`);
      batchSlugs.add(d.slug);
      for (const station of REACH_BATCH_STATIONS) {
        assert.equal(idsSoFar.has(federationEntryId(d, station)), false, `${d.slug}.${station} is already owned`);
        idsSoFar.add(federationEntryId(d, station));
      }
    }
    for (const d of REGULATED_BATCH_DOMAINS) {
      assert.equal(idsSoFar.has(d.slug), false, `${d.slug} is already an id in the fleet`);
      assert.equal(batchSlugs.has(d.slug), false, `${d.slug} was claimed by an earlier bench`);
      batchSlugs.add(d.slug);
      for (const station of REACH_BATCH_STATIONS) {
        assert.equal(idsSoFar.has(regulatedEntryId(d, station)), false, `${d.slug}.${station} is already owned`);
        idsSoFar.add(regulatedEntryId(d, station));
      }
    }
    assert.equal(batchSlugs.size, 128, "128 distinct domains across the three registered benches");
    assert.deepEqual(breakdown.byProvenance, {
      "si-18.0.0-seed": 460,
      "si-19.4.0-broader": 160,
      "si-19.5.1-reach": 140,
      "si-19.5.1-matured": 390,
      "si-19.5.6-reach-batch": 200,
      [FEDERATION_BATCH_PROVENANCE]: 210,
      [REGULATED_BATCH_PROVENANCE]: 230,
      "si-19.7.2.1-silicon": 350,
    });
  });

  await t.test("§4 every entry is a real specialist, and the census is the spec's", () => {
    const census = federationBatchCensus(FEDERATION_BATCH_SPECIALISTS);
    assert.equal(FEDERATION_BATCH_DOMAINS.length, 42);
    assert.equal(census.domains, 42);
    assert.equal(census.total, 210);
    assert.deepEqual(census.byStation, { assess: 42, design: 42, build: 42, verify: 42, sustain: 42 });
    assert.deepEqual(census.byRisk, { safe: 126, risky: 42, critical: 42 });
    assert.equal(Object.keys(census.byCategory).length, 14, "the batch spans every category the fleet uses");

    for (const e of FEDERATION_BATCH_SPECIALISTS) {
      assert.equal(e.provenance, FEDERATION_BATCH_PROVENANCE);
      assert.equal(e.capabilities.length, 2);
      for (const c of e.capabilities) assert.ok(c.length > 40, `${e.id} capability too thin: ${c}`);
      assert.ok(e.keywords.length >= 4, `${e.id} has thin routing vocabulary`);
      assert.ok(e.systemPrompt.length > 120, `${e.id} prompt is too short to bind behaviour`);
      assert.equal(/^[a-z0-9-]+\.[a-z]+$/.test(e.id), true, `${e.id} is not <domain>.<station>`);
      const domain = FEDERATION_BATCH_DOMAINS.find((d) => e.id.startsWith(`${d.slug}.`));
      assert.ok(domain, `${e.id} has no domain`);
      if (domain) {
        const station = e.id.split(".").pop() ?? "";
        assert.equal(e.id, federationEntryId(domain, station as (typeof REACH_BATCH_STATIONS)[number]));
        assert.ok(e.name.includes(domain.name));
        assert.ok(e.systemPrompt.includes(domain.mission), `${e.id} lost its domain mission`);
      }
    }
  });

  await t.test("§4b A CATALOG ENTRY IS NOT REGULATORY AUTHORITY — activation is defined, not assumed", () => {
    /* The reviewer's product note, taken as a constraint: regulated domains must stay
       behind explicit enablement AND a named jurisdiction and context, and the product
       must never let a catalog entry read as authority. */
    assert.match(REGULATED_DISCLAIMER, /a catalog entry is not regulatory authority/);
    assert.equal(ACTIVATION_REQUIREMENTS.length, 3);
    assert.deepEqual(ACTIVATION_REQUIREMENTS.map((r) => r.id), ["owner-enablement", "jurisdiction", "context"]);

    const NOW = 1_760_000_000_000;
    const good = {
      domains: ["avionics-software", "courts-judiciary"],
      enabledBy: "priya",
      jurisdiction: "IN",
      context: "advisory" as const,
      renewBy: NOW + 90 * 24 * 3600 * 1000,
    };
    const ok = judgeActivation(good, NOW);
    assert.equal(ok.ok, true, JSON.stringify(ok));
    if (ok.ok) {
      assert.match(ok.attests, /priya enabled 2 regulated domain\(s\) as advisory under IN/);
      assert.match(ok.notAttested, /that this jurisdiction or any authority in it has accepted, licensed or approved/);
      assert.equal(ok.activation.domains.length, 2);
    }
    assert.deepEqual(activationGaps(good, NOW), []);

    /* Every way of leaving it vague is refused, by name, and the gap is named too. */
    const cases: Array<[string, Partial<typeof good>, string]> = [
      ["no-owner", { ...good, enabledBy: "  " }, "no-owner"],
      ["no-domains", { ...good, domains: [] }, "no-domains"],
      ["no-jurisdiction", { ...good, jurisdiction: " " }, "no-jurisdiction"],
      ["weak-jurisdiction", { ...good, jurisdiction: "x" }, "weak-jurisdiction"],
      ["no-context", { ...good, context: undefined }, "no-context"],
      ["no-renewal", { ...good, renewBy: undefined }, "no-renewal"],
      ["expired", { ...good, renewBy: NOW - 1 }, "expired"],
    ];
    for (const [name, activation, reason] of cases) {
      const verdict = judgeActivation(activation as Partial<typeof good>, NOW);
      assert.equal(verdict.ok, false, `${name} was accepted`);
      if (!verdict.ok) {
        assert.equal(verdict.reason, reason);
        assert.ok(verdict.detail.length > 40, `${name} refusal says too little to act on`);
      }
      assert.equal(activationGaps(activation as Partial<typeof good>, NOW).length, 1, `${name} named no gap`);
    }
    assert.equal(judgeActivation(null, NOW).ok, false, "no activation at all enables nothing");

    /* The notice says both halves: catalogued, not routed, and what it is not. */
    const notice = regulatedNotice(REGULATED_BATCH_SPECIALISTS.length);
    assert.match(notice, /230 regulated-field specialist\(s\) are catalogued and NOT routed/);
    assert.match(notice, /not regulatory authority/);
    assert.equal(/authorised|approved|licensed to operate/i.test(notice), false, "the notice never claims authority");
  });

  await t.test("§4c ACTIVATION IS OWNER-KEY BOUND — a name is not an authorisation", async () => {
    /* The reviewer's second condition: when a regulated bench becomes routable, the
       activation must be signed by the owner's authority key and bound to the exact
       content — enabledBy, jurisdiction, context, renewal and the domain list. */
    const keys = await generateOwnerKeysWeb();
    const other = await generateOwnerKeysWeb();
    const NOW = 1_760_000_000_000;
    const body = {
      domains: ["courts-judiciary", "avionics-software"],
      enabledBy: "priya",
      jurisdiction: "IN",
      context: "advisory" as const,
      renewBy: NOW + 90 * 24 * 3600 * 1000,
    };

    const issued = await issueRegulatedActivation(body, keys, NOW);
    assert.equal(issued.ok, true, JSON.stringify(issued));
    if (!issued.ok) return;
    const signed: SignedRegulatedActivation = issued.activation;
    assert.match(signed.signature, /^ecdsa-p256:/);

    const good = await verifyRegulatedActivation(signed, keys.publicKeyPem, NOW);
    assert.equal(good.ok, true, JSON.stringify(good));
    if (good.ok) {
      assert.equal(good.attests, ACTIVATION_ATTESTATION);
      assert.equal(good.notAttested, ACTIVATION_NOT_ATTESTED);
    }

    const record = activationRecord(signed, { publicKeyPem: keys.publicKeyPem, handle: keyHandle(keys.publicKeyPem) });
    assert.equal(record.signedBy, "owner-authority-key");
    assert.equal(record.ownerKeyHandle, keyHandle(keys.publicKeyPem));
    assert.deepEqual(record.domains, ["avionics-software", "courts-judiciary"], "the record lists the domains the signature covers");
    assert.match(record.attests, /enabled this regulated bench, naming the human who authorised it/);
    assert.match(record.notAttested, /has accepted, licensed or approved this use/);
    assert.match(record.digest, /^[0-9a-f]{64}$/);
    assert.equal(record.digest, activationDigest(signed));

    /* An UNSIGNED activation is refused by name — the whole point of this path. */
    const unsigned = await verifyRegulatedActivation({ ...body }, keys.publicKeyPem, NOW);
    assert.equal(unsigned.ok, false);
    if (!unsigned.ok) {
      assert.equal(unsigned.reason, "unsigned-activation");
      assert.match(unsigned.detail, /a name is not an authorisation/);
    }

    /* A signature that does not cover the content cannot be re-aimed at another bench. */
    const tampered: SignedRegulatedActivation = { ...signed, jurisdiction: "EU" };
    const tamperVerdict = await verifyRegulatedActivation(tampered, keys.publicKeyPem, NOW);
    assert.equal(tamperVerdict.ok, false);
    if (!tamperVerdict.ok) assert.equal(tamperVerdict.reason, "bad-signature");
    const movedDomain: SignedRegulatedActivation = { ...signed, domains: ["public-health-surveillance"] };
    const movedVerdict = await verifyRegulatedActivation(movedDomain, keys.publicKeyPem, NOW);
    assert.equal(movedVerdict.ok, false, "the domain list is inside the signed body, so it cannot be swapped");

    /* Someone else's key does not verify it. */
    const foreign = await verifyRegulatedActivation(signed, other.publicKeyPem, NOW);
    assert.equal(foreign.ok, false);
    if (!foreign.ok) assert.equal(foreign.reason, "bad-signature");

    /* Completeness is still judged first: signing does not launder an incomplete activation. */
    const incomplete = await issueRegulatedActivation({ ...body, jurisdiction: "" }, keys, NOW);
    assert.equal(incomplete.ok, false);
    if (!incomplete.ok) assert.equal(incomplete.reason, "no-jurisdiction");

    /* And the clock still applies. */
    const lapsed = await verifyRegulatedActivation(signed, keys.publicKeyPem, body.renewBy + 1);
    assert.equal(lapsed.ok, false);
    if (!lapsed.ok) assert.equal(lapsed.reason, "expired");
  });
  await t.test("§5 registered means registered: not routed, and said out loud", () => {
    assert.equal(routedFleet().length, ESTABLISHED_SIZE);
    assert.equal(unroutedIds().length, REGISTERED_SIZE);
    assert.equal(REGULATED_REGISTERED.every((s) => unroutedIds().includes(s.id)), true,
      "all 230 new specialists are catalogued and NOT routed");
    assert.equal(unroutedIds().length, FLEET_SIZE - ESTABLISHED_SIZE);
    const wired = new Set(SPECIALISTS.map((s) => s.id));
    for (const s of [...REACH_REGISTERED, ...FEDERATION_REGISTERED, ...REGULATED_REGISTERED]) {
      assert.equal(wired.has(s.id), false, `${s.id} leaked into the router without the owner's decision`);
    }
    assert.equal(catalogStats().count, SPECIALISTS.length, "the registry still reports exactly what it holds");
    assert.notEqual(catalogStats().count, FLEET_SIZE, "the registry's own count does not silently absorb the registered benches");
    assert.equal(catalogStats().count, ESTABLISHED_SIZE, "and it still equals the established bench exactly");
  });
});
