import Link from "next/link";
import { Logo } from "@/components/logo";

const BUBBLES = [
  { n: "Viagens", h: 200, s: 112, x: "6%", y: "18%", t: "8s", d: "0s" },
  { n: "Slackline", h: 165, s: 84, x: "78%", y: "14%", t: "7s", d: "-2s" },
  { n: "Crochê", h: 330, s: 96, x: "88%", y: "52%", t: "9s", d: "-4s" },
  { n: "Trilhas", h: 145, s: 76, x: "4%", y: "66%", t: "6.5s", d: "-1s" },
  { n: "Astronomia", h: 235, s: 104, x: "70%", y: "78%", t: "8.5s", d: "-3s" },
  { n: "Café", h: 30, s: 64, x: "30%", y: "86%", t: "7.5s", d: "-5s" },
  { n: "Escalada", h: 25, s: 72, x: "52%", y: "8%", t: "9.5s", d: "-6s" },
];

const STEPS = [
  { h: 165, t: "Estoure o que você curte", p: "Cada bolha é um interesse. Toque uma vez para “curto”, duas para “é minha vida”." },
  { h: 200, t: "Entre nas sub-bolhas", p: "Dentro de Viagens mora a Patagônia. Quanto mais específico, mais você se conecta." },
  { h: 40, t: "Encontre a sua turma", p: "Matches por afinidade: bolha rara pesa mais. Suas redes só aparecem quando os dois aceitam." },
];

export default function Home() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-20 border-b border-line/60 bg-bg/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Estoura, início"><Logo /></Link>
          <Link href="/login" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-[#2a0d1b] transition hover:brightness-110">
            Entrar
          </Link>
        </div>
      </header>

      <main>
        <section className="relative isolate flex min-h-dvh items-center overflow-hidden px-4 pb-16 pt-28 sm:px-6">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_20%_20%,#ff9ec426,transparent_70%),radial-gradient(50%_45%_at_85%_30%,#8ff0de1f,transparent_70%),radial-gradient(60%_55%_at_60%_100%,#b9a6ff22,transparent_70%)]" />
          <div aria-hidden className="absolute inset-0 -z-10">
            {BUBBLES.map((b) => (
              <span
                key={b.n}
                className="bubble hidden sm:grid place-items-center text-[13px] font-bold text-ink/80"
                style={{ "--h": b.h, "--t": b.t, "--d": b.d, width: b.s, height: b.s, left: b.x, top: b.y } as React.CSSProperties}
              >
                {b.s > 70 ? b.n : ""}
              </span>
            ))}
            {BUBBLES.slice(0, 4).map((b, i) => (
              <span
                key={b.n}
                className="bubble sm:hidden"
                style={{ "--h": b.h, "--t": b.t, "--d": b.d, width: b.s * 0.55, height: b.s * 0.55, left: ["72%", "6%", "80%", "12%"][i], top: ["12%", "78%", "62%", "20%"][i] } as React.CSSProperties}
              />
            ))}
          </div>

          <div className="mx-auto w-full max-w-6xl">
            <p className="rise mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-4 py-1.5 text-sm font-semibold text-muted">
              <span className="size-2 rounded-full bg-mint" /> Rede social por afinidade
            </p>
            <h1 className="rise font-display text-[clamp(2.6rem,8.4vw,6.5rem)] font-extrabold leading-[1.02] tracking-tight [animation-delay:.08s]">
              Estoure a sua bolha.
              <br />
              <span className="bg-gradient-to-r from-accent via-lav to-mint bg-clip-text text-transparent">Ache a sua turma.</span>
            </h1>
            <p className="rise mt-6 max-w-xl text-lg text-ink/80 [animation-delay:.16s] sm:text-xl">
              Marque o que você curte, entre nas sub-bolhas mais específicas e encontre gente que curte o mesmo. Quanto mais raro o interesse, mais forte o match.
            </p>
            <div className="rise mt-9 flex flex-wrap gap-3 [animation-delay:.24s]">
              <Link href="/login" className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-accent px-7 text-lg font-bold text-[#2a0d1b] shadow-[0_10px_34px_-10px_#ff9ec4cc] transition hover:-translate-y-0.5 hover:brightness-110 sm:w-auto">
                Começar com o Google
              </Link>
              <a href="#como" className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl border border-line bg-white/5 px-7 text-lg font-bold transition hover:bg-white/10 sm:w-auto">
                Como funciona
              </a>
            </div>
          </div>
        </section>

        <section id="como" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-mint">Como funciona</p>
          <h2 className="max-w-2xl font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Três toques e você já está na sua turma</h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <article key={s.t} className="rounded-3xl border border-line bg-surface p-7 transition hover:-translate-y-1.5" style={{ "--h": s.h } as React.CSSProperties}>
                <span className="bubble relative mb-5 block !animate-none" style={{ width: 56, height: 56, "--h": s.h } as React.CSSProperties} />
                <h3 className="font-display text-2xl font-extrabold tracking-tight">{i + 1}. {s.t}</h3>
                <p className="mt-2 text-muted">{s.p}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="px-4 pb-24 sm:px-6">
          <div className="mx-auto max-w-4xl rounded-[2rem] border border-line bg-[radial-gradient(60%_80%_at_15%_0%,#ff9ec433,transparent_70%),radial-gradient(60%_80%_at_90%_100%,#8ff0de2b,transparent_70%)] bg-surface p-8 text-center sm:p-16">
            <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Sua turma já está esperando</h2>
            <p className="mx-auto mt-4 max-w-md text-muted">Entre com a sua conta Google. Leva dez segundos.</p>
            <Link href="/login" className="mt-8 inline-flex min-h-14 items-center justify-center rounded-2xl bg-accent px-8 text-lg font-bold text-[#2a0d1b] transition hover:-translate-y-0.5 hover:brightness-110">
              Entrar no Estoura
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-4 py-8 text-center text-sm text-muted sm:px-6">
        Estoure a sua bolha. Ache a sua turma.
      </footer>
    </>
  );
}
