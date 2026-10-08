/**
 * Browser stand-in for `node:dgram`.
 *
 * WHY THIS FILE EXISTS. The A2A federation plane speaks UDP: a peer announces
 * itself on a discovery port so a Captain can be found without being told an
 * address. That is a real capability in the DESKTOP build, where the Rust host
 * owns the socket. There is no UDP in a WebView, and this project does not
 * bundle a socket layer to fake one — so the browser build must say so at the
 * moment of use rather than externalise the import and hope nobody noticed.
 *
 * The alternative was worse, and it is the failure mode this file is named
 * after. `node:dgram` was reachable from `a2aFederation.ts` with no alias in
 * `vite.config.ts`, so the bundler quietly left the import as external: the
 * build succeeded, the code shipped, and peer discovery was dead in the browser
 * with no error anywhere. `probe/stubSurface.test.ts` exists precisely to catch
 * that class of defect — a builtin import that escapes the alias table — and it
 * caught this one.
 *
 * `dgram.createSocket()` throws immediately and names the missing capability,
 * so a caller that reaches it reports "UDP peer discovery is unavailable in the
 * browser build" instead of silently never discovering a peer. The desktop build
 * never sees this file; it gets the real `node:dgram`.
 */

function unavailable(what: string): never {
  throw new Error(
    `node:dgram is not available in the browser build — ${what} needs a UDP socket, ` +
      `and a WebView has none. Peer discovery over UDP is a desktop capability; ` +
      `federation from the browser uses an explicit peer address instead. ` +
      `This is stated, not silently skipped.`,
  );
}

export interface Socket {
  bind(port: number, address?: string, callback?: () => void): Socket;
  send(msg: unknown, port: number, address: string, callback?: (err: Error | null) => void): void;
  on(event: string, listener: (...args: unknown[]) => void): Socket;
  close(callback?: () => void): void;
  address(): { address: string; port: number; family: string };
}

export function createSocket(): Socket {
  return unavailable("creating a UDP socket");
}

export function createSocket4(): Socket {
  return unavailable("creating a UDPv4 socket");
}

export function createSocket6(): Socket {
  return unavailable("creating a UDPv6 socket");
}

export function getDefaultPort(): number {
  return unavailable("resolving the default dgram port");
}

/** Re-exported so a named import of the module object also throws. */
export default { createSocket, createSocket4, createSocket6, getDefaultPort };