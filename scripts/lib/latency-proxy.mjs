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
    // One FIFO and one timer per direction. Separate setTimeouts can fire out of
    // order across timer durations, which would reorder bytes on a TCP stream.
    const queue = [];
    let timer = null;
    let lastRelease = 0;
    let ended = false;
    const drain = () => {
      timer = null;
      const now = performance.now();
      while (queue.length > 0 && queue[0].at <= now + 0.5) {
        const { chunk } = queue.shift();
        if (!to.destroyed) to.write(chunk);
      }
      if (queue.length > 0) {
        timer = setTimeout(drain, Math.max(0, queue[0].at - performance.now()));
      } else if (ended && !to.destroyed) {
        to.end();
      }
    };
    from.on("data", (chunk) => {
      state.chunks += 1;
      lastRelease = Math.max(lastRelease, performance.now() + delayFor());
      queue.push({ at: lastRelease, chunk });
      if (timer === null) timer = setTimeout(drain, Math.max(0, queue[0].at - performance.now()));
    });
    from.on("end", () => {
      ended = true;
      if (timer === null) drain();
    });
    from.on("error", () => to.destroy());
    from.on("close", () => {
      if (queue.length === 0) to.destroy();
    });
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
