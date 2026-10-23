// Testa a migração 0011 (notificações push) num Postgres embutido.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { ROOT } from "./lib.mjs";
const db = new PGlite();
const run = sql => db.exec(sql);
const q = async (sql, p) => (await db.query(sql, p)).rows;
let fails = 0;
const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
await run(`
create role anon; create role authenticated;
create schema auth; create schema realtime;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function realtime.send(jsonb, text, text, boolean) returns void language sql as $$ select $$;
create publication supabase_realtime;`);
const file = f => fs.readFileSync(`${ROOT}/supabase/${f}`, "utf8");
for (const f of ["migrations/0001_init.sql", "seed.sql", "migrations/0002_connections_chat.sql", "migrations/0003_pulse.sql",
  "migrations/0004_events.sql", "migrations/0005_real_numbers.sql", "migrations/0006_manage_interests.sql",
  "migrations/0007_unlimited_depth.sql", "migrations/0008_categorias_populares.sql", "migrations/0009_bolhas_pessoais.sql",
  "migrations/0010_bolha_mae_automatica.sql", "migrations/0011_notificacoes.sql"]) await run(file(f));
await run(file("migrations/0011_notificacoes.sql"));
console.log("0001-0011 ok (0011 duas vezes)");

const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b", C = "00000000-0000-0000-0000-00000000000c";
for (const u of [A, B, C]) await run(`insert into auth.users (id, email) values ('${u}', '${u}@x')`);
await run(`update profiles set display_name = 'Ana Souza' where id='${A}'; update profiles set display_name = 'Bruno' where id='${B}'`);
const as = u => run(`select set_config('test.uid', '${u || ""}', false)`);
const thr = async fn => { try { await fn(); return false; } catch { return true; } };

// aparelhos
await as(B);
await q(`select save_push_subscription('https://push.example/b1', 'k1', 'a1')`);
await q(`select save_push_subscription('https://push.example/b2', 'k2', 'a2')`);
await as(C);
await q(`select save_push_subscription('https://push.example/c1', 'k3', 'a3')`);
ok((await q(`select count(*)::int n from push_subscriptions`))[0].n === 3, "3 aparelhos gravados");
ok(await thr(() => q(`select save_push_subscription('http://inseguro', 'k', 'a')`)), "endpoint sem https é recusado");
await as(null);
ok(await thr(() => q(`select save_push_subscription('https://x/y', 'k', 'a')`)), "sem login não grava aparelho");
// mesmo aparelho em outra conta passa a ser da conta atual
await as(A);
await q(`select save_push_subscription('https://push.example/b2', 'k2b', 'a2b')`);
ok((await q(`select user_id from push_subscriptions where endpoint='https://push.example/b2'`))[0].user_id === A, "aparelho trocou de dono ao entrar em outra conta");
await q(`select save_push_subscription('https://push.example/b2', 'k2', 'a2')`);
await as(B); await q(`select save_push_subscription('https://push.example/b2', 'k2', 'a2')`);
// limite de 5
await as(C);
for (let i = 0; i < 7; i++) await q(`select save_push_subscription($1, 'k', 'a')`, [`https://push.example/many${i}`]);
ok((await q(`select count(*)::int n from push_subscriptions where user_id='${C}'`))[0].n === 5, "no máximo 5 aparelhos por pessoa");
// ninguém apaga aparelho de outro
await as(A);
await q(`select delete_push_subscription('https://push.example/b1')`);
ok((await q(`select count(*)::int n from push_subscriptions where endpoint='https://push.example/b1'`))[0].n === 1, "A não consegue apagar o aparelho de B");
await as(B);
await q(`select delete_push_subscription('https://push.example/b2')`);
await q(`select save_push_subscription('https://push.example/b2', 'k2', 'a2')`);
ok((await q(`select count(*)::int n from push_subscriptions where user_id='${B}'`))[0].n === 2, "B tem 2 aparelhos");

// conexão A -> B (pendente) e convite
await run(`insert into connections (id, requester_id, addressee_id, status) values ('11111111-1111-1111-1111-111111111111', '${A}', '${B}', 'pending')`);
await as(A);
let t = await q(`select * from push_targets('i', '11111111-1111-1111-1111-111111111111')`);
ok(t.length === 2 && t.every(r => r.title === "Novo convite" && /Ana Souza convidou/.test(r.body) && r.url === "/?tab=matches"), "convite avisa os 2 aparelhos de B");
ok((await q(`select * from push_targets('i', '11111111-1111-1111-1111-111111111111')`)).length === 0, "o mesmo convite não avisa duas vezes");
await as(B);
ok((await q(`select * from push_targets('a', '11111111-1111-1111-1111-111111111111')`)).length === 0, "não dá pra avisar 'aceitou' antes de aceitar");
await q(`select respond_connection('11111111-1111-1111-1111-111111111111', true)`);
// aceita: B avisa A (A não tem aparelho) -> vazio, mas sem erro; dá A um aparelho
await as(A); await q(`select save_push_subscription('https://push.example/a1', 'k9', 'a9')`);
await as(B);
t = await q(`select * from push_targets('a', '11111111-1111-1111-1111-111111111111')`);
ok(t.length === 1 && t[0].endpoint === "https://push.example/a1" && /Bruno aceitou/.test(t[0].body) && t[0].url === "/?chat=c:11111111-1111-1111-1111-111111111111", "aceite avisa A e abre a conversa");

// mensagens
await run(`insert into messages (connection_id, sender_id, body) values
  ('11111111-1111-1111-1111-111111111111', '${A}', 'Oi Bruno, bora surfar?'),
  ('11111111-1111-1111-1111-111111111111', '${A}', 'segunda mensagem')`);
const ids = (await q(`select id from messages order by id`)).map(r => String(r.id));
await as(A);
t = await q(`select * from push_targets('c', $1)`, [ids[0]]);
ok(t.length === 2 && t[0].title === "Ana Souza" && t[0].body === "Oi Bruno, bora surfar?" && t[0].tag === `c:11111111-1111-1111-1111-111111111111#${ids[0]}`, "mensagem avisa B com nome e texto; etiqueta por mensagem");
ok((await q(`select * from push_targets('c', $1)`, [ids[0]])).length === 0, "a mesma mensagem não avisa duas vezes");
t = await q(`select * from push_targets('c', $1)`, [ids[1]]);
ok(t.length === 2 && t[0].tag.endsWith("#" + ids[1]), "a segunda mensagem avisa de novo");
await as(B);
ok((await q(`select * from push_targets('c', $1)`, [ids[1]])).length === 0, "B não consegue pedir aviso de mensagem que A enviou");
await as(C);
ok((await q(`select * from push_targets('c', $1)`, [ids[1]])).length === 0, "C (de fora) não consegue pedir aviso");
await as(null);
ok(await thr(() => q(`select * from push_targets('c', '1')`)), "sem login não pede aviso");
await as(A);
ok((await q(`select * from push_targets('x', '1')`)).length === 0, "tipo desconhecido não faz nada");

// evento
await run(`insert into events (id, created_by, interest_id, title, place, city, lat, lng, starts_at)
  values ('22222222-2222-2222-2222-222222222222', '${A}', 'surf', 'Surf no domingo', 'Praia', 'Santos', -23.9, -46.3, now() + interval '2 days')
  on conflict do nothing`);
await run(`insert into event_attendees (event_id, user_id) values ('22222222-2222-2222-2222-222222222222', '${B}'), ('22222222-2222-2222-2222-222222222222', '${C}') on conflict do nothing`);
await run(`insert into event_messages (event_id, sender_id, body) values ('22222222-2222-2222-2222-222222222222', '${B}', 'Levo prancha extra')`);
const eid = String((await q(`select id from event_messages`))[0].id);
await as(B);
t = await q(`select * from push_targets('e', $1)`, [eid]);
const dests = t.map(r => r.endpoint).sort();
ok(t.length > 0 && t.every(r => r.title === "Surf no domingo" && r.body === "Bruno: Levo prancha extra" && r.url === "/?chat=e_22222222-2222-2222-2222-222222222222"), "mensagem de evento: título do evento, 'Bruno: texto'");
ok(!dests.some(e => e.includes("/b1") || e.includes("/b2")) && dests.some(e => e.includes("/a1") || e.includes("/many")), "evento avisa os outros que vão (e não quem enviou)");
console.log(fails ? `\n${fails} FALHA(S)` : "\nTUDO OK");
process.exit(fails ? 1 : 0);
