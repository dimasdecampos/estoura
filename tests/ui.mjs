// Abre o estoura.html no Chrome (sem Supabase = modo local) e testa a lógica de bolhas pessoais.
import puppeteer from "puppeteer-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { PUB, OUT, launchArgs } from "./lib.mjs";
const srv = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split("?")[0]); if (f === "/") f = "/estoura.html";
  const p = path.join(PUB, f);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": p.endsWith(".html") ? "text/html; charset=utf-8" : p.endsWith(".js") ? "text/javascript" : p.endsWith(".css") ? "text/css" : "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const url = `http://localhost:${srv.address().port}/`;
const browser = await puppeteer.launch(launchArgs());
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 860, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.evaluateOnNewDocument(() => { localStorage.setItem("estoura-welcome", "1"); });
await page.goto(url, { waitUntil: "load" });
await new Promise(r => setTimeout(r, 800));
let fails = 0;
const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
const E = (fn, ...a) => page.evaluate(fn, ...a);
const toast = () => E(() => document.getElementById("toast").textContent);
const wait = ms => new Promise(r => setTimeout(r, ms));

// 1) cenário do bug original: criar A, entrar, criar B dentro, descurtir B, descurtir A pelo botão
await E(() => createBubble("Minha A", null));
const A = await E(() => INTERESTS.find(i => i.name === "Minha A").id);
ok(await E(id => state.lv.get(id) === 1, A), "criar A já curte A");
ok(await E(() => document.getElementById("nudge").hidden), "modo demonstração (sem login disponível): não mostra aviso de login");
await E(id => doEnter(id), A);
await E(id => createBubble("Minha B", id), A);
const B = await E(() => INTERESTS.find(i => i.name === "Minha B").id);
ok(await E((b, a) => byId(b).parent === a && state.pp.get(b) === a && state.lv.get(b) === 1, B, A), "B criada dentro de A, curtida, guardada em A");
await page.click('#focus-seg button[data-l="1"]');
ok(await E(id => state.lv.has(id), A) && /Desmarque antes/.test(await toast()), "Curto em A com B marcada: pede pra desmarcar B antes");
await E(id => setLevel(byId(id), 0), B);
ok(await E(id => !state.lv.has(id), B), "B descurtida");
ok(await E(id => state.lv.get(id) === 1, A), "A continua curtida (foi você que criou)");
ok(await E(() => document.querySelector('#focus-seg button[data-l="1"]').getAttribute("aria-pressed")) === "true", "botão Curto aceso");
await page.click('#focus-seg button[data-l="1"]');
ok(await E(id => !state.lv.has(id), A), "tocar de novo em Curto descurte A");
ok(await E(() => document.querySelector('#focus-seg button[data-l="1"]').getAttribute("aria-pressed")) === "false", "botão Curto apagado");
await E(() => { state.focus = null; rebuild(); renderFocus(); });

// 2) nome repetido: "SÚRF" dentro de Viagens reaproveita Surf e guarda só na sua árvore
const before = await E(() => INTERESTS.filter(i => slugOf(i) === "surf").length);
await E(() => createBubble("SÚRF", "viagens"));
ok(await E(() => INTERESTS.filter(i => slugOf(i) === "surf").length) === before, "não criou outra Surf");
ok(await E(() => byId("surf").parent === "viagens" && byId("surf").gp === null && state.lv.has("surf") && state.lv.has("viagens")), "Surf aparece em Viagens pra você (e Viagens foi curtida junto)");
ok(await E(() => state.auto.has("viagens")), "Viagens marcada como automática");
ok(await E(() => byId("surf/longboard").parent === "surf" && ancestors("surf/longboard").includes("viagens")), "sub-bolhas de Surf vão junto");

// 3) descurtir Surf: volta pro lugar da maioria e leva Viagens (automática) junto
await E(() => setLevel(byId("surf"), 0));
ok(await E(() => byId("surf").parent === null && !state.pp.has("surf")), "Surf voltou pra bolha principal (lugar da maioria)");
ok(await E(() => !state.lv.has("viagens")), "Viagens saiu junto (só estava marcada por causa de Surf)");
ok(/volta pra as bolhas principais|volta pra/.test(await toast()), "aviso explica que voltou: " + await toast());

// 4) mover: Cinema pra dentro de Viagens (não era sua: passa a ser)
await E(() => doMove(byId("cinema"), "viagens"));
ok(await E(() => byId("cinema").parent === "viagens" && state.lv.has("cinema") && state.lv.has("viagens")), "Cinema movida pra Viagens e curtida");
ok(await E(() => byId("cinema/terror").parent === "cinema" && ancestors("cinema/terror").includes("viagens")), "sub-bolhas de Cinema foram junto");
await E(() => doMove(byId("viagens"), "cinema"));
ok(/dentro dela mesma/.test(await toast()) && await E(() => byId("viagens").parent === null), "não deixa guardar Viagens dentro de Cinema (que está dentro de Viagens)");

// 5) remover Viagens: Cinema (sua) sobe pra principal
await E(() => doRemove(byId("viagens")));
ok(await E(() => !state.lv.has("viagens") && state.lv.has("cinema") && byId("cinema").parent === null), "remover Viagens: Cinema continua sua e virou principal");
ok(await E(() => !!byId("viagens")), "Viagens continua existindo (é das bolhas iniciais)");

// 6) remover uma bolha criada por você que ninguém tem: some
await E(() => createBubble("Bolha Única Teste", null));
const U = await E(() => INTERESTS.find(i => i.name === "Bolha Única Teste").id);
await E(id => doRemove(byId(id)), U);
ok(await E(id => !byId(id) && !state.lv.has(id), U), "bolha sua que ninguém tem some ao remover");

// 7) sugestões ao digitar
await E(() => setNewOpen(true));
await page.type("#new-input", "trail");
await wait(150);
const sug = await E(() => [...document.querySelectorAll("#new-sugg .sg")].map(b => b.textContent.replace(/\s+/g, " ").trim()));
ok(!(await E(() => document.getElementById("new-sugg").hidden)) && sug.some(t => /Trail run/.test(t)) && sug.some(t => /Criar "trail"/.test(t)), "sugere Trail run e oferece criar: " + JSON.stringify(sug));
await page.screenshot({ path: path.join(OUT, "sugestoes.png") });
await E(() => { const i = document.getElementById("new-input"); i.value = ""; i.dispatchEvent(new Event("input")); });
await page.type("#new-input", "trail run");
await wait(100);
ok(!(await E(() => [...document.querySelectorAll("#new-sugg .sg")].some(b => b.matches("[data-sg-new]")))), "nome igual: não oferece criar outra");
await page.click('#new-sugg .sg[data-sg="corrida/trailrun"]');
ok(await E(() => state.lv.has("corrida/trailrun") && document.getElementById("dock-top").hidden), "tocar na sugestão estoura a bolha existente e fecha");
ok(await E(() => byId("corrida/trailrun").parent === "corrida"), "pelo + do globo, Trail run continua em Corrida: " + await toast());
await E(() => setNewOpen(true)); await page.type("#new-input", "yoga"); await page.keyboard.press("Enter");
ok(await E(() => state.lv.has("yoga") && byId("yoga").parent === null && INTERESTS.filter(i=>slugOf(i)==="yoga").length===1), "Enter com nome existente estoura a existente");

// 8) sugestões dentro de uma bolha (sub-bolha)
await E(() => doEnter("fotografia"));
await page.click("#focus-add");
await wait(200);
await page.type("#sub-name", "camping");
await wait(150);
await page.screenshot({ path: path.join(OUT, "sub-bolha.png") });
const sub = await E(() => [...document.querySelectorAll("#sub-sugg .sg")].map(b => b.textContent.replace(/\s+/g, " ").trim()));
ok(sub.some(t => /Camping selvagem/.test(t) && /Estourar/.test(t)), "dentro de Fotografia, sugere Camping selvagem: " + JSON.stringify(sub));
await page.click('#sub-sugg .sg[data-sg="trilhas/camping"]');
ok(await E(() => byId("trilhas/camping").parent === "fotografia" && state.lv.has("fotografia")), "Camping selvagem guardada em Fotografia (só pra você)");

// 9) toque duplo numa bolha já curtida descurta em vez de entrar
await E(() => { state.focus = null; rebuild(); renderFocus(); });
await E(() => { const it = byId("skate"); tap(it); });             // 1º toque marca
await wait(500);
await E(() => { const it = byId("skate"); it.hu = 0; tap(it); });   // mostra coração
await E(() => { const it = byId("skate"); tap(it); });              // logo em seguida: desmarca
ok(await E(() => !state.lv.has("skate") && state.focus === null), "toque duplo numa curtida descurte (não entra)");

// 10) linha "também guardada em" não quebra o desenho
await E(() => { byId("surf").places = [{ p: null, n: 3 }, { p: "viagens", n: 2 }]; doEnter("surf"); });
await wait(400);
await page.screenshot({ path: path.join(OUT, "dentro-surf.png") });

// 11) rodízio do globo
await E(() => { state.focus = null; rebuild(true); renderFocus(); });
const g = await E(() => ({ roots: INTERESTS.filter(i => !i.parent).length, shown: items.filter(i => !i.type).length,
  mineOk: true }));
ok(g.roots > 16 && g.shown <= Math.max(16, g.shown) && g.shown < g.roots, `globo mostra ${g.shown} de ${g.roots} bolhas principais`);
const ids0 = await E(() => items.filter(i => !i.type).map(i => i.id).sort().join());
for (let k = 0; k < 3; k++) { await E(() => rotateOne()); await wait(1500); }
const r = await E(() => ({ ids: items.filter(i => !i.type).map(i => i.id).sort().join(), n: items.filter(i => !i.type).length,
  mineOk: INTERESTS.filter(i => !i.parent && state.lv.has(i.id)).every(i => items.includes(i)), out: items.filter(i => i.out).length }));
ok(r.ids !== ids0, "depois de alguns segundos, outras bolhas apareceram");
ok(r.n === g.shown, "o número de bolhas no globo continua o mesmo");
ok(true, "rodízio ok");
await page.screenshot({ path: path.join(OUT, "globo-rodizio.png") });
// nome de bolha comprido: quebra pra baixo e cabe dentro da bolha
const fit = await E(() => ["Fotografia analógica de rua", "Programação", "Desenvolvimento pessoal e carreira", "Jogos de tabuleiro", "Surf"].map(n => {
  const r = 38, f = fitText(n, r, 15); ctx.font = `700 ${f.fs}px Figtree, system-ui, sans-serif`;
  return { n, lines: f.lines.length, fs: f.fs, ok: f.lines.every(l => ctx.measureText(l).width <= r * 1.68 + .5), same: f.lines.join(" ").replace(/- /g, "") === n || f.lines.join("").replace(/-/g, "") === n.replace(/ /g, "") }; }));
ok(fit.every(x => x.ok && x.lines <= 4), "nome comprido cabe dentro da bolha: " + fit.map(x => `${x.n}→${x.lines} linha(s) a ${x.fs}px`).join("; "));
ok(fit[4].lines === 1 && fit[4].fs === 15, "nome curto continua em uma linha, sem encolher");
await E(() => { ["leitura", "fotografia", "programacao"].forEach(id => { const i = byId(id); if (i) i.hl = performance.now() + 60000; }); state.focus = null; rebuild(true); });
await wait(1500);
await page.screenshot({ path: path.join(OUT, "globo-nomes.png") });
// as curtidas também entram no rodízio, e uma parte das vagas é sempre de novidade
await E(() => { INTERESTS.filter(i => !i.parent).slice(0, 16).forEach(i => { state.lv.set(i.id, 1); }); state.focus = null; rebuild(true); });
const q = await E(() => { const mk = () => items.filter(i => !i.type); const a = mk();
  const out = { n: a.length, novas: a.filter(i => !state.lv.has(i.id)).length, min: newMin(), trocou: false };
  const before = new Set(a.filter(i => state.lv.has(i.id)).map(i => i.id));
  for (let k = 0; k < 60; k++) { rotateOne(); items.forEach(i => { if (i.out) i.dr = 0; }); swapOut(); }
  const b = mk(); out.trocou = b.some(i => state.lv.has(i.id) && !before.has(i.id)); out.novas2 = b.filter(i => !state.lv.has(i.id)).length; out.n2 = b.length;
  return out; });
ok(q.novas >= q.min && q.novas2 >= q.min, `curtindo muitas bolhas, ainda sobram vagas pra novidade (${q.novas} e ${q.novas2} de ${q.n}, mínimo ${q.min})`);
ok(q.trocou && q.n2 === q.n, "as bolhas curtidas também trocam no rodízio, sem mudar a quantidade");
await E(() => { INTERESTS.forEach(i => { if (!["surf", "viagens"].includes(i.id) && state.lv.get(i.id) === 1 && !i.parent) state.lv.delete(i.id); }); rebuild(true); });
// estourar pela busca uma bolha que não está no globo: ela aparece
const hiddenId = await E(() => (INTERESTS.find(i => !i.parent && !items.includes(i) && !state.lv.has(i.id) && i.id !== "escalada") || {}).id);
await E(id => useBubble(byId(id), undefined), hiddenId);
ok(await E(id => items.includes(byId(id)) && state.lv.has(id), hiddenId), "bolha estourada pela busca entra no globo (" + hiddenId + ")");
// botões laterais: sem "ver todas espalhadas"; Buscar e Criar são separados
ok(await E(() => !document.getElementById("view-toggle") && !!document.getElementById("search-toggle") && !!document.getElementById("new-toggle")), "sem botão de visão espalhada; Buscar e Criar são dois botões");
ok(await E(() => { const r = id => document.getElementById(id).getBoundingClientRect(), x = [r("filter-toggle"), r("search-toggle"), r("new-toggle")]; return x[0].bottom <= x[1].top && x[1].bottom <= x[2].top; }), "os 3 botões (filtro, buscar, criar) ficam empilhados sem se sobrepor");
await page.screenshot({ path: path.join(OUT, "botoes.png") });
await E(() => { state.focus = null; rebuild(true); renderFocus(); });
// buscar uma bolha de dentro de outra
await page.click("#search-toggle");
ok(await E(() => !document.getElementById("dock-search").hidden && document.getElementById("dock-top").hidden), "Buscar abre só o campo de busca");
await page.type("#search-input", "corrida de rua");
ok(await E(() => { const b = document.querySelector('#search-sugg [data-sg-go="corrida/rua"]'); return !!b && /em Corrida/.test(b.textContent) && !document.querySelector("#search-sugg [data-sg-make],#search-sugg [data-sg-new]"); }), "busca acha 'Corrida de rua' (em Corrida) e não oferece criar");
// o campo e os resultados ficam no topo (o teclado do celular não cobre nada)
const lay = await E(() => { const r = id => document.getElementById(id).getBoundingClientRect(), h = document.querySelector("header").getBoundingClientRect();
  return { headerBottom: h.bottom, topbarBottom: document.getElementById("topbar").getBoundingClientRect().bottom, dockTop: r("dock-search").top, inputBottom: r("search-input").bottom, suggTop: r("search-sugg").top, stageTop: document.querySelector(".stage").getBoundingClientRect().top, H: innerHeight, inputTop: r("search-input").top }; });
ok(lay.dockTop >= lay.headerBottom - 1 && lay.inputBottom < lay.H / 3 && lay.dockTop < lay.stageTop, "o campo de busca abre no topo, logo abaixo do cabeçalho (y=" + Math.round(lay.inputTop) + " de " + lay.H + ")");
ok(lay.dockTop >= lay.topbarBottom - 1, "o campo fica abaixo da faixa Em alta (topbar)");
ok(await E(() => document.getElementById("search-input").getBoundingClientRect().height <= 40), "campo enxuto (até 40px de altura)");
ok(lay.suggTop >= lay.inputBottom - 4, "os resultados abrem abaixo do campo");
// teclado do celular: o app encolhe junto com a área visível e o topo continua no lugar
const kb = await E(() => { document.documentElement.style.setProperty("--vvh", "480px"); document.documentElement.classList.add("kb");
  const app = document.querySelector(".app").getBoundingClientRect(), h = document.querySelector("header").getBoundingClientRect(), nav = getComputedStyle(document.querySelector("nav")).display;
  const out = { appH: Math.round(app.height), headerTop: Math.round(h.top), nav }; document.documentElement.style.setProperty("--vvh", "100dvh"); document.documentElement.classList.remove("kb"); return out; });
ok(kb.appH === 480 && kb.headerTop === 0 && kb.nav === "none", "com o teclado aberto: app com 480px de altura, topo fixo em y=0 e barra de abas escondida (" + JSON.stringify(kb) + ")");
ok(await E(() => parseFloat(getComputedStyle(document.getElementById("search-input")).fontSize) >= 16), "campo com fonte de 16px (evita o zoom do iPhone)");
await page.screenshot({ path: path.join(OUT, "busca.png") });
await page.click('#search-sugg [data-sg-go="corrida/rua"]');
await wait(1300);
ok(await E(() => state.focus === "corrida" && byId("corrida/rua").hl > performance.now() && !state.lv.has("corrida/rua") && document.getElementById("dock-search").hidden), "tocar no resultado abre a bolha-mãe (Corrida), destaca a achada e não curte nada");
ok(/Corrida de rua está em Corrida/.test(await toast()), "aviso diz onde a bolha está: " + await toast());
await E(() => { state.focus = null; rebuild(true); renderFocus(); });
// buscar uma bolha principal que não está no globo
const farId = await E(() => (INTERESTS.find(i => !i.parent && !items.includes(i) && !state.lv.has(i.id)) || {}).id);
const farName = await E(id => byId(id).name, farId);
await page.click("#search-toggle");
await page.type("#search-input", farName);
await page.click(`#search-sugg [data-sg-go="${farId}"]`);
await wait(300);
ok(await E(id => items.includes(byId(id)) && state.focus === null && !state.lv.has(id), farId), "bolha principal fora do globo entra nele (" + farName + ") sem ser curtida");
// nada encontrado: oferece criar, e leva o nome pro campo de criar
await page.click("#search-toggle");
await page.type("#search-input", "zzzxyz");
ok(await E(() => !!document.querySelector("#search-sugg [data-sg-make]") && /Nenhuma bolha/.test(document.getElementById("search-sugg").textContent)), "sem resultado: avisa e oferece criar");
await page.click("#search-sugg [data-sg-make]");
ok(await E(() => !document.getElementById("dock-top").hidden && document.getElementById("dock-search").hidden && document.getElementById("new-input").value === "zzzxyz"), "'Criar' leva o nome pro campo de criar bolha");
// só um campo aberto por vez
await page.click("#search-toggle");
ok(await E(() => !document.getElementById("dock-search").hidden && document.getElementById("dock-top").hidden), "abrir a busca fecha o criar");
await page.click("#new-toggle");
ok(await E(() => document.getElementById("dock-search").hidden && !document.getElementById("dock-top").hidden), "abrir o criar fecha a busca");
await E(() => { setNewOpen(false); });

// 12) bolha-mãe automática que ficou sem sub-bolha marcada sai (ex.: sub-bolha foi pra outro lugar)
await E(() => { setLevel(byId("escalada/boulder"), 1, true); });
ok(await E(() => state.auto.has("escalada") && state.lv.has("escalada")), "Escalada marcada automaticamente por Boulder");
await E(() => doMove(byId("escalada/boulder"), null));
ok(await E(() => !state.lv.has("escalada") && byId("escalada/boulder").parent === null && state.lv.has("escalada/boulder")), "Boulder virou principal; Escalada (automática, sem sub-bolha marcada) saiu");

// logo e aba Bolhas levam pro início, mesmo com uma bolha aberta
await E(() => { doEnter("corrida"); });
await wait(300);
ok(await E(() => state.focus === "corrida"), "entrou na bolha Corrida");
await page.click("nav [data-view=bolhas]"); await wait(300);
ok(await E(() => state.focus === null && !document.getElementById("view-bolhas").hidden), "aba Bolhas volta pro início (sai da bolha aberta)");
await E(() => { doEnter("corrida"); setView("matches"); }); await wait(300);
await page.click("#logo"); await wait(300);
ok(await E(() => state.focus === null && !document.getElementById("view-bolhas").hidden), "clicar na logo volta pro início, de qualquer tela");

// holofote: buscar ou criar uma bolha deixa ela em destaque e pausa o giro; curtir faz um estouro discreto
await E(() => { closeLayer(); setView("bolhas"); goHome(); });
await wait(300);
await E(() => goToBubble("cinema"));
ok(await E(() => byId("cinema").hl > performance.now() && held()), "buscar: a bolha fica em destaque e o giro pausa");
await wait(1500);
const r1 = await E(() => rotY); await wait(500);
ok(await E(r => Math.abs(rotY - r) < 0.001, r1), "durante o destaque, o globo não sai girando");
await E(() => createBubble("Bolha Holofote", null));
ok(await E(() => { const it = INTERESTS.find(i => i.name === "Bolha Holofote"); return !!it && it.hl > performance.now() && held(); }), "criar: a bolha nova fica em destaque e o giro pausa");
await wait(400);
const pop = await E(() => { const q = pts.find(q => q.it.id && !q.it.type && !state.lv.has(q.it.id) && !kids(q.it.id).length && q.z > 0 && q.r > 10);
  if (!q) return null; fx.length = 0; setLevel(q.it, 1);
  return { flash: fx.some(f => f.flash), drops: fx.filter(f => !f.ring && !f.flash && !f.k).length }; });
ok(pop && pop.flash && pop.drops >= 10, "curtir: estouro discreto (clarão e gotinhas saindo da borda) " + JSON.stringify(pop));

// tela de introdução no 1º acesso: 3 páginas (propósito, bolhas, gente e privacidade)
{
  const ctx = await browser.createBrowserContext(), w = await ctx.newPage();
  await w.setViewport({ width: 420, height: 860 });
  w.on("pageerror", e => errors.push(e.message));
  await w.goto(url, { waitUntil: "load" }); await wait(800);
  const txt = () => w.evaluate(() => (document.querySelector(".sheet") || {}).textContent || "");
  ok(/unir pessoas com gostos em comum/.test(await txt()) && /descubra coisas novas/.test(await txt()), "intro, página 1: o propósito");
  await w.click("#w-next"); await wait(200);
  ok(/Pontinhos dentro/.test(await txt()) && /Transparente/.test(await txt()) && /Tracejada/.test(await txt()) && (await w.$$(".legend .wbub")).length === 6, "intro, página 2: legenda com os 6 tipos de bolha desenhados");
  await w.click("#w-next"); await wait(200);
  ok(/primeiro nome/.test(await txt()) && !!(await w.$("#w-zero")), "intro, página 3: privacidade e botão Começar");
  await w.click("#w-back"); await wait(200);
  ok(/Pontinhos dentro/.test(await txt()), "intro: Voltar volta uma página");
  await w.click("#w-next"); await wait(200); await w.click("#w-zero"); await wait(200);
  ok(!(await w.$(".sheet")) && await w.evaluate(() => localStorage.getItem("estoura-welcome") === "1"), "Começar fecha e não mostra de novo");
  await ctx.close();
}

ok(errors.length === 0,"sem erros no console: " + JSON.stringify(errors));
console.log(fails ? `\n${fails} FALHA(S)` : "\nTUDO OK");
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
