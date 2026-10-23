// PWA: o Chrome considera o site instalável? E o aviso de instalação no primeiro acesso.
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
const url = `http://localhost:${srv.address().port}/`;
const browser = await puppeteer.launch(launchArgs());
let fails = 0;
const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function open({ welcomeSeen = true, ua, normal = false } = {}) {
  // janela anônima não deixa instalar; o teste de instalabilidade usa a janela normal
  const ctx = normal ? { close: async () => {} } : await browser.createBrowserContext();
  const page = normal ? await browser.newPage() : await ctx.newPage();
  await page.setViewport({ width: 420, height: 860 });
  if (ua) await page.setUserAgent(ua);
  if (welcomeSeen) await page.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem("w")) localStorage.setItem("estoura-welcome", "1"); } catch (e) {} });
  await page.goto(url, { waitUntil: "load" });
  return { page, ctx };
}
const fakeInstallEvent = page => page.evaluate(() => { const e = new Event("beforeinstallprompt"); e.prompt = () => { window.__prompted = (window.__prompted || 0) + 1; }; e.userChoice = Promise.resolve({ outcome: "accepted" }); window.dispatchEvent(e); });
const barVisible = page => page.evaluate(() => !document.getElementById("install-bar").hidden);

// ---------- o Chrome acha o site instalável ----------
{
  const { page, ctx } = await open({ normal: true });
  const cdp = await page.createCDPSession();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await wait(1500);
  const man = await cdp.send("Page.getAppManifest");
  const inst = await cdp.send("Page.getInstallabilityErrors");
  const m = JSON.parse(man.data || "{}");
  ok(!!man.url && !man.errors.length, "o Chrome encontra e lê o manifesto: " + man.url);
  ok(inst.installabilityErrors.length === 0, "o Chrome não aponta nenhum erro de instalação: " + JSON.stringify(inst.installabilityErrors));
  ok(m.display === "standalone" && m.start_url && m.icons.some(i => i.sizes === "192x192") && m.icons.some(i => i.sizes === "512x512") && m.icons.some(i => i.purpose === "maskable"), "manifesto: tela cheia, start_url, ícones 192, 512 e maskable");
  const head = await page.evaluate(() => ({
    manifest: !!document.head.querySelector('link[rel="manifest"]'),
    theme: !!document.head.querySelector('meta[name="theme-color"]'),
    apple: !!document.head.querySelector('link[rel="apple-touch-icon"]'),
    appleCapable: !!document.head.querySelector('meta[name="apple-mobile-web-app-capable"]'),
    inBody: !!document.body.querySelector('link[rel="manifest"],meta[name="theme-color"],title'),
  }));
  ok(head.manifest && head.theme && head.apple && head.appleCapable && !head.inBody, "manifesto, cor do tema e ícone do iPhone estão no <head> (não no <body>): " + JSON.stringify(head));
  await page.reload({ waitUntil: "load" });
  await wait(500);
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller), "service worker controla a página");
  await page.close();
}

// ---------- aviso no primeiro acesso (Android / Chrome / Edge) ----------
{
  const { page, ctx } = await open();
  ok(!(await barVisible(page)), "o aviso não aparece antes do navegador liberar a instalação");
  await fakeInstallEvent(page);
  await wait(2200);
  ok(await barVisible(page) && await page.evaluate(() => /Instale o Estoura/.test(document.getElementById("install-bar").textContent) && !!document.getElementById("install-go")), "no 1º acesso, quando o navegador libera, aparece o aviso com o botão Instalar");
  await page.screenshot({ path: path.join(OUT, "instalar-android.png") });
  await page.click("#install-go");
  ok(await page.evaluate(() => window.__prompted === 1) && !(await barVisible(page)), "Instalar abre o pedido do navegador e fecha o aviso");
  await page.reload({ waitUntil: "load" });
  await fakeInstallEvent(page);
  await wait(2200);
  ok(!(await barVisible(page)), "no 2º acesso o aviso não volta");
  await ctx.close();
}
{
  const { page, ctx } = await open();
  await fakeInstallEvent(page);
  await wait(2200);
  await page.click("#install-x");
  ok(!(await barVisible(page)) && await page.evaluate(() => localStorage.getItem("estoura-install-seen") === "1"), "o X fecha e não pergunta de novo");
  await ctx.close();
}
// espera a tela de boas-vindas fechar
{
  const { page, ctx } = await open({ welcomeSeen: false });
  await fakeInstallEvent(page);
  await wait(2200);
  ok(await page.evaluate(() => !!document.querySelector(".sheet")) && !(await barVisible(page)), "com a tela de boas-vindas aberta, o aviso espera");
  await page.evaluate(() => closeLayer());
  await wait(2200);
  ok(await barVisible(page), "fechou a boas-vindas: o aviso aparece");
  await ctx.close();
}
// ---------- iPhone: passo a passo ----------
{
  const { page, ctx } = await open({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  await wait(2200);
  ok(await barVisible(page) && await page.evaluate(() => /Adicionar à Tela de Início/.test(document.getElementById("install-bar").textContent)), "no iPhone o aviso explica: Compartilhar › Adicionar à Tela de Início");
  await page.screenshot({ path: path.join(OUT, "instalar-iphone.png") });
  await page.click("#install-x");
  ok(!(await barVisible(page)), "'Entendi' fecha o aviso");
  await ctx.close();
}
// ---------- já instalado ----------
{
  const { page, ctx } = await open();
  await page.evaluate(() => localStorage.removeItem("estoura-install-seen"));
  let emulated = true;
  try { await page.emulateMediaFeatures([{ name: "display-mode", value: "standalone" }]); } catch { emulated = false; }
  if (emulated && await page.evaluate(() => matchMedia("(display-mode: standalone)").matches)) {
    await page.reload({ waitUntil: "load" });
    await fakeInstallEvent(page);
    await wait(2200);
    ok(!(await barVisible(page)), "com o app já instalado (tela cheia), o aviso não aparece");
  } else console.log("(pulado: o Chrome de teste não emula display-mode)");
  await ctx.close();
}
console.log(fails ? `\n${fails} FALHA(S)` : "\nTUDO OK");
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
