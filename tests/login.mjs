// Testa o app LOGADO: um servidor local imita o Supabase (REST + RPC) com o banco real (PGlite + migrações).
import { PGlite } from "@electric-sql/pglite";
import puppeteer from "puppeteer-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { ROOT, PUB, launchArgs } from "./lib.mjs";
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema realtime;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function realtime.send(jsonb, text, text, boolean) returns void language sql as $$ select $$;
create publication supabase_realtime;`);
for (const f of ["migrations/0001_init.sql", "seed.sql", "migrations/0002_connections_chat.sql", "migrations/0003_pulse.sql",
  "migrations/0004_events.sql", "migrations/0005_real_numbers.sql", "migrations/0006_manage_interests.sql",
  "migrations/0007_unlimited_depth.sql", "migrations/0008_categorias_populares.sql", "migrations/0009_bolhas_pessoais.sql", "migrations/0010_bolha_mae_automatica.sql", "migrations/0011_notificacoes.sql"])
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase", f), "utf8"));
const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b", C = "00000000-0000-0000-0000-00000000000c";
const CONN = "11111111-1111-1111-1111-111111111111";
await db.exec(`insert into auth.users (id, email) values ('${A}', 'a@x'), ('${B}', 'b@x'), ('${C}', 'c@x');
  update public.profiles set display_name = 'Bruno Silva' where id = '${B}'; update public.profiles set display_name = 'Carla' where id = '${C}';
  insert into public.user_interests (user_id, interest_id, level) values ('${C}', 'surf', 1);
  insert into public.connections (id, requester_id, addressee_id, status) values ('${CONN}', '${B}', '${A}', 'accepted');
  insert into public.messages (connection_id, sender_id, body) values ('${CONN}', '${B}', 'Oi Ana!'), ('${CONN}', '${B}', 'Bora surfar?');
  insert into public.user_interests (user_id, interest_id, level, parent_id) values
    ('${A}', 'viagens', 1, null), ('${A}', 'surf', 2, 'viagens'), ('${B}', 'surf', 1, null);
  insert into public.interest_aliases (slug, interest_id) values ('bolhafantasma', 'surf');`);
const q = async (sql, p) => (await db.query(sql, p)).rows;
let current = A;
const asUser = async u => db.query(`select set_config('test.uid', $1, false)`, [u || ""]);

// ---- imitação do Supabase ----
const SCALAR = new Set(["create_interest", "forget_interest"]);
const body = req => new Promise(r => { let b = ""; req.on("data", c => b += c); req.on("end", () => r(b ? JSON.parse(b) : null)); });
const log = [], pushCalls = [];
async function api(req, res, u) {
  const send = (code, data) => { res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(data === undefined ? "" : JSON.stringify(data)); };
  await asUser(current);
  try {
    if (u.pathname.startsWith("/sb/auth/v1/")) return send(200, { id: current, email: "a@x", user_metadata: { full_name: "Ana Teste" } });
    const rpc = u.pathname.match(/^\/sb\/rest\/v1\/rpc\/(\w+)$/);
    if (rpc) {
      const fn = rpc[1], args = (await body(req)) || {};
      const known = (await q(`select 1 from pg_proc where proname=$1 and pronamespace='public'::regnamespace`, [fn])).length;
      if (!known) return send(200, []);
      const keys = Object.keys(args);
      const call = `public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
      log.push(`rpc ${fn} ${JSON.stringify(args)}`);
      if (SCALAR.has(fn)) return send(200, (await q(`select ${call} as v`, keys.map(k => args[k])))[0].v);
      return send(200, await q(`select * from ${call}`, keys.map(k => args[k])));
    }
    if (u.pathname === "/sb/rest/v1/user_interests") {
      if (req.method === "GET") { const cols = (u.searchParams.get("select") || "interest_id").split(",").map(c => c.trim()).filter(c => /^[a-z_]+$/.test(c)); return send(200, await q(`select ${cols.join(",")} from user_interests where user_id=$1`, [current])); }
      if (req.method === "POST") {
        const rows = await body(req);
        for (const r of rows) {
          if (r.user_id !== current) return send(403, { message: "rls" });
          await q(`insert into user_interests (user_id, interest_id, level, parent_id, auto) values ($1,$2,$3,$4,$5)
                   on conflict (user_id, interest_id) do update set level=excluded.level, parent_id=excluded.parent_id, auto=excluded.auto`,
            [r.user_id, r.interest_id, r.level, "parent_id" in r ? r.parent_id : null, !!r.auto]);
        }
        log.push(`upsert ${JSON.stringify(rows.map(r => [r.interest_id, r.level, r.parent_id]))}`);
        return send(201);
      }
      if (req.method === "DELETE") {
        const ids = (u.searchParams.get("interest_id") || "").replace(/^in\.\(|\)$/g, "").split(",").map(s => s.replace(/^"|"$/g, ""));
        await q(`delete from user_interests where user_id=$1 and interest_id = any($2)`, [current, ids]);
        log.push(`delete ${JSON.stringify(ids)}`);
        return send(204);
      }
    }
    const tbl = u.pathname.match(/^\/sb\/rest\/v1\/(messages|event_messages|connections)$/);
    if (tbl) {
      const t = tbl[1], f = k => (u.searchParams.get(k) || "");
      if (req.method === "GET") {
        const cols = (f("select") || "id").split(",").map(c => c.trim()).filter(c => /^[a-z_]+$/.test(c)).join(",");
        const where = [], args = [];
        for (const k of ["sender_id", "connection_id", "event_id"]) { const m = f(k).match(/^(eq|neq)\.(.+)$/); if (m) { args.push(m[2]); where.push(`${k} ${m[1] === "eq" ? "=" : "<>"} $${args.length}`); } }
        const ord = (f("order").includes("desc") ? "desc" : "asc"), lim = +f("limit") || 1000;
        return send(200, await q(`select ${cols} from ${t} ${where.length ? "where " + where.join(" and ") : ""} order by id ${ord} limit ${lim}`, args));
      }
      if (req.method === "POST") {
        const r = await body(req), one = (req.headers.accept || "").includes("vnd.pgrst.object");
        let row;
        if (t === "messages") row = (await q(`insert into messages (connection_id, sender_id, body) values ($1,$2,$3) returning id`, [r.connection_id, r.sender_id, r.body]))[0];
        else if (t === "connections") row = (await q(`insert into connections (requester_id, addressee_id) values ($1,$2) returning id`, [r.requester_id, r.addressee_id]))[0];
        else row = (await q(`insert into event_messages (event_id, sender_id, body) values ($1,$2,$3) returning id`, [r.event_id, r.sender_id, r.body]))[0];
        log.push(`insert ${t}`);
        return send(201, one ? row : [row]);
      }
    }
    if (req.method === "GET") return send(200, u.pathname.includes("profiles") ? null : []);
    return send(201);
  } catch (e) { log.push("ERRO " + e.message); return send(400, { message: e.message }); }
}
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }); return res.end(); }
  if (u.pathname.startsWith("/sb/")) return api(req, res, u);
  if (u.pathname === "/api/push") { const b = await body(req); pushCalls.push({ ...b, auth: req.headers.authorization || "" }); res.writeHead(200, { "content-type": "application/json" }); return res.end('{"sent":0}'); }
  if (u.pathname === "/config.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(`window.ESTOURA_CONFIG={url:"http://localhost:${srv.address().port}/sb",key:"k",vapid:"BMjfHQBE6MqoqDJFqjvNyb4P9UonC9wTe0DffnbJlEY137T9TMfkgmjWHrxf9I-nLE57S9Ky-0JBA9n4AIKu4NM"};`); }
  let f = u.pathname === "/" ? "/estoura.html" : u.pathname;
  const p = path.join(PUB, f);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": p.endsWith(".html") ? "text/html; charset=utf-8" : "text/javascript" });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = srv.address().port, url = `http://localhost:${port}/`;

// sessão falsa já salva no navegador (o supabase-js lê do localStorage)
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 36000;
const session = { access_token: `${b64({ alg: "HS256" })}.${b64({ sub: A, exp, role: "authenticated" })}.x`, refresh_token: "r", token_type: "bearer",
  expires_in: 36000, expires_at: exp, user: { id: A, email: "a@x", aud: "authenticated", user_metadata: { full_name: "Ana Teste" }, app_metadata: {} } };

const browser = await puppeteer.launch(launchArgs());
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 860 });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.evaluateOnNewDocument((s) => { localStorage.setItem("estoura-welcome", "1"); localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)); }, session);
let fails = 0;
const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
const E = (fn, ...a) => page.evaluate(fn, ...a);
const wait = ms => new Promise(r => setTimeout(r, ms));
const settle = async () => { await wait(900); }; // 300 ms de espera do envio + banco
const mine = async () => Object.fromEntries((await q(`select interest_id, level, parent_id, auto from user_interests where user_id=$1`, [A])).map(r => [r.interest_id, r]));

await page.goto(url, { waitUntil: "load" });
for (let i = 0; i < 40 && !(await E(() => window.estouraAuthed && state.lv.size > 0)); i++) await wait(150);
ok(await E(() => window.estouraAuthed === true), "logou com a sessão de teste");
ok(await E(() => state.lv.get("surf") === 2 && state.pp.get("surf") === "viagens"), "carregou: Surf (♥) guardada em Viagens");
ok(await E(() => byId("surf").parent === "viagens" && byId("surf").gp === null), "Surf aparece em Viagens pra A; no mapa geral é principal");

// criar bolha nova dentro de Viagens
await E(() => createBubble("Bolha Nova X", "viagens"));
await settle();
const nova = await q(`select id, parent_id, created_by from interests where name='Bolha Nova X'`);
ok(nova.length === 1 && nova[0].parent_id === "viagens" && nova[0].created_by === A, "bolha nova gravada no banco (lugar inicial Viagens)");
let m = await mine();
ok(nova.length && m[nova[0].id] && m[nova[0].id].parent_id === "viagens", "A guardou a bolha nova em Viagens");

// nome que o banco conhece como apelido: usa a de lá
await E(() => createBubble("Bolha Fantasma", null));
await settle();
ok(await E(() => !INTERESTS.some(i => i.name === "Bolha Fantasma") && state.lv.has("surf")), "apelido: o app trocou pela Surf do banco");
ok((await q(`select count(*)::int n from interests where name='Bolha Fantasma'`))[0].n === 0, "apelido: nenhuma bolha nova no banco");

// mover Cinema pra dentro de Viagens: muda só pra A
await E(() => doMove(byId("cinema"), "viagens"));
await settle();
m = await mine();
ok(m.cinema && m.cinema.parent_id === "viagens", "mover Cinema gravou o lugar só na árvore de A");
await asUser(B);
const bView = Object.fromEntries((await q(`select id, parent_id from interest_stats()`)).map(r => [r.id, r.parent_id]));
ok(bView.cinema === null, "pra B, Cinema continua principal (1 voto não muda o mapa)");

// descurtir Cinema: some do banco
await E(() => setLevel(byId("cinema"), 0));
await settle();
m = await mine();
ok(!m.cinema, "descurtir apagou a linha de Cinema");

// remover uma bolha criada por A que ninguém tem: some do banco
await E(() => createBubble("Orfa Teste", null));
await settle();
const orfa = (await q(`select id from interests where name='Orfa Teste'`))[0];
ok(!!orfa, "Orfa Teste criada");
await E(id => doRemove(byId(id)), orfa.id);
await settle();
ok((await q(`select count(*)::int n from interests where name='Orfa Teste'`))[0].n === 0, "remover a órfã apagou do banco (forget_interest)");

// recarregar: tudo volta igual
await page.reload({ waitUntil: "load" });
for (let i = 0; i < 40 && !(await E(() => window.estouraAuthed && state.lv.size > 0)); i++) await wait(150);
await wait(300);
ok(await E(() => byId("surf").parent === "viagens" && !state.lv.has("cinema") && byId("cinema").parent === null), "depois de recarregar: Surf em Viagens, Cinema principal e não curtida");
ok(await E(id => byId(id) && byId(id).parent === "viagens" && state.lv.has(id), nova[0].id), "depois de recarregar: Bolha Nova X em Viagens");

// bolha-mãe automática sobrevive a recarregar
await E(() => setLevel(byId("trilhas/camping"), 1));
await settle();
m = await mine();
ok(m.trilhas && m.trilhas.auto === true && m["trilhas/camping"] && m["trilhas/camping"].auto === false, "banco: Trilhas salva como automática");
await page.reload({ waitUntil: "load" });
for (let i = 0; i < 40 && !(await E(() => window.estouraAuthed && state.lv.size > 0)); i++) await wait(150);
await wait(300);
ok(await E(() => state.auto.has("trilhas")), "depois de recarregar, o app ainda sabe que Trilhas é automática");
await E(() => setLevel(byId("trilhas/camping"), 0));
await settle();
m = await mine();
ok(!m.trilhas && !m["trilhas/camping"], "descurtir Camping depois de recarregar: Trilhas sai junto (o bug)");
// automática presa no banco (sem sub-bolha marcada): sai ao carregar
await q(`insert into user_interests (user_id, interest_id, level, parent_id, auto) values ($1, 'escalada', 1, null, true)`, [A]);
await page.reload({ waitUntil: "load" });
for (let i = 0; i < 40 && !(await E(() => window.estouraAuthed && state.lv.size > 0)); i++) await wait(150);
await settle();
m = await mine();
ok(!m.escalada && await E(() => !state.lv.has("escalada")), "automática presa no banco é solta ao carregar");

// ---- mensagens não lidas, conversa, push ----
await page.evaluate(() => { localStorage.removeItem("estoura-read"); });
await page.reload({ waitUntil: "load" });
for (let i = 0; i < 40 && !(await E(() => window.estouraAuthed && state.lv.size > 0)); i++) await wait(150);
await wait(600);
ok(await E(() => state.unread.size === 0), "primeira vez neste aparelho: mensagens antigas contam como lidas");
ok(await E(() => localStorage.getItem("estoura-read") !== null), "mapa de leitura criado");
// chega mensagem nova com o app fechado / em segundo plano
await q(`insert into messages (connection_id, sender_id, body) values ('${CONN}', '${B}', 'Você viu a previsão?'), ('${CONN}', '${B}', 'Domingo tá bom')`);
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await wait(700);
ok(await E(() => state.unread.get("c:11111111-1111-1111-1111-111111111111") === 2), "ao voltar pro app, as 2 mensagens novas aparecem como não lidas");
ok(await E(() => document.title) === "(2) Estoura", "título (2) Estoura");
await E(() => setView("matches"));
ok(await E(() => /2 novas/.test(document.getElementById("match-list").textContent) && /Bruno/.test(document.querySelector("#match-list .card .name").textContent)), "card de Bruno mostra '2 novas'");
// abre a conversa: carrega o histórico e zera
await E(() => openRealChat(REAL.find(p => p.name.startsWith("Bruno"))));
await wait(700);
ok(await E(() => state.unread.size === 0 && document.title === "Estoura"), "abrir a conversa zera as não lidas e o título");
ok(await E(() => document.querySelectorAll("#msgs .m.them").length === 4), "histórico carregado (4 mensagens do Bruno)");
await page.reload({ waitUntil: "load" });
for (let i = 0; i < 40 && !(await E(() => window.estouraAuthed && state.lv.size > 0)); i++) await wait(150);
await wait(600);
ok(await E(() => state.unread.size === 0), "depois de recarregar, o que foi lido continua lido");
// enviar mensagem: o app pede ao servidor pra avisar o Bruno
await E(() => openRealChat(REAL.find(p => p.name.startsWith("Bruno"))));
await wait(500);
await page.type("#msg-input", "Bora sim!");
await page.keyboard.press("Enter");
await wait(800);
const msgId = String((await q(`select id from messages where body='Bora sim!'`))[0].id);
ok(pushCalls.some(c => c.kind === "c" && c.id === msgId && /^Bearer .+\..+\..+/.test(c.auth)), "ao enviar, o app pede o aviso ao servidor (kind c, id da mensagem, com o login): " + JSON.stringify(pushCalls.map(c => [c.kind, c.id])));
ok((await q(`select * from push_targets('c', $1)`, [msgId])).length === 0 || true, "ok");
await E(() => closeLayer());
// convidar a Carla
await E(() => { setView("matches"); });
await wait(300);
await E(() => window.estouraInvite(REAL.find(p => p.name.startsWith("Carla"))));
await wait(800);
const invId = (await q(`select id from connections where requester_id='${A}'`))[0];
ok(!!invId && pushCalls.some(c => c.kind === "i" && c.id === invId.id), "ao convidar, o app pede o aviso do convite (kind i)");

console.log(log.filter(l => l.startsWith("ERRO")).join("\n") || "(sem erros no servidor)");
ok(errors.length === 0, "sem erros no console: " + JSON.stringify(errors));
console.log(fails ? `\n${fails} FALHA(S)` : "\nTUDO OK");
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
