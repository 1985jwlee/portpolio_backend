const t0 = performance.now(); let got = 0;
const res = await fetch("https://speed.cloudflare.com/__down?bytes=30000000");
for await (const c of res.body as unknown as AsyncIterable<Uint8Array>) got += c.length;
const s = (performance.now() - t0) / 1000;
console.log(JSON.stringify({ bytes: got, sec: +s.toFixed(2), mbPerSec: +(got / 1048576 / s).toFixed(2) }));
