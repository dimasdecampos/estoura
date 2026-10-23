import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { connection } from "next/server";

// Envia o aviso (push) de uma mensagem ou convite que acabou de ser enviado.
// Quem chama é o próprio app de quem enviou, com o login dele: o banco só entrega os aparelhos de destino
// se essa pessoa realmente enviou aquela mensagem (função push_targets), e cada aviso sai uma vez só.
// Sem as chaves VAPID nas variáveis de ambiente, responde "disabled" e nada é enviado.
const KINDS = new Set(["c", "e", "i", "a"]);

export async function POST(request: Request) {
  await connection();
  const env = process.env;
  const pub = env["VAPID_PUBLIC_KEY"], priv = env["VAPID_PRIVATE_KEY"];
  const url = env["NEXT_PUBLIC_SUPABASE_URL"] ?? env["SUPABASE_URL"];
  const key =
    env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] ?? env["SUPABASE_PUBLISHABLE_KEY"] ??
    env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? env["SUPABASE_ANON_KEY"];
  if (!pub || !priv || !url || !key) return Response.json({ sent: 0, disabled: true });

  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "login" }, { status: 401 });

  let kind = "", ref = "";
  try {
    const b = (await request.json()) as { kind?: unknown; id?: unknown };
    kind = String(b.kind ?? "");
    ref = String(b.id ?? "");
  } catch {
    return Response.json({ error: "pedido invalido" }, { status: 400 });
  }
  if (!KINDS.has(kind) || !/^[0-9a-f-]{1,40}$/i.test(ref)) return Response.json({ error: "pedido invalido" }, { status: 400 });

  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data, error } = await sb.rpc("push_targets", { p_kind: kind, p_ref: ref });
  if (error) return Response.json({ error: "nao permitido" }, { status: error.code === "42501" ? 401 : 400 });
  const targets = (data ?? []) as { endpoint: string; p256dh: string; auth: string; title: string; body: string; tag: string; url: string }[];
  if (!targets.length) return Response.json({ sent: 0 });

  webpush.setVapidDetails(env["VAPID_SUBJECT"] ?? "mailto:contato@estoura.app", pub, priv);
  const results = await Promise.allSettled(
    targets.map((t) =>
      webpush.sendNotification(
        { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
        JSON.stringify({ title: t.title, body: t.body, tag: t.tag, url: t.url }),
        { TTL: 60 * 60 * 24, urgency: "high" },
      ),
    ),
  );
  // failed: códigos de erro dos envios que falharam (404/410 = aparelho que não existe mais), pra diagnosticar
  const failed = results.flatMap((r) => (r.status === "rejected" ? [String((r.reason as { statusCode?: number; code?: string })?.statusCode ?? (r.reason as { code?: string })?.code ?? "erro")] : []));
  return Response.json({ sent: results.length - failed.length, ...(failed.length ? { failed } : {}) });
}
