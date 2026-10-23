// Simula a chegada de um push no service worker (via DevTools): app aberto = sem notificação; app fechado = notificação.
import puppeteer from "puppeteer-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { PUB, launchArgs } from "./lib.mjs";
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const srv = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split("?")[0]); if (f === "/") f = "/estoura.html";
  const p = path.join(PUB, f);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const origin = `http://localhost:${srv.address().port}`;
const browser = await puppeteer.launch(launchArgs());
await browser.defaultBrowserContext().overridePermissions(origin, ["notifications"]);
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { localStorage.setItem("estoura-welcome", "1"); });
let fails = 0;
const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const cdp = await page.createCDPSession();
const regs = new Map();
cdp.on("ServiceWorker.workerRegistrationUpdated", e => e.registrations.forEach(r => regs.set(r.registrationId, r)));
await cdp.send("ServiceWorker.enable");
await page.goto(origin + "/", { waitUntil: "load" });
await page.evaluate(async () => { await navigator.serviceWorker.ready; });
await wait(500);
const regId = [...regs.keys()][0];
ok(!!regId, "service worker registrado");
const push = d => cdp.send("ServiceWorker.deliverPushMessage", { origin, registrationId: regId, data: JSON.stringify(d) });
const notifs = () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => ({ tag: n.tag, title: n.title, body: n.body, url: n.data && n.data.url })));

// 1) app aberto e visível: o service worker não mostra nada (o app mostra o alerta dele)
await push({ title: "Bruno", body: "Oi!", tag: "c:1#1", url: "/?chat=c:1" });
await wait(600);
ok((await notifs()).length === 0, "com o app aberto na tela, o push não gera notificação do sistema");

// 2) app fechado (nenhuma janela do site): notificação aparece
await page.goto("about:blank");
await wait(800);
await push({ title: "Bruno", body: "Oi! Bora surfar?", tag: "c:1#2", url: "/?chat=c:1" });
await wait(800);
await push({ title: "Bruno", body: "Oi! Bora surfar?", tag: "c:1#2", url: "/?chat=c:1" }); // repetido (mesma etiqueta)
await push({ title: "Surf no domingo", body: "Carla: levo prancha", tag: "e_9#3", url: "/?chat=e_9" });
await wait(800);
await page.goto(origin + "/", { waitUntil: "load" });
await page.evaluate(async () => { await navigator.serviceWorker.ready; });
const ns = await notifs();
ok(ns.length === 2, "com o app fechado, push vira notificação (a mesma etiqueta não duplica): " + JSON.stringify(ns.map(n => n.tag)));
const n1 = ns.find(n => n.tag === "c:1#2");
ok(n1 && n1.title === "Bruno" && n1.body === "Oi! Bora surfar?" && n1.url === "/?chat=c:1", "título, texto e destino da notificação");
console.log(fails ? `\n${fails} FALHA(S)` : "\nTUDO OK");
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
