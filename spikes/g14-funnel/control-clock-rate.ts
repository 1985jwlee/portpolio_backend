const token = process.env.G14_TOKEN!;
const base = "https://qd.tail91f132.ts.net";
async function sample() {
  const t0 = performance.now(); const w0 = Date.now();
  const r = await (await fetch(`${base}/echo?k=${token}`)).json() as { now: number };
  const rtt = performance.now() - t0;
  return { perf: performance.now() - rtt / 2, wall: w0 + rtt / 2, server: r.now, rtt };
}
const a = await sample();
await new Promise((r) => setTimeout(r, 40000));
const b = await sample();
const dServer = (b.server - a.server) / 1000, dPerf = (b.perf - a.perf) / 1000, dWall = (b.wall - a.wall) / 1000;
console.log(JSON.stringify({ serverSec: +dServer.toFixed(3), clientMonotonicSec: +dPerf.toFixed(3), clientWallSec: +dWall.toFixed(3), monotonicVsServer: +(dPerf / dServer).toFixed(4), wallVsServer: +(dWall / dServer).toFixed(4) }));
