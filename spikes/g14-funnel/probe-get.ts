const host = "qd.tail91f132.ts.net";
const token = process.env.G14_TOKEN!;
const req = [`GET /echo?k=${token} HTTP/1.1`, `Host: ${host}`, "Connection: close", "", ""].join("\r\n");
let buf = "";
await new Promise<void>((res) => {
  const t = setTimeout(res, 8000);
  Bun.connect({ hostname: host, port: 443, tls: true, socket: {
    open(s) { s.write(req); },
    data(_s, d) { buf += Buffer.from(d).toString("latin1"); if (buf.includes("\r\n\r\n")) { clearTimeout(t); res(); } },
    close() { clearTimeout(t); res(); }, error(_s, e) { buf += "ERR " + e; clearTimeout(t); res(); },
  } });
});
console.log(buf.split("\r\n\r\n")[0] || "(응답 없음)");
