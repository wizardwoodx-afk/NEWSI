# Specialist routing: Catalog → Top-K → Mission → Floor

## The two numbers reviewers keep asking about

Two numbers appear in the code and they mean different things. Mixing them
up is how a "3-agent" benchmark turns into a "25 agents run amok" story — so
this note exists to be pointed at.

**Top-K = 3 candidate specialists** chosen from the Catalog at routing time.

**Crew cap = 25 live agent seats** on the floor at execution time.

Those are not the same number, they are not in tension, and they sit at
different layers.

## 1. Catalog (static)

The Catalog (`src/engine/specialists/registry.ts`) is the static registry of
every specialist the product knows about. It is a data file, not a live pool.
Adding a specialist to the catalog is a code change; it makes that
specialist eligible to be routed to; it does not launch or reserve anything.

## 2. Top-K = 3 (planning)

When the Captain routes a user ask, the catalog is scored against the
mission's keywords, risk tier and required capabilities, and exactly **3**
specialist ids are selected as the candidate set:

- The lead specialist (best single match for the mission).
- Up to two supporting specialists (cross-domain capability the lead
  declares it does not own).

This Top-K=3 is the hard ceiling on *who is planned into the mission* — the
receipt shows these three ids, the plan names them, and the Gate card is
issued against them. Three is small on purpose: a plan with more named
specialists than that is a plan the Captain cannot defend in a receipt, and
the gate refuses to approve what the human cannot review.

## 3. Mission expansion (at execution start)

Each of those three specialists can, at *its own* discretion, call in
co-workers for narrow sub-tasks the way a real lead does — a Research lead
pulls a fact-checker, a Filing lead pulls a forms clerk. These sub-tasks
are desks, not leads: they have a bounded, named output and hand the result
back up.

This is the expansion step. It is bounded by the floor cap below, and every
expansion is signed into the receipt chain (you can see every seat that was
mustered, who called them in, and why).

## 4. Floor cap = 25 (execution)

`CREW_MAX = 25` in `src/mission/office.ts` is the absolute ceiling on how
many live agent seats can be occupied *concurrently* on the floor
(`11WORKSPACE`) during one mission. It is a hard safety bound on compute
spend, token burn and run-away recursion, not a routing target:

- 25 seats is roughly one healthy shift in a real small office.
- A single-fact ask (e.g. "what time is it in Mumbai") routinely musters 1
  seat.
- A compound build (app + docs + mail) might hit 12–18 seats across desks.
- No mission can ever muster more than 25; the office enforces it and the
  probe (`probe/workspace.test.ts`) pins it.

So the three numbers answer different questions:

| Question                     | Answer        | Where                              |
|------------------------------|---------------|------------------------------------|
| How many specialists exist?   | Catalog size  | `src/engine/specialists/registry.ts` |
| How many are named in a plan? | ≤ 3           | `src/engine/` (Top-K selector)       |
| How many can run at once?     | ≤ 25          | `CREW_MAX` in `src/mission/office.ts` |

The promise to the user is: *the receipt always names exactly which 3
specialists were planned, and every seat that was ever mustered sits on the
same receipt under one of them.* Nothing runs anonymously; nothing runs
without a chain back to a lead the human approved.
