"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeMatches } from "@/lib/matching";
import type { Interest, Levels, MatchRow } from "@/lib/types";

const initials = (n: string) => n.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

function Chip({ it, love }: { it: Interest; love?: boolean }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${it.parent_id ? "border-dashed" : ""}`}
      style={{ background: `hsl(${it.hue} 60% 50% / .18)`, color: `hsl(${it.hue} 90% 82%)`, borderColor: `hsl(${it.hue} 70% 60% / .35)` }}
    >
      {it.name}{love ? " ♥" : ""}
    </span>
  );
}

export function Matches({ interests, levels }: { interests: Interest[]; levels: Levels }) {
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const key = Object.keys(levels).sort().join(",");
  const byId = useMemo(() => new Map(interests.map((i) => [i.id, i])), [interests]);

  // recarrega (com um respiro) quando você estoura ou tira bolhas
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const { data, error } = await createClient().rpc("my_matches");
      if (!alive) return;
      setError(Boolean(error));
      setRows((data as MatchRow[] | null) ?? []);
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [key]);

  const matches = useMemo(() => (rows ? computeMatches(rows, levels, interests) : []), [rows, levels, interests]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-10 md:px-8">
      <h2 className="mt-5 font-display text-2xl font-extrabold tracking-tight md:text-4xl">Quem estourou o mesmo que você</h2>
      <p className="mb-5 mt-1 max-w-[60ch] text-sm leading-relaxed text-muted">
        Interesses raros e sub-bolhas pesam mais. Quem marcou “eu amo!” no mesmo que você ganha bônus (♥).
      </p>

      {rows === null ? (
        <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-line bg-surface" />)}
        </div>
      ) : error ? (
        <p role="alert" className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">Não consegui carregar os matches. Confira se o SQL do Supabase foi executado.</p>
      ) : matches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">
          {Object.keys(levels).length
            ? "Ainda ninguém estourou as mesmas bolhas que você. Convide amigos ou estoure mais bolhas — você pode ser o primeiro da turma."
            : "Estoure algumas bolhas para ver seus matches."}
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {matches.map((m) => {
            const expanded = open === m.userId;
            const max = Math.max(1, ...m.shared.map((s) => s.pts));
            return (
              <li key={m.userId} className="rise rounded-2xl border border-line bg-surface transition-colors hover:border-[#3a4f7a]">
                <button onClick={() => setOpen(expanded ? null : m.userId)} aria-expanded={expanded} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 p-3.5 text-left">
                  {m.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-12 rounded-full object-cover blur-[2px]" />
                  ) : (
                    <span className="grid size-12 place-items-center rounded-full bg-accent font-bold text-bg">{initials(m.name.split(" ")[0])}</span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{m.name.split(" ").map((w, i) => (i ? "*".repeat(w.length) : w)).join(" ")}</span>
                    {m.city && <span className="block text-[12.5px] text-muted">{m.city}</span>}
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {m.shared.slice(0, 4).map((s) => byId.get(s.id) && <Chip key={s.id} it={byId.get(s.id)!} love={s.love} />)}
                      {m.shared.length > 4 && <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">+{m.shared.length - 4}</span>}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-display text-2xl font-extrabold tabular-nums leading-none">{m.pct}%</span>
                    <span className="mt-1 block text-[11px] text-muted">{m.shared.length} em comum</span>
                    <span className="ml-auto mt-1.5 block h-1 w-14 overflow-hidden rounded bg-line"><span className="block h-full rounded bg-gradient-to-r from-mint to-accent" style={{ width: `${m.pct}%` }} /></span>
                  </span>
                </button>
                {expanded && (
                  <div className="border-t border-line px-3.5 pb-3.5 pt-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted">Por que {m.pct}% de match</p>
                    {m.shared.slice(0, 6).map((s) => {
                      const it = byId.get(s.id);
                      if (!it) return null;
                      return (
                        <div key={s.id} className="mt-2 grid grid-cols-[minmax(0,9em)_1fr_auto] items-center gap-2.5 text-[13px]">
                          <span className="truncate">{it.name}{s.love ? " ♥" : ""}</span>
                          <span className="h-1.5 overflow-hidden rounded bg-line"><i className="block h-full" style={{ width: `${Math.round((100 * s.pts) / max)}%`, background: `hsl(${it.hue} 85% 70%)` }} /></span>
                          <b className="text-xs font-semibold tabular-nums text-muted">+{Math.round(s.pts)} · {it.people.toLocaleString("pt-BR")}</b>
                        </div>
                      );
                    })}
                    {m.others.length > 0 && (
                      <>
                        <p className="mb-1.5 mt-4 text-[11px] uppercase tracking-wider text-muted">Outras bolhas</p>
                        <div className="flex flex-wrap gap-1">{m.others.map((id) => byId.get(id) && <Chip key={id} it={byId.get(id)!} />)}</div>
                      </>
                    )}
                    <p className="mt-4 rounded-xl bg-surface-2 p-3 text-[13px] text-muted">🔒 Convites e chat chegam na próxima versão. Redes sociais ficam protegidas até os dois aceitarem.</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
