import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

// Entrega a URL e a chave PÚBLICA do Supabase para o protótipo (HTML estático).
// A publishable key é feita para ficar no navegador; quem protege os dados é o RLS.
export function GET() {
  const cfg = SUPABASE_URL && SUPABASE_KEY ? { url: SUPABASE_URL, key: SUPABASE_KEY } : {};
  return new Response(`window.ESTOURA_CONFIG=${JSON.stringify(cfg)};`, {
    headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" },
  });
}
