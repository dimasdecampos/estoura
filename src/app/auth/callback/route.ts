import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Para onde o Google/Supabase volta depois do login
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/app";
  // só aceita caminhos internos (evita open redirect)
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/app";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host"); // atrás do proxy da Vercel
      if (process.env.NODE_ENV === "development" || !forwardedHost) return NextResponse.redirect(`${origin}${next}`);
      return NextResponse.redirect(`https://${forwardedHost}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
