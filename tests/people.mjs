// Visão de pessoas (botão no globo, pra quem está logado): bolhas de pessoas com foto, abrir uma pessoa, estourar uma bolha dela, rede. Sem Supabase.
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
const page = await browser.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.evaluateOnNewDocument(() => { localStorage.setItem("estoura-welcome", "1"); });
let fails = 0;
const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
const E = (fn, ...a) => page.evaluate(fn, ...a);
const wait = ms => new Promise(r => setTimeout(r, ms));
// toque no canvas de pessoas, em coordenadas do próprio canvas
const tapAt = async (x, y) => { const b = await E(() => { const r = document.getElementById("people").getBoundingClientRect(); return { x: r.left, y: r.top }; }); await page.mouse.click(b.x + x, b.y + y); };

for (const [w, h, tag] of [[420, 860, "celular"], [1280, 820, "desktop"]]) {
  await page.setViewport({ width: w, height: h });
  await page.goto(origin + "/", { waitUntil: "load" });
  await wait(500);

  ok(await E(() => document.getElementById("people-toggle").hidden), `${tag}: sem login, o botão de pessoas não aparece no globo`);
  await E(() => {
    ["surf", "viagens", "viagens/mochilao", "cafe", "trilhas"].forEach(id => setLevel(byId(id), 1, true));
    setLevel(byId("surf"), 2, true);
    const gente = [
      ["Ana", [["surf", 2], ["viagens", 1], ["viagens/mochilao", 1], ["yoga", 1], ["leitura", 2]]],
      ["Bruno", [["surf", 1], ["cafe", 1], ["skate", 1]]],
      ["Carla", [["trilhas", 1], ["viagens", 1], ["fotografia", 1], ["fotografia/natureza", 1]]],
      ["Diego", [["cafe", 2], ["cinema", 1], ["programacao", 1]]],
      ["Elisa", [["surf", 1], ["trilhas", 1], ["cafe", 1], ["viagens", 1], ["astronomia", 1]]],
      ["Fábio", [["viagens/mochilao", 1], ["viagens", 1]]],
    ];
    // foto de teste (desenho) pra metade das pessoas; a outra metade fica com as iniciais
    const foto = c => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${c}"/><circle cx="48" cy="38" r="18" fill="#fde"/><rect x="18" y="62" width="60" height="40" rx="20" fill="#fde"/></svg>`);
    gente.forEach(([n, lv], i) => REAL.push({ id: "r_" + i, uid: "u" + i, name: n + " Teste", city: "Santos", real: true, shy: true, photo: i % 2 ? null : foto(["#c47", "#47c", "#4a7"][i / 2]), lv: new Map(lv), conn: null }));
    renderAll();
    peopleAccess(true); // logou

  });
  ok(await E(() => !document.getElementById("people-toggle").hidden && document.getElementById("people-toggle").querySelectorAll("circle").length === 5), `${tag}: logado, o botão das bolhinhas espalhadas aparece no globo`);
  ok(await E(() => !pm.on && getComputedStyle(document.getElementById("globe")).display !== "none"), `${tag}: começa no globo de sempre`);

  await page.click("#people-toggle");
  await wait(1800); // deixa as bolhas se acomodarem
  ok(await E(() => pm.on && !document.getElementById("people").hidden && getComputedStyle(document.getElementById("globe")).display === "none" && document.getElementById("people").getBoundingClientRect().height > 300), `${tag}: o botão troca o globo pela visão de pessoas`);
  ok(await E(() => pm.nodes.size === 6), `${tag}: uma bolha por pessoa que combina (6)`);
  ok(await E(() => { const n = [...pm.nodes.values()].sort((a, b) => b.pct - a.pct), hi = n[0], lo = n[n.length - 1], d = x => Math.hypot(x.btx - pmGeo().cx, x.bty - pmGeo().cy);
    return hi.pct > lo.pct && hi.br > lo.br && d(hi) < d(lo); }), `${tag}: quem combina mais tem bolha maior e mais perto de você`);
  ok(await E(() => { const n = [...pm.nodes.values()]; for (let i = 0; i < n.length; i++) for (let j = i + 1; j < n.length; j++) if (Math.hypot(n[i].x - n[j].x, n[i].y - n[j].y) < (n[i].r + n[j].r) * .8) return false; return true; }), `${tag}: as bolhas de pessoas não ficam uma em cima da outra`);
  await page.screenshot({ path: path.join(OUT, `pessoas-bolhas-${tag}.png`) });

  // abrir a Ana
  const ana = await E(() => { const n = [...pm.nodes.values()].find(x => x.p.name.startsWith("Ana")); return { x: n.x, y: n.y }; });
  await tapAt(ana.x, ana.y);
  await wait(900);
  ok(await E(() => pm.open && pm.open.p.name.startsWith("Ana") && pm.inner.length === 5), `${tag}: tocar na Ana abre a bolha dela com as 5 bolhas que ela curte`);
  ok(await E(() => /Ana Teste/.test(document.getElementById("people-bar").textContent) && /Voltar/.test(document.getElementById("people-bar").textContent)), `${tag}: barra mostra o nome e o Voltar`);
  ok(await E(() => { const s = id => state.lv.has(id); const i = pm.inner.map(b => b.id); return i.findIndex(id => !s(id)) > i.filter(s).length - 1; }), `${tag}: bolhas em comum vêm primeiro (no meio)`);
  await page.screenshot({ path: path.join(OUT, `pessoas-aberta-${tag}.png`) });

  // tocar numa bolha que só a Ana tem: estoura pra você
  const yoga = await E(() => { const s = pmShell(), b = pm.inner.find(x => x.id === "yoga"); return { x: s.x + b.x * s.r, y: s.y + b.y * s.r }; });
  await tapAt(yoga.x, yoga.y);
  await wait(200);
  ok(await E(() => state.lv.has("yoga")), `${tag}: tocar numa bolha só dela estoura pra você`);
  ok(await E(() => pm.open && pm.open.shared.includes("yoga")), `${tag}: e ela passa a contar como em comum`);

  // fechar tocando fora
  await tapAt(8, await E(() => pm.H - 8));
  await wait(900);
  ok(await E(() => !pm.open), `${tag}: tocar fora fecha a pessoa`);

  // rede
  await page.click('#people-bar [data-pm="rede"]');
  await wait(1200);
  ok(await E(() => pm.mode === "rede" && pm.ints.size >= 4 && pm.ints.has("viagens") && pm.ints.has("surf")), `${tag}: rede mostra as bolhas em comum no meio`);
  ok(await E(() => !pm.ints.has("leitura") && !pm.ints.has("skate")), `${tag}: bolhas que só a outra pessoa tem não entram na rede`);
  await page.screenshot({ path: path.join(OUT, `pessoas-rede-${tag}.png`) });
  const via = await E(() => { const it = pm.ints.get("viagens"); return { x: it.x, y: it.y }; });
  await tapAt(via.x, via.y);
  await wait(300);
  const note = await E(() => document.querySelector("#people-bar .note").textContent);
  ok(/Viagens liga você a 4 pessoas/.test(note), `${tag}: tocar em Viagens destaca as linhas: "${note}"`);
  await page.screenshot({ path: path.join(OUT, `pessoas-rede-viagens-${tag}.png`) });
  const bruno = await E(() => { const n = [...pm.nodes.values()].find(x => x.p.name.startsWith("Bruno")); return { x: n.x, y: n.y }; });
  await tapAt(bruno.x, bruno.y); await wait(200);
  ok(/Bruno Teste/.test(await E(() => document.querySelector("#people-bar .note").textContent)), `${tag}: 1º toque numa pessoa destaca ela`);
  await tapAt(bruno.x, bruno.y); await wait(300);
  ok(await E(() => !!document.querySelector(".sheet") && /Bruno Teste/.test(document.querySelector(".sheet").textContent)), `${tag}: 2º toque abre o perfil`);
  await E(() => closeLayer());

  // lembra a escolha; Lista volta; sair da conta esconde o menu
  ok(await E(() => document.getElementById("people-toggle").querySelectorAll("circle").length === 1), `${tag}: com a visão aberta, o botão vira o globo (pra voltar)`);
  await page.click("#people-toggle");
  ok(await E(() => !pm.on && getComputedStyle(document.getElementById("globe")).display !== "none"), `${tag}: tocar de novo volta pro globo`);
  // dentro de uma bolha o botão some (como a lupa e o +) e volta ao sair
  await E(() => { state.focus = INTERESTS.find(i => INTERESTS.some(k => k.parent === i.id)).id; rebuild(true); renderFocus(); });
  ok(await E(() => document.getElementById("people-toggle").hidden && document.getElementById("search-toggle").hidden), `${tag}: dentro de uma bolha o botão de pessoas some, como a lupa`);
  await E(() => { goHome(); });
  ok(await E(() => !document.getElementById("people-toggle").hidden), `${tag}: ao voltar pro globo o botão volta`);
  await E(() => { setPeople(true); peopleAccess(false); });
  ok(await E(() => !pm.on && document.getElementById("people-toggle").hidden), `${tag}: saindo da conta, a visão fecha e o botão some`);

}

// celular deitado: menu na lateral, não uma tira no rodapé
await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
await page.goto(origin + "/", { waitUntil: "load" });
await wait(500);
const nav = await E(() => { const r = document.querySelector("nav").getBoundingClientRect(); return { l: r.left, w: r.width, h: r.height, vh: innerHeight }; });
ok(nav.l === 0 && nav.w > 60 && nav.w < 120 && nav.h > nav.vh * .6, "celular deitado: o menu fica na lateral esquerda (" + Math.round(nav.w) + "px de largura)");
ok(await E(() => { const r = document.querySelector("nav").getBoundingClientRect(), m = document.querySelector("main").getBoundingClientRect(); return m.left >= r.right - 1 && m.bottom > innerHeight - 4; }), "celular deitado: a tela de bolhas usa todo o espaço ao lado do menu");
ok(errors.length === 0, "sem erros no console" + (errors.length ? ": " + errors.join(" | ") : ""));
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
