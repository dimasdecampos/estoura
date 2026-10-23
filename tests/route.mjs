// Testa a rota /api/push de verdade (Next em produção) com um Supabase falso e um serviço de push falso.
import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import { ROOT } from "./lib.mjs";
import { fileURLToPath } from "node:url";
import webpush from "web-push";
const FIX = fileURLToPath(new URL("./fixtures/", import.meta.url));
const env = Object.fromEntries((fs.existsSync(`${ROOT}/.env.local`) ? fs.readFileSync(`${ROOT}/.env.local`, "utf8") : "").split("\n").filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.split("=")[0], l.slice(l.indexOf("=") + 1).trim()]));
if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) { const k = webpush.generateVAPIDKeys(); env.VAPID_PUBLIC_KEY = k.publicKey; env.VAPID_PRIVATE_KEY = k.privateKey; env.VAPID_SUBJECT = "mailto:teste@example.com"; } // sem .env.local: chaves só de teste
let fails = 0;
const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
const body = req => new Promise(r => { const c = []; req.on("data", d => c.push(d)); req.on("end", () => r(Buffer.concat(c))); });

// serviço de push falso
const pushes = [];
const pushSrv = https.createServer({ key: fs.readFileSync(FIX + "test-key.pem"), cert: fs.readFileSync(FIX + "test-cert.pem") }, async (req, res) => { pushes.push({ headers: req.headers, size: (await body(req)).length }); res.writeHead(201); res.end(); }).listen(0);
const pushUrl = `https://localhost:${pushSrv.address().port}/push/abc`;
// chaves de um aparelho de verdade (p256dh = chave pública P-256 não comprimida, auth = 16 bytes)
const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
const sub = { p256dh: ecdh.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") };

// supabase falso
let mode = "ok";
const rpcCalls = [];
const sbSrv = http.createServer(async (req, res) => {
  const b = (await body(req)).toString();
  rpcCalls.push({ url: req.url, auth: req.headers.authorization, body: b });
  res.setHeader("content-type", "application/json");
  if (mode === "denied") { res.writeHead(401); return res.end(JSON.stringify({ code: "42501", message: "sem permissao" })); }
  if (mode === "empty") { res.writeHead(200); return res.end("[]"); }
  res.writeHead(200);
  res.end(JSON.stringify([{ endpoint: pushUrl, p256dh: sub.p256dh, auth: sub.auth, title: "Bruno", body: "Oi!", tag: "c:1#1", url: "/?chat=c:1" }]));
}).listen(0);

const port = 3917;
const ENVF = ROOT + "/.env.production.local", LOCAL = ROOT + "/.env.local", AWAY = ROOT + "/.env.local.testbak";
if (fs.existsSync(AWAY)) { console.log("sobrou um .env.local.testbak de uma rodada anterior; restaure-o antes"); process.exit(2); }
if (fs.existsSync(LOCAL)) fs.renameSync(LOCAL, AWAY);
const restore = () => { try { fs.unlinkSync(ENVF); } catch {} try { if (fs.existsSync(AWAY)) fs.renameSync(AWAY, LOCAL); } catch {} };
process.on("exit", restore); process.on("SIGINT", () => process.exit(1)); process.on("uncaughtException", e => { console.error(e); process.exit(1); });
const writeEnv = extra => fs.writeFileSync(ENVF, [`NEXT_PUBLIC_SUPABASE_URL=http://localhost:${sbSrv.address().port}`, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=pk", ...Object.entries({ VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, ...extra }).map(([k, v]) => k + "=" + v)].join("\n") + "\n");
const start = (extra) => new Promise((resolve, reject) => {
  writeEnv(extra);
  const p = spawn("npx", ["next", "start", "-p", String(port)], { cwd: ROOT, shell: true, env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0" } });
  let out = ""; const t = setTimeout(() => reject(new Error("next nao subiu: " + out)), 60000);
  p.stdout.on("data", d => { out += d; if (/Ready|started server/i.test(out)) { clearTimeout(t); resolve(p); } });
  p.stderr.on("data", d => { out += d; });
});
const post = (b, headers = {}) => fetch(`http://localhost:${port}/api/push`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof b === "string" ? b : JSON.stringify(b) });
const kill = p => new Promise(r => { spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { shell: true }).on("exit", r); });

writeEnv({});
console.log("compilando o site com a URL do Supabase falso...");
execSync("npm run build", { cwd: ROOT, stdio: "ignore" });
let srv = await start({});
await new Promise(r => setTimeout(r, 800));
let r = await post({ kind: "c", id: "1" });
ok(r.status === 401, "sem login: 401");
r = await post({ kind: "x", id: "1" }, { authorization: "Bearer abc.def.ghi" });
ok(r.status === 400, "tipo inválido: 400");
r = await post({ kind: "c", id: "1; drop table" }, { authorization: "Bearer abc.def.ghi" });
ok(r.status === 400, "id com lixo: 400");
r = await post("não é json", { authorization: "Bearer abc.def.ghi" });
ok(r.status === 400, "corpo que não é JSON: 400");
ok(rpcCalls.length === 0, "pedidos inválidos nem chegam ao banco");

r = await post({ kind: "c", id: "7" }, { authorization: "Bearer meu.token.jwt" });
let j = await r.json();
ok(r.status === 200 && j.sent === 1, "pedido válido envia 1 aviso: " + JSON.stringify(j));
const rc = rpcCalls.find(c => c.url.includes("push_targets"));
ok(rc && rc.auth === "Bearer meu.token.jwt" && JSON.parse(rc.body).p_kind === "c" && JSON.parse(rc.body).p_ref === "7", "a rota chama push_targets com o login de quem enviou");
ok(pushes.length === 1, "o serviço de push recebeu 1 aviso");
const ph = pushes[0] ? pushes[0].headers : {};
ok(/^vapid t=.+, k=/.test(ph.authorization || "") && (ph.authorization || "").includes(env.VAPID_PUBLIC_KEY), "aviso assinado com a chave VAPID do site");
ok(ph["content-encoding"] === "aes128gcm" && ph.ttl === "86400" && ph.urgency === "high", "conteúdo criptografado, vale por 24h, urgente");

mode = "empty"; pushes.length = 0;
r = await post({ kind: "c", id: "8" }, { authorization: "Bearer a.b.c" }); j = await r.json();
ok(j.sent === 0 && pushes.length === 0, "sem destinatário (ou já avisado): nada é enviado");
mode = "denied";
r = await post({ kind: "c", id: "9" }, { authorization: "Bearer a.b.c" });
ok(r.status === 401, "banco recusa (não foi quem enviou): 401");
await kill(srv);

// sem chaves VAPID: desligado, sem erro
rpcCalls.length = 0; pushes.length = 0; mode = "ok";
srv = await start({ VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "" });
await new Promise(r => setTimeout(r, 800));
r = await post({ kind: "c", id: "7" }, { authorization: "Bearer a.b.c" }); j = await r.json();
ok(j.disabled === true && pushes.length === 0 && rpcCalls.length === 0, "sem as chaves VAPID: responde 'disabled' e não faz nada");
const cfgJs = await (await fetch(`http://localhost:${port}/config.js`)).text();
ok(!/vapid/.test(cfgJs), "config.js sem VAPID quando não configurado");
await kill(srv);
srv = await start({});
await new Promise(r => setTimeout(r, 800));
const cfg2 = await (await fetch(`http://localhost:${port}/config.js`)).text();
ok(cfg2.includes(env.VAPID_PUBLIC_KEY) && !cfg2.includes(env.VAPID_PRIVATE_KEY), "config.js entrega só a chave PÚBLICA");
await kill(srv);
sbSrv.close(); pushSrv.close();
console.log(fails ? `\n${fails} FALHA(S)` : "\nTUDO OK");
process.exit(fails ? 1 : 0);
