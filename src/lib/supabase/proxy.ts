import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv, SUPABASE_KEY, SUPABASE_URL } from "./env";

/** Renova a sessão (cookies) a cada request e protege as rotas privadas. */
export async function updateSession(request: NextRequest) {
  if (!hasSupabaseEnv) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL!, SUPABASE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims valida o JWT localmente (rápido) e renova o token se preciso
  const { data } = await supabase.auth.getClaims();
  const logged = Boolean(data?.claims);
  const path = request.nextUrl.pathname;

  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!logged && path.startsWith("/app")) return redirect("/login");
  if (logged && path === "/login") return redirect("/app");
  return response;
}
