// Tela de quem ainda não entrou: bolhas reais com quantidade de pessoas e tamanho proporcional. Sem login.
import puppeteer from "puppeteer-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { PUB, OUT, launchArgs } from "./lib.mjs";

let mode = "ok"; // "ok" = banco responde; "sem-sql" = migração 0012 ainda não rodada
const rows = [
  { id: "surf", name: "Surf", parent_id: null, hue: 190, week_count: 10, people: 80, total: 100, custom: false, places: [] },
  { id: "futebol", name: "Futebol", parent_id: null, hue: 130, week_count: 6, people: 20, total: 100, custom: false, places: [] },
  { id: "yoga", name: "Yoga", parent_id: null, hue: 300, week_count: 0, people: 2, total: 100, custom: false, places: [] },
  { id: "cinema", name: "Cinema", parent_id: null, hue: 345, week_count: 0, people: 0, total: 100, custom: false, places: [] },
  { id: "surf/longboard", name: "Longboard", parent_id: "surf", hue: 166, week_count: 0, people: 5, total: 100, custom: false, places: [] },
];
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/config.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(`window.ESTOURA_CONFIG={url:"http://localhost:${srv.address().port}/sb",key:"k"};`); }
  if (u.pathname === "/sb/rest/v1/rpc/public_interest_stats") {
    if (mode === "sem-sql") { res.writeHead(404, { "content-type": "application/json" }); return res.end('{"message":"function not found"}'); }
    res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(rows));
  }
  if (u.pathname.startsWith("/sb/")) { res.writeHead(200, { "content-type": "application/json" }); return res.end("[]"); }
  const f = u.pathname === "/" ? "/estoura.html" : u.pathname, p = path.join(PUB, f);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": p.endsWith(".html") ? "text/html; charset=utf-8" : "text/javascript" });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const url = `http://localhost:${srv.address().port}/`;
const browser = await puppeteer.launch(launchArgs());
let fails = 0;
const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function open() {
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 860 });
  page.on("pageerror", e => errors.push(e.message));
  await page.evaluateOnNewDocument(() => { localStorage.setItem("estoura-welcome", "1"); });
  await page.goto(url, { waitUntil: "load" });
  await wait(1500);
  return page;
}
const errors = [];

let page = await open();
const E = fn => page.evaluate(fn);
ok(await E(() => window.estouraAuthed === false), "visitante: sem login");
ok(await E(() => INTERESTS.map(i => i.id).sort().join()) === rows.map(r => r.id).sort().join(), "visitante vê as bolhas reais do banco (não as de exemplo)");
ok(await E(() => count(byId("surf")) === 80 && count(byId("futebol")) === 20 && count(byId("yoga")) === 2 && count(byId("surf/longboard")) === 5), "cada bolha mostra a quantidade de pessoas (surf 80, futebol 20, yoga 2, longboard 5)");
const r = await E(() => { rebuild(true); items.forEach(it => { it.dr = targetR(it); }); return { surf: targetR(byId("surf")), futebol: targetR(byId("futebol")), yoga: targetR(byId("yoga")), cinema: targetR(byId("cinema")) }; });
ok(r.surf > r.futebol && r.futebol > r.yoga && r.yoga >= r.cinema, `tamanho proporcional à quantidade: surf ${r.surf.toFixed(0)} > futebol ${r.futebol.toFixed(0)} > yoga ${r.yoga.toFixed(0)} ≥ cinema ${r.cinema.toFixed(0)}`);
ok(await E(() => state.lv.size === 0 && document.querySelector("#pop-count b").textContent === "0"), "visitante não tem nenhuma bolha curtida (nada de likes)");
ok(await E(() => byId("surf").week === 10 && trending().length === 0 && TREND.size === 0 && document.getElementById("trend").textContent.trim() === ""), "visitante não vê as bolhas em destaque (Em alta), mesmo com novidades na semana");
ok(await E(() => { window.estouraAuthed = true; renderTrend(); const t = document.getElementById("trend").textContent; window.estouraAuthed = false; renderTrend(); return /Em alta/.test(t) && /Surf/.test(t) && TREND.size === 0; }), "quem está logado continua vendo (Em alta: Surf, Futebol)");
// aviso pra quem curte sem estar logado
const nudge = () => E(() => !document.getElementById("nudge").hidden);
ok(!(await nudge()), "aviso de login começa escondido");
await E(() => setLevel(byId("surf"), 1, true));
ok(await nudge() && await E(() => /salvar suas bolhas/.test(document.getElementById("nudge").textContent) && /matches/.test(document.getElementById("nudge").textContent)), "1ª curtida de visitante mostra o aviso: entrar pra salvar as bolhas e achar matches");
await page.screenshot({ path: path.join(OUT, "aviso-login.png") });
await page.click("#nudge-x");
ok(!(await nudge()), "o X fecha o aviso");
await E(() => { for (const id of ["futebol", "yoga", "cinema", "surf/longboard"]) setLevel(byId(id), 1, true); createBubble("Sexta Curtida", null); });
ok(!(await nudge()), "da 2ª à 6ª curtida não incomoda de novo");
await E(() => createBubble("Setima Curtida", null));
ok(await nudge(), "na 7ª curtida lembra de novo");
await E(() => { window.estouraSignIn = () => { window.__signin = true; }; });
await page.click("#nudge-go");
ok(await E(() => window.__signin === true) && !(await nudge()), "o botão Entrar chama o login do Google e fecha o aviso");
await E(() => { window.estouraAuthed = true; newLikes = 6; createBubble("Logado Curte", null); });
ok(!(await nudge()), "quem já está logado nunca vê o aviso");
await E(() => { window.estouraAuthed = false; });
await page.screenshot({ path: path.join(OUT, "visitante.png") });
await page.close();

// banco sem a migração 0012: continua com as bolhas de exemplo
mode = "sem-sql";
page = await open();
ok(await E(() => INTERESTS.length > 30 && byId("viagens") && count(byId("viagens")) === 0), "sem a migração 0012, segue com as bolhas de exemplo (sem erro)");
ok(errors.length === 0, "sem erros no console: " + JSON.stringify(errors));
console.log(fails ? `\n${fails} FALHA(S)` : "\nTUDO OK");
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
