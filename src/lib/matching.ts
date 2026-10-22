import type { Interest, Levels, MatchRow } from "./types";

const TOTAL = 6000;

/** Bolha rara vale mais: quanto menos gente, maior o peso. */
export const weight = (people: number) => Math.log(TOTAL / Math.max(2, people));

export type Match = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  city: string | null;
  pct: number;
  shared: { id: string; pts: number; love: boolean }[];
  others: string[];
};

export function computeMatches(rows: MatchRow[], mine: Levels, interests: Interest[]): Match[] {
  const byId = new Map(interests.map((i) => [i.id, i]));
  const people = new Map<string, { row: MatchRow; lv: Map<string, number> }>();
  for (const r of rows) {
    const p = people.get(r.user_id) ?? { row: r, lv: new Map() };
    p.lv.set(r.interest_id, r.level);
    people.set(r.user_id, p);
  }

  const out: Match[] = [];
  for (const [userId, { row, lv }] of people) {
    let s = 0;
    let u = 0;
    const parts: { id: string; v: number; love: boolean }[] = [];
    for (const id of new Set([...Object.keys(mine), ...lv.keys()])) {
      const it = byId.get(id);
      if (!it) continue;
      const w = weight(it.people);
      u += w;
      if (mine[id] && lv.has(id)) {
        const v = w * (mine[id] === lv.get(id) ? 1 : 0.7);
        s += v;
        parts.push({ id, v, love: mine[id] === 2 && lv.get(id) === 2 });
      }
    }
    if (!parts.length || !u) continue;
    parts.sort((a, b) => b.v - a.v);
    out.push({
      userId,
      name: row.display_name ?? "Alguém",
      avatarUrl: row.avatar_url,
      city: row.city,
      pct: Math.round((100 * s) / u),
      shared: parts.map((p) => ({ id: p.id, pts: (100 * p.v) / u, love: p.love })),
      others: [...lv.keys()].filter((id) => !mine[id]),
    });
  }
  return out.sort((a, b) => b.pct - a.pct);
}
