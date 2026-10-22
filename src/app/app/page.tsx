import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import type { Interest, Levels } from "@/lib/types";

export const metadata: Metadata = { title: "Suas bolhas" };

function Loading() {
  return (
    <div className="grid h-dvh place-items-center" aria-busy="true">
      <span className="size-14 animate-pulse rounded-full border-2 border-accent/60 bg-accent/10" />
    </div>
  );
}

export default function AppPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AppData />
    </Suspense>
  );
}

async function AppData() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");
  const userId = claims.sub;

  const [stats, mine, profile] = await Promise.all([
    supabase.rpc("interest_stats"),
    supabase.from("user_interests").select("interest_id, level"),
    supabase.from("profiles").select("display_name, avatar_url").eq("id", userId).maybeSingle(),
  ]);

  const levels: Levels = {};
  (mine.data ?? []).forEach((r) => { levels[r.interest_id] = r.level as 1 | 2; });

  const meta = (claims.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string; picture?: string };
  const name = profile.data?.display_name ?? meta.full_name ?? meta.name ?? "Você";
  const avatarUrl = profile.data?.avatar_url ?? meta.avatar_url ?? meta.picture ?? null;

  return (
    <AppShell
      userId={userId}
      name={name}
      avatarUrl={avatarUrl}
      initialInterests={(stats.data ?? []) as Interest[]}
      initialLevels={levels}
    />
  );
}
