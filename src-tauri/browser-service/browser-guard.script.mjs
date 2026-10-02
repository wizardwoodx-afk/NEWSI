/**
 * SelfImpulse browser network guard — the injected enforcement shim.
 *
 * SOURCE ADOPTION (real code, adapted). Adopted from:
 *   github.com/vercel-labs/agent-browser @ d01253d9db28
 *   cli/src/native/network.rs -> fn domain_filter_script()
 *   Apache-2.0, Copyright Vercel, Inc.  (see THIRD-PARTY-NOTICES.md)
 *
 * This file is evaluated INSIDE the page, before the page's own scripts run.
 * It wraps the browser's network APIs so a page cannot reach a host that
 * SelfImpulse has not allowed — including attempts it constructs itself, because
 * the API it would use is already wrapped.
 *
 * Installed as `__installSelfImpulseNetworkGuard(allowedDomains)` by
 * `buildNetworkGuardScript()` in src/security/browserGuard.ts.
 *
 * Two properties are load-bearing and are the reason for adopting this design:
 *
 *   1. WORKERS RE-INSTALL THE GUARD. A Worker runs in its own global scope, so
 *      a patch applied to the page does not apply inside it. Worker bootstrap
 *      is therefore wrapped in a Blob that re-installs this guard first. If the
 *      page's CSP blocks that Blob the worker REFUSES TO START. There is
 *      deliberately no unguarded fallback.
 *
 *   2. WebRTC IS BLOCKED OUTRIGHT. STUN/TURN can reach hosts the allowlist
 *      never sees, so it cannot be filtered by URL and is refused instead.
 *
 * SelfImpulse divergence: an EMPTY allowlist is a CLOSED policy. Upstream returns
 * "allowed" for an empty list, which is correct for an operator-set CLI flag and
 * wrong for a governed runtime whose safe default is to reach nothing.
 */
function __installSelfImpulseNetworkGuard(allowedDomains) {
  const ALLOWED = Array.isArray(allowedDomains) ? allowedDomains.slice() : [];
  const g = globalThis;
  const report =
    g.__selfimpulseGuardReport && typeof g.__selfimpulseGuardReport.push === "function"
      ? g.__selfimpulseGuardReport
      : null;

  // SelfImpulse: empty allowlist means CLOSED.
  function hostAllowed(hostname) {
    if (ALLOWED.length === 0) return false;
    const h = String(hostname || "").toLowerCase();
    for (const p of ALLOWED) {
      if (p.startsWith("*.")) {
        const suffix = p.slice(2);
        if (h === suffix || h.endsWith("." + suffix)) return true;
      } else if (h === p) {
        return true;
      }
    }
    return false;
  }

  function securityError(message) {
    if (report) { try { report.push({ at: Date.now(), reason: message }); } catch (_) {} }
    if (typeof DOMException === "function") return new DOMException(message, "SecurityError");
    const e = new Error(message);
    e.name = "SecurityError";
    return e;
  }

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (typeof URL === "function" && input instanceof URL) return input.href;
    if (input && typeof input.url === "string") return input.url;
    return String(input);
  }

  function checkUrl(url, apiName) {
    const u = new URL(url, g.location && g.location.href ? g.location.href : "about:blank");
    const schemeOk = u.protocol === "http:" || u.protocol === "https:";
    if (schemeOk && !hostAllowed(u.hostname)) {
      throw securityError(apiName + " blocked: " + u.hostname);
    }
    return u.href;
  }

  function checkWebSocketUrl(url, apiName) {
    const u = new URL(url, g.location && g.location.href ? g.location.href : "about:blank");
    if (u.protocol === "http:") u.protocol = "ws:";
    if (u.protocol === "https:") u.protocol = "wss:";
    if ((u.protocol === "ws:" || u.protocol === "wss:") && !hostAllowed(u.hostname)) {
      throw securityError(apiName + " blocked: " + u.hostname);
    }
    return u.href;
  }

  // --- worker bootstrap (fails closed) -------------------------------------
  function checkWorkerScriptUrl(scriptURL, apiName) {
    const u = new URL(scriptURL, g.location && g.location.href ? g.location.href : "about:blank");
    if (u.protocol === "blob:") {
      try {
        const inner = new URL(u.pathname);
        if (inner.hostname && !hostAllowed(inner.hostname)) {
          throw securityError(apiName + " blocked: " + inner.hostname);
        }
      } catch (e) { if (e && e.name === "SecurityError") throw e; }
    } else if (u.hostname && !hostAllowed(u.hostname)) {
      throw securityError(apiName + " blocked: " + u.hostname);
    }
    return u.href;
  }

  function workerBootstrapUrl(scriptURL, options, apiName) {
    if (!g.Blob || !g.URL || typeof g.URL.createObjectURL !== "function") {
      throw securityError(apiName + " blocked: worker bootstrap APIs are unavailable");
    }
    const absolute = checkWorkerScriptUrl(scriptURL, apiName);
    const isModule = options && typeof options === "object" && options.type === "module";
    // Re-install the guard in the worker's own scope before the real script.
    const install =
      "(" + __installSelfImpulseNetworkGuard.toString() + ")(" + JSON.stringify(ALLOWED) + ");\\n";
    const source = install + (isModule
      ? "await import(" + JSON.stringify(absolute) + ");\\n"
      : "importScripts(" + JSON.stringify(absolute) + ");\\n");

    // A page whose CSP refuses blob: URLs makes createObjectURL throw. That
    // throw is NOT a SecurityError, so it would escape as a raw Error and the
    // refusal would never be reported. It is converted here so that EVERY
    // reason a worker cannot be started safely is a reported SecurityError —
    // which is what "fails closed" means: one error shape, always reported,
    // and never a silent fallback to an unguarded worker.
    let blobUrl;
    try {
      blobUrl = g.URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
    } catch (e) {
      throw securityError(
        apiName + " blocked: worker bootstrap was refused (" +
        (e && e.message ? e.message : "unknown error") + ")"
      );
    }
    if (!blobUrl) {
      throw securityError(apiName + " blocked: worker bootstrap produced no URL");
    }
    return blobUrl;
  }

  function constructWorker(OrigCtor, scriptURL, options, apiName) {
    const checked = checkWorkerScriptUrl(scriptURL, apiName);
    const bootstrap = workerBootstrapUrl(checked, options, apiName);
    // Fail closed: no unguarded fallback exists by design.
    return new OrigCtor(bootstrap, options);
  }


  const OrigWorker = g.Worker;
  if (typeof OrigWorker === "function") {
    g.Worker = function (scriptURL, options) {
      return constructWorker(OrigWorker, scriptURL, options, "Worker");
    };
    g.Worker.prototype = OrigWorker.prototype;
  }

  const OrigSharedWorker = g.SharedWorker;
  if (typeof OrigSharedWorker === "function") {
    g.SharedWorker = function (scriptURL, options) {
      return constructWorker(OrigSharedWorker, scriptURL, options, "SharedWorker");
    };
    g.SharedWorker.prototype = OrigSharedWorker.prototype;
  }

  const OrigImportScripts = g.importScripts;
  if (typeof OrigImportScripts === "function") {
    g.importScripts = function () {
      const urls = Array.prototype.slice.call(arguments).map(function (u) {
        try { return checkUrl(u, "importScripts"); }
        catch (e) { if (e && e.name === "SecurityError") throw e; return u; }
      });
      return OrigImportScripts.apply(this, urls);
    };
  }

  const OrigFetch = g.fetch;
  if (typeof OrigFetch === "function") {
    g.fetch = function (input, init) {
      try {
        if (typeof input === "string") return OrigFetch.call(this, checkUrl(input, "Fetch"), init);
        checkUrl(requestUrl(input), "Fetch");
      } catch (e) {
        if (e && e.name === "SecurityError") return Promise.reject(e);
      }
      return OrigFetch.apply(this, arguments);
    };
  }

  const OrigXHR = g.XMLHttpRequest;
  if (typeof OrigXHR === "function" && OrigXHR.prototype && OrigXHR.prototype.open) {
    const origOpen = OrigXHR.prototype.open;
    OrigXHR.prototype.open = function (method, url) {
      let checked = url;
      try { checked = checkUrl(url, "XMLHttpRequest"); }
      catch (e) { if (e && e.name === "SecurityError") throw e; }
      const args = Array.prototype.slice.call(arguments);
      args[1] = checked;
      return origOpen.apply(this, args);
    };
  }

  const OrigWS = g.WebSocket;
  if (typeof OrigWS === "function") {
    g.WebSocket = function (url, protocols) {
      let checked = url;
      try { checked = checkWebSocketUrl(url, "WebSocket"); }
      catch (e) { if (e && e.name === "SecurityError") throw e; }
      return new OrigWS(checked, protocols);
    };
    g.WebSocket.prototype = OrigWS.prototype;
  }

  const OrigES = g.EventSource;
  if (OrigES) {
    g.EventSource = function (url, opts) {
      let checked = url;
      try { checked = checkUrl(url, "EventSource"); }
      catch (e) { if (e && e.name === "SecurityError") throw e; }
      return new OrigES(checked, opts);
    };
    g.EventSource.prototype = OrigES.prototype;
  }

  const beacon = g.navigator && g.navigator.sendBeacon;
  if (beacon) {
    g.navigator.sendBeacon = function (url, data) {
      let checked = url;
      try { checked = checkUrl(url, "Beacon"); }
      catch (e) { return false; }
      return beacon.call(g.navigator, checked, data);
    };
  }

  // WebRTC is blocked outright: STUN/TURN can reach hosts the allowlist
  // never sees, so it cannot be filtered by URL and is refused instead.
  function blockPeerConnection(name) {
    if (typeof g[name] !== "function") return;
    const Blocked = function () {
      throw securityError(name + " blocked while domain filtering is active");
    };
    Object.defineProperty(Blocked, "prototype", {
      value: Object.freeze(Object.create(null)),
      writable: false
    });
    try {
      Object.defineProperty(g, name, { value: Blocked, writable: false, configurable: false });
    } catch (_) { g[name] = Blocked; }
  }
  blockPeerConnection("RTCPeerConnection");
  blockPeerConnection("webkitRTCPeerConnection");
}
