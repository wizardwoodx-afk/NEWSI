/**
 * 20.1 — A2A listener hardening. REGRESSION PROBE.
 *
 * Two proven defects, both about the credential and the interface the listener
 * ends up on:
 *
 *  1. `--token ""` disabled authentication entirely. `opts.token ?? …` treats
 *     "" as present, `parseArgv` produces `out.token === ""` from an empty
 *     argument, and then a request with NO Authorization header compared
 *     `"" === ""` and was authorized. Executed proof before the fix:
 *     `{ tokenMinted: false, token: '', presented: '', authorized: true }`.
 *  2. `--host 0.0.0.0` bound every interface. The README promises "no wildcard
 *     option", but the Node host had no allowlist — `args.host` went straight
 *     from argv to `listen()`. The Rust host already refused wildcards
 *     correctly (`a2a_host.rs::resolve_bind`); the Node path did not.
 *
 * These call the real exported functions, so they fail if the guard is removed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveBindHost } from "../src/mission/a2aRuntime";

describe("a2a — bind scope cannot be a wildcard", () => {
  it("refuses 0.0.0.0 (the exploit)", () => {
    assert.throws(() => resolveBindHost("0.0.0.0"), /wildcard/i);
  });

  it("refuses ::, *, and the expanded zero form", () => {
    for (const h of ["::", "*", "0:0:0:0:0:0:0:0", "[::]"]) {
      assert.throws(() => resolveBindHost(h), /wildcard|refusing/i, `refused to refuse ${h}`);
    }
  });

  it("refuses the whole-network forms too", () => {
    // Only 0.0.0.0 (and its IPv6 equivalents) is a genuine multi-homed
    // wildcard. A class-A network address like 1.0.0.0 would fail to bind at
    // all rather than expose every interface, but the runtime refuses it
    // anyway — binding "this network" is never an intention worth honouring.
    for (const h of ["1.0.0.0", "10.0.0.0"]) {
      assert.throws(() => resolveBindHost(h), /wildcard|refusing/i, `refused to refuse ${h}`);
    }
  });

  it("a concrete network address is NOT treated as a wildcard", () => {
    // 192.168.0.0 names one network, not every interface. Refusing it would be
    // overreach beyond the threat, so it is allowed to reach the OS and fail
    // there if the address is not assigned to anything.
    assert.equal(resolveBindHost("192.168.0.0"), "192.168.0.0");
  });

  it("accepts loopback, including the aliases", () => {
    for (const h of ["127.0.0.1", "localhost", "::1", undefined, "", "  "]) {
      assert.equal(resolveBindHost(h), "127.0.0.1");
    }
  });

  it("accepts a CONCRETE lan address — the documented feature still works", () => {
    assert.equal(resolveBindHost("192.168.1.20"), "192.168.1.20");
    assert.equal(resolveBindHost("10.1.2.3"), "10.1.2.3");
  });

  it("refuses a hostname: a name can resolve anywhere", () => {
    assert.throws(() => resolveBindHost("my-host.local"), /concrete IP address/i);
  });

  it("refuses 'lan' rather than pretending, and says what to pass", () => {
    // Mapping lan -> 127.0.0.1 would be a lie wearing the feature's clothes:
    // the operator asked to reach the network and got an unreachable listener.
    assert.throws(() => resolveBindHost("lan"), /concrete address/i);
  });
});
