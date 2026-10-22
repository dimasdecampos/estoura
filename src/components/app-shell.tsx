"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Interest, Level, Levels } from "@/lib/types";
import { Globe } from "./globe";
import { Logo } from "./logo";
import { Matches } from "./matches";

type Lv = 0 | 1 | 2;
type View = "bolhas" | "matches";
type Props = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  initialInterests: Interest[];
  initialLevels: Levels;
};

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "bolha";

const ICONS: Record<View, React.ReactNode> = {
  bolhas: <><circle cx="9" cy="10" r="6" /><circle cx="17" cy="16" r="4" /><circle cx="17.5" cy="5.5" r="2" /></>,
  matches: <><circle cx="9" cy="12" r="6" /><circle cx="15" cy="12" r="6" /></>,
};

export function AppShell({ userId, name, avatarUrl, initialInterests, initialLevels }: Props) {
  const [view, setView] = useState<View>("bolhas");
  const [interests, setInterests] = useState(initialInterests);
  const [levels, setLevels] = useState(initialLevels);
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const db = useRef(createClient());
  const count = Object.keys(levels).length;

  const say = useCallback((t: string) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const setLevel = useCallback(
    async (id: string, L: Lv) => {
      const it = interests.find((i) => i.id === id);
      if (!it) return;
      const next: Levels = { ...levels };
      const delta = new Map<string, number>();
      const upserts: { user_id: string; interest_id: string; level: Level }[] = [];
      const removed: string[] = [];

      if (L) {
        if (!next[id]) delta.set(id, 1);
        next[id] = L;
        upserts.push({ user_id: userId, interest_id: id, level: L });
        if (it.parent_id && !next[it.parent_id]) {
          next[it.parent_id] = 1;
          delta.set(it.parent_id, 1);
          upserts.push({ user_id: userId, interest_id: it.parent_id, level: 1 });
        }
      } else {
        for (const k of [id, ...interests.filter((i) => i.parent_id === id).map((i) => i.id)]) {
          if (next[k]) { delete next[k]; delta.set(k, -1); removed.push(k); }
        }
      }

      const prevLevels = levels;
      setLevels(next);
      setInterests((list) => list.map((i) => (delta.has(i.id) ? { ...i, people: Math.max(0, i.people + delta.get(i.id)!) } : i)));

      const client = db.current;
      const { error } = upserts.length
        ? await client.from("user_interests").upsert(upserts)
        : await client.from("user_interests").delete().eq("user_id", userId).in("interest_id", removed);
      if (error) {
        // desfaz a mudança otimista
        setLevels(prevLevels);
        setInterests((list) => list.map((i) => (delta.has(i.id) ? { ...i, people: Math.max(0, i.people - delta.get(i.id)!) } : i)));
        say("Não consegui salvar. Confira sua conexão.");
      }
    },
    [interests, levels, userId, say],
  );

  const createInterest = useCallback(
    async (rawName: string, parentId: string | null) => {
      const nm = rawName.trim();
      const parent = parentId ? interests.find((i) => i.id === parentId) : null;
      const twin = interests.find((i) => i.parent_id === parentId && i.name.toLowerCase() === nm.toLowerCase());
      if (twin) {
        if (!levels[twin.id]) await setLevel(twin.id, 1);
        say(`“${twin.name}” já existia, estourei pra você`);
        return;
      }
      const id = `${parent ? parent.id + "/" : ""}${slug(nm)}-${Math.random().toString(36).slice(2, 6)}`;
      const hue = parent ? (parent.hue + 40) % 360 : Math.floor(Math.random() * 360);
      const { error } = await db.current.from("interests").insert({ id, name: nm, parent_id: parentId, hue, created_by: userId });
      if (error) return say("Não consegui criar a bolha.");
      const fresh: Interest = { id, name: nm, parent_id: parentId, hue, week_count: 0, people: 0 };
      // setLevel lê `interests`; já injetamos a nova bolha antes de estourar
      setInterests((l) => [...l, fresh]);
      const next: Levels = { ...levels, [id]: 1 };
      const rows = [{ user_id: userId, interest_id: id, level: 1 as Level }];
      if (parent && !levels[parent.id]) { next[parent.id] = 1; rows.push({ user_id: userId, interest_id: parent.id, level: 1 }); }
      setLevels(next);
      setInterests((l) => l.map((i) => (i.id === id || (parent && i.id === parent.id && !levels[parent.id]) ? { ...i, people: i.people + 1 } : i)));
      const { error: e2 } = await db.current.from("user_interests").upsert(rows);
      say(e2 ? "Bolha criada, mas não consegui estourar." : `Bolha “${nm}” criada. Agora é chamar a galera!`);
    },
    [interests, levels, userId, say, setLevel],
  );

  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [menu]);

  const nav: { id: View; label: string; badge?: number }[] = [
    { id: "bolhas", label: "Bolhas" },
    { id: "matches", label: "Matches" },
  ];

  return (
    <div className="mx-auto grid h-dvh max-w-[1440px] grid-rows-[auto_minmax(0,1fr)_auto] pt-[env(safe-area-inset-top)] lg:grid-cols-[232px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]">
      <header className="flex items-center justify-between gap-3 px-4 pb-1.5 pt-3 md:px-7 lg:col-span-2 lg:pb-2.5 lg:pt-4">
        <Logo />
        <div className="relative flex items-center gap-2">
          <span className="rounded-full border border-line px-2.5 py-1 text-xs tabular-nums text-muted"><b className="text-ink">{count}</b> estouradas</span>
          <button onClick={() => setMenu((m) => !m)} aria-label="Menu da conta" aria-expanded={menu} className="size-10 overflow-hidden rounded-full border border-line bg-surface-2">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-sm font-bold">{name.slice(0, 1).toUpperCase()}</span>
            )}
          </button>
          {menu && (
            <>
              <button aria-label="Fechar menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setMenu(false)} />
              <div role="menu" className="absolute right-0 top-12 z-40 w-60 rounded-2xl border border-line bg-surface p-2 shadow-2xl">
                <p className="truncate px-3 py-2 text-sm font-semibold">{name}</p>
                <form action="/auth/signout" method="post">
                  <button role="menuitem" className="min-h-11 w-full rounded-xl px-3 text-left text-sm font-semibold text-[#ffaaaa] hover:bg-surface-2">Sair da conta</button>
                </form>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="relative min-h-0 overflow-y-auto lg:col-start-2 lg:row-start-2">
        {view === "bolhas" ? (
          <div className="h-full lg:px-3">
            <Globe interests={interests} levels={levels} onLevel={setLevel} onCreate={createInterest} onToast={say} />
          </div>
        ) : (
          <Matches interests={interests} levels={levels} />
        )}
      </main>

      <nav aria-label="Navegação" className="grid grid-cols-2 border-t border-line bg-bg pb-[max(4px,env(safe-area-inset-bottom))] lg:col-start-1 lg:row-start-2 lg:grid-cols-1 lg:content-start lg:gap-1 lg:border-r lg:border-t-0 lg:p-3.5">
        {nav.map((n) => (
          <button
            key={n.id}
            onClick={() => setView(n.id)}
            aria-current={view === n.id ? "page" : undefined}
            className={`grid min-h-14 justify-items-center gap-0.5 px-1 pb-2 pt-2.5 text-xs font-semibold transition-colors lg:min-h-12 lg:grid-flow-col lg:justify-start lg:gap-3 lg:rounded-2xl lg:px-4 lg:py-3 lg:text-[15px] ${view === n.id ? "text-ink lg:bg-surface-2" : "text-muted lg:hover:bg-surface"}`}
          >
            <svg viewBox="0 0 24 24" className={`size-[22px] fill-none stroke-[1.8] lg:size-6 ${view === n.id ? "stroke-accent" : "stroke-current"}`} aria-hidden="true">{ICONS[n.id]}</svg>
            {n.label}
          </button>
        ))}
      </nav>

      <div role="status" aria-live="polite" className={`pointer-events-none fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-40 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl bg-ink px-3.5 py-2.5 text-center text-sm font-semibold text-bg transition-opacity lg:bottom-7 lg:left-[calc(50%+116px)] ${toast ? "opacity-100" : "opacity-0"}`}>
        {toast}
      </div>
    </div>
  );
}
