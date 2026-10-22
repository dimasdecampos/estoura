import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo, LogoMark } from "@/components/logo";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { GoogleButton } from "./google-button";

export const metadata: Metadata = { title: "Entrar" };

async function LoginError({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error) return null;
  return <p role="alert" className="mt-4 text-center text-sm text-[#ffaaaa]">O login não funcionou. Tente novamente.</p>;
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(55%_45%_at_15%_10%,#ff9ec426,transparent_70%),radial-gradient(50%_45%_at_90%_90%,#8ff0de1f,transparent_70%)]" />
      <div className="w-full max-w-sm rise">
        <Link href="/" className="mb-8 flex justify-center" aria-label="Voltar para o início"><Logo size="lg" /></Link>
        <div className="rounded-3xl border border-line bg-surface p-7 shadow-2xl sm:p-8">
          <LogoMark className="mx-auto mb-4 size-12 text-accent" />
          <h1 className="text-center font-display text-3xl font-extrabold tracking-tight">Estoure a sua bolha</h1>
          <p className="mb-7 mt-2 text-center text-muted">Entre para marcar seus interesses e achar a sua turma.</p>

          {!hasSupabaseEnv ? (
            <p role="alert" className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
              Falta configurar o Supabase. Copie <b>.env.example</b> para <b>.env.local</b>, preencha as chaves e reinicie o servidor. Passo a passo no <b>SETUP.md</b>.
            </p>
          ) : (
            <GoogleButton />
          )}
          <Suspense><LoginError searchParams={searchParams} /></Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-muted">Usamos só seu nome, e-mail e foto do Google. Suas redes sociais nunca aparecem para ninguém sem você aceitar.</p>
      </div>
    </main>
  );
}
