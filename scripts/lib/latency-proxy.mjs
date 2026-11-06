/**
 * Byte-level TCP proxy that adds latency and jitter while preserving ordering,
 * which is what a real TCP/WSS path does. Browser devtools throttling does not
 * reliably apply to WebSockets, so the playability suites use this instead.
 *
 * Each direction receives half of the configured RTT. Jitter is uniform and
 * applied per chunk, and a chunk can never overtake an earlier one.
 */
import net from "node:net";

export function startLatencyProxy({ listenPort, targetPort, rttMs = 0, jitterMs = 0, host = "127.0.0.1" }) {
  const state = { rttMs, jitterMs, chunks: 0, connections: 0 };
  const sockets = new Set();

  const delayFor = () =>
    Math.max(0, state.rttMs / 2 + (Math.random() * 2 - 1) * (state.jitterMs / 2));

  const pipe = (from, to) => {
    let releaseAt = 0;
    from.on("data", (chunk) => {
      state.chunks += 1;
      const now = performance.now();
      releaseAt = Math.max(releaseAt, now + delayFor());
      setTimeout(() => {
        if (!to.destroyed) to.write(chunk);
      }, Math.max(0, releaseAt - now));
    });
    from.on("end", () => {
      setTimeout(() => to.end(), Math.max(0, releaseAt - performance.now()) + 1);
    });
    from.on("error", () => to.destroy());
    from.on("close", () => to.destroy());
  };

  const server = net.createServer((client) => {
    state.connections += 1;
    client.setNoDelay(true);
    const upstream = net.connect({ port: targetPort, host });
    upstream.setNoDelay(true);
    sockets.add(client);
    sockets.add(upstream);
    client.on("close", () => sockets.delete(client));
    upstream.on("close", () => sockets.delete(upstream));
    pipe(client, upstream);
    pipe(upstream, client);
  });

  return new Promise((resolve) => {
    server.listen(listenPort, host, () => {
      resolve({
        state,
        set({ rttMs: nextRtt, jitterMs: nextJitter }) {
          if (nextRtt !== undefined) state.rttMs = nextRtt;
          if (nextJitter !== undefined) state.jitterMs = nextJitter;
        },
        dropAll() {
          for (const socket of sockets) socket.destroy();
        },
        close() {
          for (const socket of sockets) socket.destroy();
          return new Promise((done) => server.close(done));
        },
      });
    });
  });
}
