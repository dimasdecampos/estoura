// Roda todos os testes e mostra um resumo.
//   npm test                 tudo
//   npm run test:fast        tudo menos a rota /api/push (que compila o site e demora mais)
//   npm test -- db login     só os testes indicados
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const SUITES = [
  ["db", "Banco: migrações, bolhas pessoais, votos, fusão"],
  ["push", "Banco: notificações push"],
  ["ui", "App: bolhas, sugestões, mover/remover, rodízio do globo"],
  ["matches", "App: Matches, não lidas, alertas, notificação, dicas"],
  ["sw", "App: service worker recebe push"],
  ["login", "App logado com banco de verdade: salvar, recarregar, mensagens"],
  ["route", "Servidor: rota /api/push (compila o site)"],
];
const args = process.argv.slice(2);
const fast = args.includes("--fast");
const only = args.filter(a => !a.startsWith("--"));
const list = SUITES.filter(([n]) => (only.length ? only.includes(n) : !(fast && n === "route")));
if (!list.length) { console.log("Nenhum teste com esse nome. Opções: " + SUITES.map(s => s[0]).join(", ")); process.exit(2); }

const run = name => new Promise(resolve => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [path.join(dir, name + ".mjs")], { cwd: dir });
  let out = "";
  p.stdout.on("data", d => { out += d; });
  p.stderr.on("data", d => { out += d; });
  p.on("close", code => {
    const lines = out.split("\n");
    resolve({ name, code, secs: ((Date.now() - t0) / 1000).toFixed(1), pass: lines.filter(l => l.startsWith("PASS ")).length, failed: lines.filter(l => l.startsWith("FAIL ")), out });
  });
});

let bad = 0, total = 0;
const t0 = Date.now();
console.log(`Rodando ${list.length} grupo(s) de testes...\n`);
for (const [name, title] of list) {
  const r = await run(name);
  total += r.pass + r.failed.length;
  const good = r.code === 0 && !r.failed.length;
  if (!good) bad++;
  console.log(`${good ? "✔" : "✘"} ${name.padEnd(8)} ${String(r.pass).padStart(3)} ok${r.failed.length ? `, ${r.failed.length} falha(s)` : ""}  (${r.secs}s)  ${title}`);
  if (!good) {
    r.failed.forEach(l => console.log("    " + l));
    if (!r.failed.length) console.log(r.out.split("\n").filter(l => l.trim()).slice(-12).map(l => "    " + l).join("\n")); // travou/erro sem FAIL
  }
}
console.log(`\n${bad ? `✘ ${bad} grupo(s) com problema` : "✔ Tudo certo"} · ${total} verificações · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
process.exit(bad ? 1 : 0);
