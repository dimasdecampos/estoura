// Roda as migrações num Postgres embutido (PGlite) e testa as regras novas do 0009.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { ROOT } from "./lib.mjs";

const db = new PGlite();
const run = async (sql) => db.exec(sql);
const q = async (sql, p) => (await db.query(sql, p)).rows;
let fails = 0;
const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };

// stubs do Supabase
await run(`
create role anon; create role authenticated;
create schema auth; create schema realtime;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function realtime.send(jsonb, text, text, boolean) returns void language sql as $$ select $$;
create publication supabase_realtime;
`);
const file = f => fs.readFileSync(`${ROOT}/supabase/${f}`, "utf8");
for (const f of ["migrations/0001_init.sql", "seed.sql", "migrations/0002_connections_chat.sql", "migrations/0003_pulse.sql",
  "migrations/0004_events.sql", "migrations/0005_real_numbers.sql", "migrations/0006_manage_interests.sql",
  "migrations/0007_unlimited_depth.sql", "migrations/0008_categorias_populares.sql"]) {
  await run(file(f));
}
console.log("0001-0008 ok");

const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b", C = "00000000-0000-0000-0000-00000000000c";
for (const u of [A, B, C]) await run(`insert into auth.users (id, email) values ('${u}', '${u}@x')`);
const as = async (u) => run(`select set_config('test.uid', '${u || ""}', false)`);

// dados "antigos": duplicadas criadas por usuários
await run(`
insert into public.interests (id, name, parent_id, hue, created_by) values
  ('viagens/u1', 'surf ', 'viagens', 10, '${A}'),          -- duplicada de 'surf' (seed)
  ('u2', 'Hip-Hop', null, 20, '${A}'),
  ('musica/u3', 'hip hop', 'musica', 30, '${B}'),          -- duplicada de Hip-Hop, mais gente
  ('u4', 'Pipas Raras', null, 40, '${A}');
insert into public.user_interests (user_id, interest_id, level) values
  ('${A}', 'viagens', 1), ('${A}', 'viagens/u1', 2),
  ('${B}', 'surf', 1),    ('${B}', 'viagens/u1', 1),
  ('${A}', 'u2', 1),
  ('${B}', 'musica', 1), ('${B}', 'musica/u3', 1), ('${C}', 'musica', 1), ('${C}', 'musica/u3', 2);
`);

await run(file("migrations/0009_bolhas_pessoais.sql"));
console.log("0009 ok");
await run(file("migrations/0009_bolhas_pessoais.sql"));
console.log("0009 rodou de novo sem erro");

// fusão das duplicadas
ok((await q(`select id from interests where slug='surf'`)).map(r => r.id).join() === "surf", "surf duplicada fundida na do seed");
const aSurf = await q(`select level, parent_id from user_interests where user_id=$1 and interest_id='surf'`, [A]);
ok(aSurf.length === 1 && aSurf[0].level === 2 && aSurf[0].parent_id === "viagens", "A ficou com surf, nível 2, guardada em viagens (onde A tinha)");
const bSurf = await q(`select level from user_interests where user_id=$1 and interest_id='surf'`, [B]);
ok(bSurf.length === 1 && bSurf[0].level === 1, "B tinha as duas: ficou uma só");
const hip = await q(`select id from interests where slug='hiphop'`);
ok(hip.length === 1 && hip[0].id === "danca/hiphop", "hip hop: ficou a original do 0008 (" + hip.map(r => r.id) + ")");
ok((await q(`select interest_id from interest_aliases where slug='surf'`)).length === 0, "sem apelido inútil quando o nome é igual");
ok((await q(`select count(*)::int n from interest_log where action='merge'`))[0].n === 3, "fusões registradas no histórico");

// backfill: onde cada um guardou
const cHip = await q(`select parent_id, level from user_interests where user_id=$1 and interest_id='danca/hiphop'`, [C]);
ok(cHip[0].parent_id === "musica", "backfill + fusão: C continua com hip hop guardada em música (nível " + cHip[0].level + ")");

// create_interest
await as(A);
ok((await q(`select public.create_interest('u9', 'SURF', 'futebol', 50) as id`))[0].id === "surf", "criar 'SURF' devolve a bolha Surf que já existe");
const kk=(await q(`select public.create_interest('u10', '  pipas   RARAS ', null, 50) as id`))[0].id; console.log("KITE", kk); ok(kk === "u4", "criar 'pipas RARAS' devolve Pipas Raras");
ok((await q(`select public.create_interest('u11', 'Beach Tennis', 'viagens', 400) as id`))[0].id === "u11", "nome novo cria bolha nova");
ok((await q(`select hue, parent_id, created_by from interests where id='u11'`))[0].hue === 359, "matiz limitada a 359");
let threw = false; try { await q(`select public.create_interest('u12', '', null, 1)`); } catch { threw = true; }
ok(threw, "nome vazio é recusado");
await as(null); threw = false; try { await q(`select public.create_interest('u13', 'X', null, 1)`); } catch { threw = true; }
ok(threw, "sem login não cria");
// apelido
await run(`select public._merge_interests('u4', 'surf')`);
await as(B);
ok((await q(`select public.create_interest('u14', 'Pipas-raras', null, 1) as id`))[0].id === "surf", "nome de bolha fundida (apelido) cai na que ficou");

// mapa de todo mundo: votos
const stats = async (u) => { await as(u); return Object.fromEntries((await q(`select * from interest_stats()`)).map(r => [r.id, r])); };
let s = await stats(A);
ok(s["surf"].parent_id === null, "surf: 1 em viagens x 1 na raiz + lugar inicial: fica na raiz");
await run(`insert into user_interests (user_id, interest_id, level, parent_id) values ('${C}', 'surf', 1, 'viagens')`);
s = await stats(A);
ok(s["surf"].parent_id === null, "2 pessoas em viagens ainda não vencem 1 + lugar inicial (2)");
await run(`update user_interests set parent_id='viagens' where user_id='${B}' and interest_id='surf'`);
s = await stats(A);
ok(s["surf"].parent_id === "viagens", "3 pessoas em viagens: surf passa pra viagens no mapa de todo mundo");
ok(Array.isArray(s["surf"].places) && s["surf"].places.length === 1 && s["surf"].places[0].n === 3, "places mostra os dois lugares: " + JSON.stringify(s["surf"].places));
ok(s["surf"].people === 3 && s["surf"].custom === false, "contagem e custom");

// bolha órfã: só quem criou vê
ok(!!s["u11"], "A vê a Beach Tennis que criou (ninguém tem)");
s = await stats(B);
ok(!s["u11"], "B não vê bolha criada por outro que ninguém tem");
await run(`insert into user_interests (user_id, interest_id, level, parent_id) values ('${B}', 'u11', 1, 'viagens')`);
s = await stats(C);
ok(!!s["u11"] && s["u11"].parent_id === "viagens", "quando alguém tem, todo mundo vê");

// ciclo: A dentro de B e B dentro de A pelos votos
await run(`insert into interests (id, name, parent_id, hue) values ('ca', 'Ciclo A', null, 1), ('cb', 'Ciclo B', null, 1)`);
await run(`insert into user_interests (user_id, interest_id, level, parent_id) values
  ('${A}', 'ca', 1, 'cb'), ('${B}', 'ca', 1, 'cb'), ('${C}', 'ca', 1, 'cb'),
  ('${A}', 'cb', 1, 'ca'), ('${B}', 'cb', 1, 'ca'), ('${C}', 'cb', 1, 'ca')`);
s = await stats(A);
ok((s["ca"].parent_id === null) !== (s["cb"].parent_id === null), `ciclo quebrado: ca->${s["ca"].parent_id}, cb->${s["cb"].parent_id}`);

// forget: só quem criou, só se ninguém tem
await as(A);
await run(`select public.create_interest('u20', 'Origami', null, 5)`);
await as(B);
ok((await q(`select public.forget_interest('u20') as r`))[0].r === false, "B não apaga bolha de A");
await as(A);
await run(`insert into user_interests (user_id, interest_id, level) values ('${A}', 'u20', 1)`);
ok((await q(`select public.forget_interest('u20') as r`))[0].r === false, "não apaga enquanto alguém tem");
await run(`delete from user_interests where interest_id='u20'`);
ok((await q(`select public.forget_interest('u20') as r`))[0].r === true, "apaga quando ninguém tem");
ok((await q(`select public.forget_interest('surf') as r`))[0].r === false, "bolha do seed nunca é apagada assim");

// o que não é mais usado foi apagado
const gone = await q(`select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('move_interest','delete_interest','merge_interests','can_manage_interests')`);
ok(gone.length === 0, "funções de mover/excluir para todos foram apagadas: " + JSON.stringify(gone));
ok((await q(`select to_regclass('public.admins') as t`))[0].t === null, "tabela admins não existe");
// excluir pelo SQL Editor (como dono do banco) não leva junto o que estava dentro
await run(`delete from interests where id='surf'`);
ok((await q(`select count(*)::int n from interests where id in ('surf/longboard','surf/bodyboard')`))[0].n === 2, "excluir surf não leva junto o que estava dentro");
ok((await q(`select count(*)::int n from user_interests where parent_id='surf'`))[0].n === 0, "quem guardava algo dentro de surf: vira principal");

// check: bolha dentro dela mesma
threw = false; try { await run(`insert into user_interests (user_id, interest_id, level, parent_id) values ('${A}', 'yoga', 1, 'yoga')`); } catch { threw = true; }
ok(threw, "bolha não pode ser guardada dentro dela mesma");

// my_matches continua pela bolha em si
await as(B);
const m = await q(`select distinct user_id from my_matches()`);
ok(m.length >= 1, "my_matches funciona: " + m.length + " pessoas");

// 0010: bolha-mãe automática
await run(`delete from user_interests where user_id in ('${A}','${C}')`);
await as(A); await run(`select public.create_interest('mx', 'Mae Criada', null, 1)`);
await run(`insert into user_interests (user_id, interest_id, level, parent_id) values
  ('${A}', 'trilhas', 1, null), ('${A}', 'trilhas/camping', 1, 'trilhas'),
  ('${A}', 'cinema', 1, null),
  ('${A}', 'viagens', 2, null), ('${A}', 'viagens/mochilao', 1, 'viagens'),
  ('${A}', 'mx', 1, null), ('${A}', 'yoga', 1, 'mx'),
  ('${C}', 'corrida', 1, null), ('${C}', 'corrida/maratona', 1, 'corrida')`);
await run(file("migrations/0010_bolha_mae_automatica.sql"));
await run(file("migrations/0010_bolha_mae_automatica.sql"));
const au = Object.fromEntries((await q(`select user_id||':'||interest_id k, auto from user_interests`)).map(r => [r.k, r.auto]));
ok(au[A + ":trilhas"] === true, "0010: Trilhas (com Camping marcada) virou automática");
ok(au[C + ":corrida"] === true, "0010: Corrida de C (com Maratona) virou automática");
ok(au[A + ":cinema"] === false, "0010: Cinema sem sub-bolha marcada continua (não desmarca nada)");
ok(au[A + ":viagens"] === false, "0010: Viagens com ♥ não vira automática");
ok(au[A + ":mx"] === false, "0010: bolha criada pela pessoa não vira automática");
ok(au[A + ":trilhas/camping"] === false, "0010: a sub-bolha em si não é automática");

// 0012: bolhas públicas (sem login)
await run(file("migrations/0011_notificacoes.sql"));
await run(file("migrations/0012_bolhas_publicas.sql"));
await run(file("migrations/0012_bolhas_publicas.sql"));
ok((await q(`select has_function_privilege('anon', 'public.public_interest_stats()', 'execute') as p`))[0].p === true, "visitante (sem login) pode chamar public_interest_stats()");
ok((await q(`select has_function_privilege('anon', 'public.interest_stats()', 'execute') as p`))[0].p === false, "visitante não chama interest_stats() direto");
ok((await q(`select has_function_privilege('anon', 'public.my_matches()', 'execute') as p`))[0].p === false, "visitante não vê matches");
await as(null);
const pub = await q(`select * from public_interest_stats()`);
ok(pub.length > 100 && pub.every(r => !("user_id" in r)) && Object.keys(pub[0]).join() === "id,name,parent_id,hue,week_count,people,total,custom,places", "visitante recebe só números por bolha (" + pub.length + " bolhas, colunas: " + Object.keys(pub[0]).join() + ")");
await run(`delete from user_interests; insert into user_interests (user_id, interest_id, level, parent_id) values ('${A}', 'cinema', 1, null), ('${B}', 'cinema', 1, null), ('${B}', 'yoga', 1, null)`);
const pub2 = Object.fromEntries((await q(`select id, people from public_interest_stats()`)).map(r => [r.id, r.people]));
ok(pub2.cinema === 2 && pub2.yoga === 1 && pub2.futebol === 0, "visitante vê a quantidade de pessoas por bolha (cinema 2, yoga 1, futebol 0)");
await as(A); await run(`select public.create_interest('uorf', 'Bolha Orfa Visitante', null, 1)`); await as(null);
ok(!(await q(`select id from public_interest_stats()`)).some(r => r.id === "uorf"), "bolha criada por alguém e que ninguém mais tem não aparece pro visitante");

console.log(fails ? `\n${fails} FALHA(S)` : "\nTUDO OK");
process.exit(fails ? 1 : 0);
