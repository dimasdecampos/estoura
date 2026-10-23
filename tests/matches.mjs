// Matches (3 + ver mais), mensagens não lidas, alerta, notificação do sistema, links diretos e dicas. Sem Supabase.
import puppeteer from "puppeteer-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { PUB, OUT, launchArgs } from "./lib.mjs";
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
const ctx = browser.defaultBrowserContext();
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 860 });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.evaluateOnNewDocument(() => { localStorage.setItem("estoura-welcome", "1"); });
let fails = 0;
const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
const E = (fn, ...a) => page.evaluate(fn, ...a);
const wait = ms => new Promise(r => setTimeout(r, ms));
await page.goto(origin + "/", { waitUntil: "load" });
await wait(600);

// pessoas de teste que combinam com você
await E(() => {
  setLevel(byId("surf"), 1, true);
  const nomes = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gabi"];
  nomes.forEach((n, i) => REAL.push({ id: "r_" + i, uid: "u" + i, name: n + " Teste", city: "Santos", real: true, shy: true, lv: new Map([["surf", 1], ...(i < 3 ? [["viagens", 1]] : [])]), conn: null }));
  setView("matches"); renderAll();
});
const cards = () => E(() => [...document.querySelectorAll("#match-list .card")].map(c => c.querySelector(".name").textContent));
const moreBtn = () => E(() => { const b = document.querySelector("#match-list [data-more]"); return b ? b.textContent.trim() : null; });

let c = await cards();
ok(c.length === 3, "Matches mostra só 3 de 7 pessoas: " + c.join(", "));
ok(await moreBtn() === "Ver mais 4 pessoas", "botão: " + await moreBtn());
ok(await E(() => document.querySelector("#match-list .card .chips").children.length <= 4), "cada card mostra no máximo 3 bolhas (+N)");
await page.screenshot({ path: path.join(OUT, "matches-3.png") });
await page.click("#match-list [data-more]");
c = await cards();
ok(c.length === 7 && await moreBtn() === "Mostrar menos", "Ver mais abre as 7 e vira 'Mostrar menos'");
await page.click("#match-list [data-more]");
ok((await cards()).length === 3, "Mostrar menos volta pra 3");

// mensagens não lidas: quem mandou aparece primeiro, com selo
await E(() => { REAL[6].conn = { id: "cid6", status: "accepted", mine: true, otherId: "u6", name: REAL[6].name, socials: {} }; state.unread.set("c:cid6", 2); renderAll(); });
c = await cards();
ok(c[0].startsWith("Gabi") && c.length === 3, "quem mandou mensagem sobe pro topo: " + c.join(", "));
ok(await E(() => document.querySelector("#match-list .card .newmsg").textContent.trim()) === "2 novas", "selo '2 novas' no card");
ok(await E(() => { const b = document.getElementById("match-badge"); return !b.hidden && b.textContent === "2" && b.classList.contains("alert-on"); }), "aba Matches mostra '2' pulsando");
ok(await E(() => document.title) === "(2) Estoura", "título da página: " + await E(() => document.title));
await E(() => { REAL[5].conn = { id: "cid5", status: "accepted", mine: true, otherId: "u5", name: REAL[5].name, socials: {} }; REAL[4].conn = { id: "cid4", status: "accepted", mine: true, otherId: "u4", name: REAL[4].name, socials: {} };
  state.unread.set("c:cid5", 1); state.unread.set("c:cid4", 1); renderAll(); });
{ const k = await cards(); ok(k.length === 3 && ["Gabi", "Fábio", "Elisa"].every(n => k.some(x => x.startsWith(n))), "com 3 pessoas com mensagem nova, as 3 aparecem: " + k.join(", ")); }
await E(() => { REAL[3].conn = { id: "cid3", status: "accepted", mine: true, otherId: "u3", name: REAL[3].name, socials: {} }; state.unread.set("c:cid3", 1); renderAll(); });
{ const k = await cards(); ok(k.length === 4, "com 4 pessoas com mensagem nova, aparecem as 4: " + k.join(", ")); }
await E(() => { state.unread.delete("c:cid3"); renderAll(); });
await E(() => { state.unread.delete("c:cid5"); state.unread.delete("c:cid4"); renderAll(); });

// alerta no topo
await E(() => incoming({ title: "Gabi Teste", body: "Oi! Bora surfar?", tag: "c:cid6#9", url: "/?chat=c:cid6" }));
const al = await E(() => { const a = document.getElementById("alert"); return { off: a.hasAttribute("data-off"), html: a.textContent }; });
ok(!al.off && /Gabi Teste/.test(al.html) && /Bora surfar/.test(al.html), "alerta aparece com nome e texto: " + al.html);
await page.screenshot({ path: path.join(OUT, "alerta.png") });
await page.click("#alert");
await wait(200);
ok(await E(() => !!document.querySelector(".chat") && state.unread.size === 0), "tocar no alerta abre a conversa e zera as não lidas");
ok(await E(() => document.title) === "Estoura", "título volta ao normal");
await E(() => closeLayer());

// notificação do sistema (app fora da tela)
await ctx.overridePermissions(origin, ["notifications"]);
await wait(500);
const reg = await E(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
ok(reg, "service worker ativo");
await E(() => systemNotify({ title: "Gabi Teste", body: "Oi!", tag: "c:cid6#10", url: "/?chat=c:cid6" }));
await E(() => systemNotify({ title: "Gabi Teste", body: "Oi!", tag: "c:cid6#10", url: "/?chat=c:cid6" })); // mesma mensagem de novo
await E(() => systemNotify({ title: "Gabi Teste", body: "outra", tag: "c:cid6#11", url: "/?chat=c:cid6" }));
const ns = await E(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => n.tag).sort());
ok(ns.length === 2 && ns[0] === "c:cid6#10" && ns[1] === "c:cid6#11", "notificação do sistema: mesma mensagem não duplica, outra mensagem aparece: " + JSON.stringify(ns));
await E(async () => { setNotifOff(true); });
await E(() => systemNotify({ title: "x", body: "y", tag: "off", url: "/" }));
ok((await E(async () => (await (await navigator.serviceWorker.ready).getNotifications()).length)) === 2, "com notificações desligadas neste aparelho, nada aparece");
await E(() => setNotifOff(false));

// links diretos
await E(() => { setView("bolhas"); openLink("/?tab=eventos"); });
ok(await E(() => !document.getElementById("view-eventos").hidden), "?tab=eventos abre a aba Eventos");
await E(() => { closeLayer(); openLink("/?chat=c:cid6"); });
ok(await E(() => !!document.querySelector(".chat") && current && current.key === "c:cid6"), "?chat=c:<id> abre a conversa");
await E(() => closeLayer());
await E(() => { openLink("/?chat=c:naoexiste"); });
ok(await E(() => state.link === "c:naoexiste"), "link de conversa que ainda não carregou fica esperando");
await E(() => { state.link = null; });

// dicas: ativar notificações e instalar o app
await E(() => { window.estouraAuthed = true; setView("matches"); renderAll(); });
const tip = await E(() => document.getElementById("tip-bar").textContent);
const perm = await E(() => Notification.permission);
ok(perm === "granted" ? !/Ative as notificações/.test(tip) : /Ative as notificações/.test(tip), `dica de notificação (permissão: ${perm}): ` + tip.trim().slice(0, 50));
await E(() => { const e = new Event("beforeinstallprompt"); e.prompt = () => { window.__prompted = true; }; e.userChoice = Promise.resolve({ outcome: "accepted" }); window.dispatchEvent(e); });
ok(await E(() => /Instale o Estoura/.test(document.getElementById("tip-bar").textContent)), "dica 'Instale o Estoura' aparece quando o navegador permite");
await page.screenshot({ path: path.join(OUT, "matches-dicas.png") });
await page.click('#tip-bar [data-tip="install"]');
ok(await E(() => window.__prompted === true && !/Instale o Estoura/.test(document.getElementById("tip-bar").textContent)), "tocar em Instalar abre o pedido do navegador e some a dica");
await E(() => window.dispatchEvent(new Event("beforeinstallprompt")));
await E(() => { const e = new Event("beforeinstallprompt"); e.prompt = () => {}; e.userChoice = Promise.resolve({}); window.dispatchEvent(e); });
await page.click('#tip-bar [data-skip="install"]');
ok(await E(() => !/Instale o Estoura/.test(document.getElementById("tip-bar").textContent)), "o X dispensa a dica");
ok(await E(() => /Este aparelho/.test(deviceHTML()) && /Notificações/.test(deviceHTML())), "menu da conta tem o bloco 'Este aparelho'");

// chat: oferta de notificações (permissão ainda não decidida)
await ctx.clearPermissionOverrides();
await page.reload({ waitUntil: "load" }); await wait(500);
await E(() => { window.estouraAuthed = true; REAL.push({ id: "r_z", uid: "uz", name: "Zé Teste", real: true, shy: true, lv: new Map([["surf", 1]]), conn: { id: "cz", status: "accepted", mine: true, otherId: "uz", name: "Zé Teste", socials: {} } }); setLevel(byId("surf"), 1, true); openRealChat(REAL[0]); });
const tipHidden = await E(() => document.getElementById("chat-tip").hidden);
const state2 = await E(() => notifState());
ok(state2 !== "default" ? tipHidden : !tipHidden, `dica dentro do chat (permissão: ${state2}, escondida: ${tipHidden})`);
if (state2 === "default") await page.screenshot({ path: path.join(OUT, "chat-dica.png") });

// manifesto e service worker
const man = JSON.parse(fs.readFileSync(path.join(PUB, "manifest.webmanifest"), "utf8"));
ok(man.display === "standalone" && man.shortcuts.length === 2 && man.shortcuts.every(s => s.url.startsWith("/?tab=")), "manifesto: tela cheia + atalhos Matches e Eventos");
ok(/addEventListener\("push"/.test(fs.readFileSync(path.join(PUB, "sw.js"), "utf8")), "service worker trata push");
ok(errors.length === 0, "sem erros no console: " + JSON.stringify(errors));
console.log(fails ? `\n${fails} FALHA(S)` : "\nTUDO OK");
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
