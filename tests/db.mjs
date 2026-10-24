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

// 0013: quem criou o evento pode editar
await run(file("migrations/0013_editar_evento.sql"));
await run(file("migrations/0013_editar_evento.sql"));
await run(`grant usage on schema public to authenticated; grant select, insert, update, delete on all tables in schema public to authenticated`);
await as(A);
await run(`insert into events (id, created_by, interest_id, title, place, city, lat, lng, starts_at) values ('00000000-0000-0000-0000-0000000000e1', '${A}', 'cinema', 'Cine', 'Praça', 'Ubatuba', -23.43, -45.08, now() + interval '2 days')`);
await run(`set role authenticated`);
const upA = await q(`update events set title = 'Cine 2', city = 'São Luiz do Paraitinga', lat = -23.22, lng = -45.31 where id = '00000000-0000-0000-0000-0000000000e1' returning id`);
ok(upA.length === 1, "0013: quem criou o evento consegue editar (nome, cidade e coordenadas)");
await as(B);
const upB = await q(`update events set title = 'Invadido' where id = '00000000-0000-0000-0000-0000000000e1' returning id`);
ok(upB.length === 0, "0013: outra pessoa não consegue editar o evento");
await as(A);
let stolen = false; try { stolen = (await q(`update events set created_by = '${B}' where id = '00000000-0000-0000-0000-0000000000e1' returning id`)).length > 0; } catch (e) {}
ok(!stolen, "0013: não dá pra passar o evento pra outra pessoa");
await run(`reset role`);
await as(null);

// 0014: painel de administração
await run(`alter table auth.users add column last_sign_in_at timestamptz`);
const OWNER = "00000000-0000-0000-0000-0000000000d1", ADM = "00000000-0000-0000-0000-0000000000d2", USR = "00000000-0000-0000-0000-0000000000d3", USR2 = "00000000-0000-0000-0000-0000000000d4";
await run(`insert into auth.users (id, email) values ('${ADM}', 'adm@x'), ('${USR}', 'usr@x'), ('${USR2}', 'usr2@x')`);
await run(file("migrations/0014_admin.sql"));
await run(file("migrations/0014_admin.sql"));
await run(`insert into auth.users (id, email) values ('${OWNER}', 'DimasRafting@gmail.com')`);
const roleOf = async id => { await run(`reset role`); const r = (await q(`select role from profiles where id = '${id}'`))[0]; await run(`set role authenticated`); return r && r.role; };
ok(await roleOf(OWNER) === "super_admin", "0014: o e-mail do dono nasce super_admin");
ok(await roleOf(USR) === "user", "0014: os outros nascem usuário comum");
await run(`set role authenticated`);
await as(USR);
let selfPromo = true; try { selfPromo = (await q(`update profiles set role = 'super_admin' where id = '${USR}' returning id`)).length > 0; } catch (e) { selfPromo = false; }
ok(!selfPromo, "0014: usuário comum não consegue se promover editando o perfil");
ok((await q(`update profiles set city = 'Santos' where id = '${USR}' returning id`)).length === 1, "0014: usuário ainda edita a própria cidade");
const denied = async sql => { try { await q(sql); return false; } catch (e) { return true; } };
ok(await denied(`select * from admin_list_users()`), "0014: usuário comum não lista usuários");
ok(await denied(`select admin_delete_user('${USR2}')`), "0014: usuário comum não exclui ninguém");
await run(`reset role`); await run(`select set_config('estoura.role_change', 'on', false); update profiles set role = 'admin' where id = '${ADM}'; select set_config('estoura.role_change', 'off', false)`);
await run(`set role authenticated`);
await as(ADM);
ok((await q(`select * from admin_list_users()`)).length >= 4, "0014: admin lista os usuários");
ok(await denied(`select admin_set_role('${USR}', 'admin')`), "0014: admin comum não muda papéis");
ok(await denied(`select admin_delete_user('${OWNER}')`), "0014: admin não exclui o super admin");
await q(`select admin_delete_user('${USR2}')`);
await run(`reset role`); const userGone = (await q(`select 1 from auth.users where id = '${USR2}'`)).length === 0; await run(`set role authenticated`);
ok(userGone && (await q(`select 1 from profiles where id = '${USR2}'`)).length === 0, "0014: admin exclui um usuário comum (conta e perfil somem)");
await as(OWNER);
await q(`select admin_set_role('${USR}', 'admin')`);
ok(await roleOf(USR) === "admin", "0014: super admin promove usuário a admin");
ok(await denied(`select admin_set_role('${OWNER}', 'user')`), "0014: super admin não muda o próprio papel");
ok(await denied(`select admin_set_role('${USR}', 'super_admin')`), "0014: não existe promover a super admin pela tela");
await q(`select admin_delete_user('${USR}')`);
ok((await q(`select 1 from profiles where id = '${USR}'`)).length === 0, "0014: super admin exclui um admin");
await run(`reset role`);
await as(null);

// 0015: quem ainda não aceitou conversar só recebe o primeiro nome (resto em asteriscos) e a foto embaçada
await run(file("migrations/0015_privacidade.sql"));
await run(file("migrations/0015_privacidade.sql"));
ok((await q(`select public.masked_name('Maria Clara  Souza') a, public.masked_name(null) b, public.masked_name('Carla') c`))
  .every(r => r.a === "Maria ***** *****" && r.b === "Alguém" && r.c === "Carla"), "0015: masked_name troca o resto do nome por asteriscos");
const BLUR = "data:image/jpeg;base64,AAAA";
await run(`update profiles set display_name = 'Bruno Lima Souza', avatar_url = 'https://foto/bruno.jpg', avatar_blur = '${BLUR}' where id = '${B}';
  update profiles set display_name = 'Ana Paula', avatar_url = 'https://foto/ana.jpg' where id = '${A}';
  delete from connections;
  insert into event_attendees (event_id, user_id) values ('00000000-0000-0000-0000-0000000000e1', '${B}');
  insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('${B}', 'https://push/b', 'k', 'a');`);
ok(await denied(`update profiles set avatar_blur = 'https://foto/original.jpg' where id = '${B}'`), "0015: a miniatura só aceita data:image (não dá pra pôr o link da foto original)");
const seen = async () => {
  const m = (await q(`select distinct display_name, avatar_url from my_matches() where user_id = $1`, [B]))[0];
  const c = (await q(`select display_name, avatar_url from connection_people()`))[0];
  const ev = (await q(`select attendees from upcoming_events() where id = '00000000-0000-0000-0000-0000000000e1'`))[0].attendees;
  return { m, c, b: ev.find(x => x.id === B), a: ev.find(x => x.id === A) };
};
await as(A);
const conn = (await q(`insert into connections (requester_id, addressee_id) values ('${A}', '${B}') returning id`))[0].id;
let v = await seen();
ok(v.m.display_name === "Bruno **** *****" && v.m.avatar_url === BLUR, "0015: matches antes do aceite: nome mascarado e só a foto embaçada (" + JSON.stringify(v.m) + ")");
ok(v.c.display_name === "Bruno **** *****" && v.c.avatar_url === BLUR, "0015: convite pendente: nome mascarado e foto embaçada");
ok(v.b.name === "Bruno **** *****" && v.b.photo === BLUR, "0015: quem vai no evento: nome mascarado e foto embaçada");
ok(v.a.name === "Ana Paula" && v.a.photo === "https://foto/ana.jpg", "0015: eu mesma apareço com nome e foto de verdade no evento");
const inv = await q(`select body from push_targets('i', $1)`, [conn]);
ok(inv.length === 1 && inv[0].body === "Ana ***** convidou você pra conversar", "0015: aviso de convite usa o nome mascarado: " + JSON.stringify(inv));
await as(B); await q(`select respond_connection($1, true)`, [conn]);
await as(A);
v = await seen();
ok(v.m.display_name === "Bruno Lima Souza" && v.m.avatar_url === "https://foto/bruno.jpg", "0015: depois do aceite, matches com nome completo e foto original");
ok(v.c.display_name === "Bruno Lima Souza" && v.c.avatar_url === "https://foto/bruno.jpg", "0015: depois do aceite, conexão com nome completo e foto original");
ok(v.b.name === "Bruno Lima Souza" && v.b.photo === "https://foto/bruno.jpg", "0015: depois do aceite, evento com nome completo e foto original");
ok((await q(`select has_function_privilege('authenticated', 'public.is_linked(uuid)', 'execute') as p`))[0].p === false, "0015: is_linked não é chamada direto pela API");
await as(null);

// 0016: o admin gera as miniaturas que faltam
await run(file("migrations/0016_miniaturas_admin.sql"));
await run(file("migrations/0016_miniaturas_admin.sql"));
await run(`reset role; update profiles set avatar_blur = null where id = '${B}'; set role authenticated`);
await as(USR);
ok(await denied(`select * from admin_missing_blur()`) && await denied(`select admin_set_blur('${B}', '${BLUR}')`), "0016: usuário comum não lista nem grava miniaturas dos outros");
await as(ADM);
ok((await q(`select id from admin_missing_blur()`)).some(r => r.id === B), "0016: admin vê quem tem foto mas não tem miniatura");
ok(await denied(`select admin_set_blur('${B}', 'https://foto/original.jpg')`), "0016: só aceita data:image, não o link da foto");
await q(`select admin_set_blur('${B}', '${BLUR}')`);
await q(`select admin_set_blur('${B}', 'data:image/jpeg;base64,OUTRA')`);
await run(`reset role`);
ok((await q(`select avatar_blur from profiles where id = '${B}'`))[0].avatar_blur === BLUR, "0016: grava a miniatura e nunca troca uma que já existe");
await run(`set role authenticated`);
ok(!(await q(`select id from admin_missing_blur()`)).some(r => r.id === B), "0016: depois de gravada, some da lista de pendentes");
await run(`reset role`);
await as(null);

console.log(fails ? `\n${fails} FALHA(S)` : "\nTUDO OK");
process.exit(fails ? 1 : 0);
