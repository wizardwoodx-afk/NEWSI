/**
 * probe/reachBatch.test.ts — the 200-specialist federation batch.
 *
 * The batch is a generated snapshot of a reviewed spec: forty industry
 * domains, each staffed at five stations of work. This suite is its drift
 * gate AND its honesty gate — the batch must equal its spec, must not collide
 * with a single id the fleet already owns, and must not have quietly joined
 * the registry behind the owner's back.
 *
 *   §1 the snapshot is the spec — regenerate and it must be byte-identical
 *   §2 40 × 5, with the census the spec promises
 *   §3 disjoint from all four existing benches — an additive batch, not a hijack
 *   §4 every entry is a real entry: capabilities, vocabulary, prompt, tier
 *   §5 additive means additive: the registry's own numbers do not move
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  REACH_BATCH_DOMAINS, REACH_BATCH_PROVENANCE, REACH_BATCH_STATIONS, STATION_RISK,
  batchEntryId, buildReachBatch, reachBatchCensus,
} from "../src/engine/reach/batchSpec";
import { REACH_BATCH_SPECIALISTS } from "../src/engine/reach/reachBatch";
import { SPECIALISTS, listSpecialists, catalogStats } from "../src/engine/registry";
import { BROADER_SPECIALISTS } from "../src/engine/broaderBench";
import { REACH_SPECIALISTS } from "../src/engine/reachBench";
import { MATURED_SPECIALISTS } from "../src/engine/maturityBench";

test("reach batch — 200 industry specialists that do not disturb the fleet", async (t) => {
  await t.test("§1 the snapshot is exactly what the spec builds", () => {
    const built = buildReachBatch();
    assert.equal(REACH_BATCH_SPECIALISTS.length, built.length);
    assert.equal(JSON.stringify(REACH_BATCH_SPECIALISTS), JSON.stringify(built), "snapshot drifted from batchSpec — run: node tools/generate-reach-batch.mjs");
    assert.deepEqual(
      REACH_BATCH_SPECIALISTS.map((e) => e.id),
      built.map((e) => e.id),
      "order is part of the snapshot: domain-major, then station",
    );
  });

  await t.test("§2 forty domains, five stations, and the census the spec states", () => {
    assert.equal(REACH_BATCH_DOMAINS.length, 40);
    assert.equal(REACH_BATCH_STATIONS.length, 5);
    const census = reachBatchCensus(REACH_BATCH_SPECIALISTS);
    assert.equal(census.total, 200);
    assert.equal(census.domains, 40);
    assert.deepEqual(census.byStation, { assess: 40, design: 40, build: 40, verify: 40, sustain: 40 });
    assert.deepEqual(census.byRisk, { safe: 120, risky: 40, critical: 40 }, "risk follows the station");
    assert.equal(census.byRisk.safe + census.byRisk.risky + census.byRisk.critical, census.total);

    const categories = Object.keys(census.byCategory);
    assert.ok(categories.length >= 8, `the batch should span the fleet's categories, saw ${categories.length}`);
    for (const d of REACH_BATCH_DOMAINS) {
      assert.equal(REACH_BATCH_SPECIALISTS.filter((e) => e.id.startsWith(`${d.slug}.`)).length, 5, `${d.slug} is not staffed at five stations`);
    }
  });

  await t.test("§3 disjoint from every bench the fleet already ships", () => {
    const existing = new Set([
      ...SPECIALISTS.map((s) => s.id),
      ...BROADER_SPECIALISTS.map((s) => s.id),
      ...REACH_SPECIALISTS.map((s) => s.id),
      ...MATURED_SPECIALISTS.map((s) => s.id),
    ]);
    const batchIds = REACH_BATCH_SPECIALISTS.map((e) => e.id);
    assert.equal(new Set(batchIds).size, batchIds.length, "ids are unique inside the batch");
    const collisions = batchIds.filter((id) => existing.has(id));
    assert.deepEqual(collisions, [], `the batch must not shadow fleet ids: ${collisions.join(", ")}`);
    for (const d of REACH_BATCH_DOMAINS) {
      const byName = [...existing].filter((id) => id === d.slug || id.startsWith(`${d.slug}.`));
      assert.deepEqual(byName, [], `${d.slug} is already owned by the fleet`);
    }
  });

  await t.test("§4 every entry is a specified specialist, not a placeholder", () => {
    for (const e of REACH_BATCH_SPECIALISTS) {
      assert.equal(e.provenance, REACH_BATCH_PROVENANCE);
      assert.equal(e.riskTier, STATION_RISK[e.id.split(".").pop() as (typeof REACH_BATCH_STATIONS)[number]], `${e.id} carries the wrong tier for its station`);
      assert.equal(e.capabilities.length, 2, `${e.id} must state exactly two capabilities`);
      for (const c of e.capabilities) assert.ok(c.length > 40, `${e.id} has a thin capability sentence: ${c}`);
      assert.ok(e.keywords.length >= 5, `${e.id} has thin routing vocabulary`);
      for (const k of e.keywords) assert.equal(k, k.toLowerCase(), `${e.id} keyword not lower-case: ${k}`);
      assert.ok(e.systemPrompt.length > 120, `${e.id} prompt is too short to bind behaviour`);
      const domain = REACH_BATCH_DOMAINS.find((d) => e.id.startsWith(`${d.slug}.`));
      assert.ok(domain, `${e.id} has no domain`);
      if (domain) {
        assert.ok(e.name.includes(domain.name), `${e.id} name does not name its domain`);
        assert.ok(e.systemPrompt.includes(domain.name), `${e.id} prompt does not name its domain`);
        assert.ok(e.systemPrompt.includes(domain.mission), `${e.id} prompt lost its domain mission`);
      }
      assert.equal(/^[a-z0-9-]+\.[a-z]+$/.test(e.id), true, `${e.id} is not <domain>.<station>`);
      if (domain) {
        const station = e.id.split(".").pop() ?? "";
        assert.equal(e.id, batchEntryId(domain, station as (typeof REACH_BATCH_STATIONS)[number]), `${e.id} is not the id the spec builds`);
      }
    }
  });

  await t.test("§5 the batch is additive: the registry's own numbers do not move", () => {
    const stats = catalogStats();
    assert.equal(stats.count, SPECIALISTS.length, "the registry reports what it holds");
    assert.equal(listSpecialists().length, SPECIALISTS.length, "listSpecialists is unchanged by this module");
    const registered = new Set(SPECIALISTS.map((s) => s.id));
    for (const e of REACH_BATCH_SPECIALISTS) {
      assert.equal(registered.has(e.id), false, `${e.id} leaked into the registry without an owner decision`);
    }
    assert.equal(
      REACH_BATCH_SPECIALISTS.some((e) => listSpecialists().some((s) => s.id === e.id)),
      false,
      "no batch entry is reachable through the registry until the owner wires it",
    );
  });
});
