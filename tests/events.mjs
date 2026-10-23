// Editar evento pela tela: o formulário de edição manda as mudanças pro banco. Sem Supabase (a gravação é simulada).
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
const browser = await puppeteer.launch(launchArgs());
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 860 });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.evaluateOnNewDocument(() => { localStorage.setItem("estoura-welcome", "1"); });
let fails = 0;
const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
const E = (fn, ...a) => page.evaluate(fn, ...a);
const wait = ms => new Promise(r => setTimeout(r, ms));
await page.goto(`http://localhost:${srv.address().port}/`, { waitUntil: "load" });
await wait(500);

// um evento de verdade, criado por você, daqui a 3 dias
await E(() => {
  const start = new Date(); start.setDate(start.getDate() + 3); start.setHours(15, 0, 0, 0);
  EVENTS.push({ type: "event", real: true, mine: true, uuid: "ev-1", id: "e_ev-1", title: "Surf no domingo", short: "Surf no domingo", interest: "surf", city: "Santos",
    start, days: 3, time: "15:00", place: "Praia do Gonzaga", going: [], c: [-23.96, -46.33] });
  window.saved = null;
  window.estouraUpdateEvent = (old, e) => { window.saved = { old: old.uuid, title: e.title, days: e.days, time: e.time, place: e.place, city: e.city, c: e.c }; };
  openEvent(EVENTS[EVENTS.length - 1]);
});
ok(await E(() => !!document.getElementById("ev-edit")), "evento seu mostra o botão Editar");
await page.click("#ev-edit");
ok(await E(() => document.querySelector(".sheet h3").textContent === "Editar evento" && !!document.getElementById("ev-date")), "abre o formulário de edição com a data");

// janela com campos abre no topo (o teclado do celular não cobre) e acompanha a área visível
await E(() => { document.documentElement.style.setProperty("--vvh", "430px"); document.documentElement.classList.add("kb"); });
ok(await E(() => { const r = document.querySelector(".sheet").getBoundingClientRect(); return !!document.querySelector(".scrim.top") && r.top < 10 && r.bottom <= 432; }), "janela com campos abre no topo e cabe acima do teclado");
await E(() => { document.documentElement.style.removeProperty("--vvh"); document.documentElement.classList.remove("kb"); });
await E(() => {
  const d = new Date(); d.setDate(d.getDate() + 5);
  document.getElementById("ev-title").value = "Surf e churrasco";
  document.getElementById("ev-date").value = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  document.getElementById("ev-time").value = "09:30";
  document.getElementById("ev-city").value = "Ubatuba";
});
await page.click('#ev-form button[type="submit"]');
await wait(200);
const s = await E(() => window.saved);
ok(!!s, "Salvar manda a edição pro banco");
ok(s && s.old === "ev-1" && s.title === "Surf e churrasco", "com o evento certo e o nome novo: " + JSON.stringify(s));
ok(s && s.days === 5 && s.time === "09:30", "com a data (daqui a 5 dias) e a hora novas");
ok(s && s.city === "Ubatuba" && s.c[0] === -23.43, "com a cidade nova e as coordenadas dela");
ok(await E(() => !document.querySelector(".sheet")), "a janela fecha depois de salvar");
ok(errors.length === 0, "sem erros na página" + (errors.length ? ": " + errors.join(" | ") : ""));

await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
