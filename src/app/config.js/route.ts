import { connection } from "next/server";

// Entrega a URL e a chave PÚBLICA do Supabase para o protótipo (HTML estático).
// A publishable key é feita para ficar no navegador; quem protege os dados é o RLS.
//
// Lê o ambiente a cada requisição (e não no build): `connection()` impede a pré-renderização
// e o acesso por colchetes evita que o Next troque o valor por uma constante na hora do build.
export async function GET(request: Request) {
  await connection();
  const env = process.env;
  // /config.js?debug=1 mostra só os NOMES das variáveis visíveis (nunca os valores)
  if (new URL(request.url).searchParams.has("debug")) {
    const names = Object.keys(env).filter((k) => /supabase/i.test(k));
    return Response.json({ vercelEnv: env["VERCEL_ENV"] ?? null, supabaseVars: names, urlOk: Boolean(env["NEXT_PUBLIC_SUPABASE_URL"]), keyOk: Boolean(env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] ?? env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]) });
  }
  // aceita os nomes com NEXT_PUBLIC_ e os criados pela integração Supabase–Vercel.
  // Nunca lê SUPABASE_SECRET_KEY / service_role: só a chave pública (publishable/anon).
  const url = env["NEXT_PUBLIC_SUPABASE_URL"] ?? env["SUPABASE_URL"];
  const key =
    env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] ?? env["SUPABASE_PUBLISHABLE_KEY"] ??
    env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? env["SUPABASE_ANON_KEY"];
  const cfg = url && key ? { url, key } : {};
  return new Response(`window.ESTOURA_CONFIG=${JSON.stringify(cfg)};`, {
    headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" },
  });
}
