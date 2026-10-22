"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Interest, Levels } from "@/lib/types";

type Lv = 0 | 1 | 2;
type Props = {
  interests: Interest[];
  levels: Levels;
  onLevel: (id: string, level: Lv) => void;
  onCreate: (name: string, parentId: string | null) => void;
  onToast: (text: string) => void;
};

const ADD: Interest = { id: "__add", name: "criar", parent_id: null, hue: 0, week_count: 0, people: 0 };

type Pt = { it: Interest; sx: number; sy: number; r: number; z: number };
type Fx = { ring?: boolean; x: number; y: number; r?: number; vx?: number; vy?: number; t: number; h: number };
type Anim = { dir: "in" | "out"; t: number; id: string; h: number; from?: { x: number; y: number; r: number } };
type Api = {
  enter: (id: string) => void;
  leave: () => void;
  spinTo: (id: string) => void;
  setLevel: (it: Interest, l: Lv, silent?: boolean) => void;
  rebuild: () => void;
};

export function Globe({ interests, levels, onLevel, onCreate, onToast }: Props) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const P = useRef({ interests, levels, onLevel, onToast });
  const [focus, setFocus] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    P.current = { interests, levels, onLevel, onToast };
  });

  const trend = useMemo(
    () =>
      interests
        .filter((i) => !i.parent_id && i.people > 50)
        .map((i) => ({ i, r: i.week_count / i.people }))
        .filter((x) => x.r > 0)
        .sort((a, b) => b.r - a.r)
        .slice(0, 3),
    [interests],
  );

  // quando a lista de bolhas muda (nova bolha, contagem), refaz o globo sem reiniciar
  useEffect(() => {
    api.current?.rebuild();
  }, [interests]);

  useEffect(() => {
    const cv = cvRef.current!;
    const stage = stageRef.current!;
    const ctx = cv.getContext("2d")!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cs = getComputedStyle(cv);
    const BODY = cs.getPropertyValue("--nf-body").trim() || "system-ui, sans-serif";
    const DISP = cs.getPropertyValue("--nf-display").trim() || "sans-serif";

    const AUTO = reduce ? 0 : 0.0025;
    const AUTO_O = reduce ? 0 : 0.0016;
    let W = 0, H = 0, R = 100;
    let rotY = 0.6, rotX = -0.25, vY = AUTO, vX = 0, orbit = 0, vO = AUTO_O;
    let items: Interest[] = [];
    let pts: Pt[] = [];
    let fx: Fx[] = [];
    let target: { x: number; y: number } | null = null;
    let anim: Anim | null = null;
    let fade = 1;
    let now = 0;
    let curFocus: string | null = null;
    let trendSet = new Set<string>();
    let raf = 0;
    const dr = new Map<string, number>();
    const pos = new Map<string, [number, number, number]>();
    const kc = new Map<string, number>();

    const byId = (id: string) => P.current.interests.find((i) => i.id === id)!;
    const kids = (id: string) => P.current.interests.filter((i) => i.parent_id === id);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const shellR = () => Math.min(W * 0.47, H * 0.44);
    const shellC = () => ({ x: W / 2, y: H / 2 - 6 });
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

    function targetR(it: Interest) {
      if (curFocus) {
        const S = shellR();
        if (it.id === ADD.id) return S * 0.14;
        return Math.min(S * 0.27, (S / 115) * (8 + Math.sqrt(it.people + 20) * 0.9));
      }
      return (R / 150) * (9 + Math.sqrt(it.people + 20) * 0.95);
    }

    function rebuild(fresh = false) {
      const all = P.current.interests;
      kc.clear();
      all.forEach((i) => i.parent_id && kc.set(i.parent_id, (kc.get(i.parent_id) ?? 0) + 1));
      if (curFocus) items = [...all.filter((i) => i.parent_id === curFocus), ADD];
      else {
        items = all.filter((i) => !i.parent_id);
        const n = items.length, g = Math.PI * (3 - Math.sqrt(5));
        items.forEach((it, k) => {
          const y = 1 - ((k + 0.5) / n) * 2, r = Math.sqrt(1 - y * y), t = k * g;
          pos.set(it.id, [Math.cos(t) * r, y, Math.sin(t) * r]);
        });
      }
      items.forEach((it) => {
        if (fresh || !dr.has(it.id)) dr.set(it.id, reduce ? targetR(it) : 0);
      });
      trendSet = new Set(
        all.filter((i) => !i.parent_id && i.people > 50).map((i) => ({ i, r: i.week_count / i.people })).filter((x) => x.r > 0).sort((a, b) => b.r - a.r).slice(0, 3).map((x) => x.i.id),
      );
    }

    function resize() {
      const b = stage.getBoundingClientRect();
      if (!b.width) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = b.width; H = b.height;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(W, H) * 0.36;
    }

    function project() {
      if (curFocus) {
        const S = shellR(), c = shellC(), n = items.length, ring = S * 0.62;
        pts = items.map((it, k) => {
          const a = orbit + (k / n) * Math.PI * 2 - Math.PI / 2;
          const d = (dr.get(it.id) ?? 0) + (targetR(it) - (dr.get(it.id) ?? 0)) * 0.12;
          dr.set(it.id, d);
          return { it, sx: c.x + Math.cos(a) * ring, sy: c.y + Math.sin(a) * ring * 0.92, r: Math.max(0, d), z: 1 };
        });
        return;
      }
      const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX), D = R * 3.2;
      pts = items
        .map((it) => {
          const [x, y, z] = pos.get(it.id) ?? [0, 0, 0];
          const x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx, s = D / (D - z2 * R);
          const d = (dr.get(it.id) ?? 0) + (targetR(it) - (dr.get(it.id) ?? 0)) * 0.12;
          dr.set(it.id, d);
          return { it, sx: W / 2 + x1 * R * s, sy: H / 2 + y2 * R * s, r: Math.max(0, d * s), z: z2 };
        })
        .sort((a, b) => a.z - b.z);
    }

    function label(lines: string[], sx: number, sy: number, fs: number, color: string, extra?: string | null) {
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = color;
      const ty = sy - (lines.length - 1) * fs * 0.55 - (extra ? fs * 0.35 : 0);
      lines.forEach((l, k) => ctx.fillText(l, sx, ty + k * fs * 1.1));
      if (extra) {
        ctx.font = `500 ${fs * 0.74}px ${BODY}`; ctx.globalAlpha *= 0.85;
        ctx.fillText(extra, sx, ty + lines.length * fs * 1.1);
      }
    }
    function split(n: string, r: number) {
      if (ctx.measureText(n).width <= r * 1.75 || !n.includes(" ")) return [n];
      const w = n.split(" "), m = Math.ceil(w.length / 2);
      return [w.slice(0, m).join(" "), w.slice(m).join(" ")];
    }

    function drawBubble({ it, sx, sy, r, z }: Pt) {
      if (r < 1) return;
      const d = (z + 1) / 2, showLabel = curFocus || z > -0.35;
      ctx.globalAlpha = (0.28 + 0.72 * d) * fade;
      if (it.id === ADD.id) {
        ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(236,241,255,.6)";
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = `600 ${Math.max(10, r * 0.32)}px ${BODY}`;
        label(["+", "criar"], sx, sy, Math.max(11, r * 0.34), "rgba(236,241,255,.85)");
        ctx.globalAlpha = 1; return;
      }
      const h = it.hue, L = P.current.levels[it.id] ?? 0;
      if (trendSet.has(it.id) && !curFocus) {
        const pulse = (Math.sin(now / 380 + h) + 1) / 2;
        ctx.strokeStyle = `hsla(${h} 100% 80% / ${0.15 + 0.4 * pulse})`; ctx.lineWidth = 2 + 3 * pulse;
        ctx.beginPath(); ctx.arc(sx, sy, r * (1.1 + 0.12 * pulse), 0, 7); ctx.stroke();
      }
      if (L) {
        const g = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.4, r * 0.1, sx, sy, r);
        g.addColorStop(0, `hsl(${h} 95% ${L === 2 ? 84 : 78}%)`); g.addColorStop(1, `hsl(${h} 75% ${L === 2 ? 52 : 44}%)`);
        if (L === 2) { ctx.shadowColor = `hsl(${h} 100% 70%)`; ctx.shadowBlur = r * 0.6; }
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = `hsl(${h} 100% 90%)`; ctx.lineWidth = 2; ctx.stroke();
        if (L === 2) { ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, r + 5, 0, 7); ctx.stroke(); }
      } else {
        const g = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, r);
        g.addColorStop(0, `hsla(${h} 90% 70% / .04)`); g.addColorStop(0.8, `hsla(${h} 90% 70% / .16)`); g.addColorStop(1, `hsla(${h} 95% 75% / .42)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill();
        ctx.lineWidth = 1.3; ctx.strokeStyle = `hsla(${h} 95% 78% / .75)`; ctx.stroke();
        ctx.strokeStyle = `hsla(${(h + 70) % 360} 95% 78% / .55)`; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(sx, sy, r * 0.9, Math.PI * 0.15, Math.PI * 0.75); ctx.stroke();
      }
      const n = kc.get(it.id) ?? 0;
      if (!curFocus && !it.parent_id && n && r > 10) {
        const off = r + (L === 2 ? 10 : 6);
        ctx.fillStyle = L ? `hsl(${h} 100% 92%)` : `hsla(${h} 95% 80% / .9)`;
        for (let k = 0; k < n; k++) {
          const t = -Math.PI / 2 + (k - (n - 1) / 2) * 0.32;
          ctx.beginPath(); ctx.arc(sx + Math.cos(t) * off, sy + Math.sin(t) * off, 1.8, 0, 7); ctx.fill();
        }
      }
      ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.beginPath();
      ctx.ellipse(sx - r * 0.4, sy - r * 0.45, r * 0.18, r * 0.1, -0.7, 0, 7); ctx.fill();
      if (r > 15 && showLabel) {
        const fs = Math.max(9, Math.min(curFocus ? 14 : 15, r * 0.3));
        ctx.font = `700 ${fs}px ${BODY}`;
        label(split(it.name, r), sx, sy, fs, L ? "#10172a" : "#f1f5ff", r > 24 ? it.people.toLocaleString("pt-BR") : null);
      }
      ctx.globalAlpha = 1;
    }

    function drawShell(x: number, y: number, r: number, h: number, alpha: number, solid: number) {
      if (r < 1) return;
      ctx.globalAlpha = alpha;
      if (solid > 0) { ctx.fillStyle = `hsla(${h} 80% 62% / ${solid})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, `hsla(${h} 90% 70% / .03)`); g.addColorStop(0.85, `hsla(${h} 90% 65% / .09)`); g.addColorStop(1, `hsla(${h} 95% 75% / .3)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = `hsla(${h} 95% 80% / .6)`; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath();
      ctx.ellipse(x - r * 0.45, y - r * 0.55, r * 0.16, r * 0.06, -0.6, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }

    function drawCenter() {
      const it = byId(curFocus!), c = shellC(), S = shellR();
      const ks = kids(it.id), on = ks.filter((k) => P.current.levels[k.id]).length, L = P.current.levels[it.id] ?? 0;
      const fs = Math.max(18, Math.min(30, S * 0.15));
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#f1f5ff"; ctx.font = `800 ${fs}px ${DISP}`;
      ctx.fillText(it.name, c.x, c.y - fs * 0.45);
      ctx.font = `600 12.5px ${BODY}`; ctx.fillStyle = `hsl(${it.hue} 90% 80%)`;
      ctx.fillText(`${on} de ${ks.length} estouradas${L === 2 ? " · ♥" : ""}`, c.x, c.y + fs * 0.5);
      ctx.fillStyle = "#94a1c3"; ctx.font = `500 12px ${BODY}`;
      ctx.fillText("toque fora da bolha pra voltar", c.x, Math.min(H - 10, c.y + S + 16));
    }

    function burst(it: Interest, big: boolean) {
      const p = pts.find((q) => q.it.id === it.id);
      if (!p || reduce) return;
      fx.push({ ring: true, x: p.sx, y: p.sy, r: p.r, t: 0, h: it.hue });
      for (let k = 0; k < (big ? 14 : 6); k++) {
        const a = Math.random() * 7, v = 1.5 + Math.random() * 3;
        fx.push({ x: p.sx, y: p.sy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, h: it.hue });
      }
    }
    function drawFx() {
      fx = fx.filter((f) => f.t < 1);
      fx.forEach((f) => {
        f.t += 0.035;
        if (f.ring) {
          ctx.strokeStyle = `hsla(${f.h} 95% 80% / ${1 - f.t})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r! * (1 + f.t * 0.9), 0, 7); ctx.stroke();
        } else {
          f.x += f.vx!; f.y += f.vy!; f.vy! += 0.08;
          ctx.fillStyle = `hsla(${f.h} 95% 82% / ${1 - f.t})`; ctx.beginPath(); ctx.arc(f.x, f.y, 2.2, 0, 7); ctx.fill();
        }
      });
    }

    function setLevel(it: Interest, L: Lv, silent = false) {
      const was = P.current.levels[it.id] ?? 0;
      if (L) {
        burst(it, !was);
        try { navigator.vibrate?.(L === 2 ? [10, 40, 10] : 12); } catch { /* sem vibração */ }
      }
      P.current.onLevel(it.id, L);
      if (!silent) P.current.onToast(L === 1 ? `Estourou ${it.name}!` : L === 2 ? `${it.name} é sua vida ♥ peso maior no match` : `Você saiu de ${it.name}`);
    }

    function doEnter(id: string) { curFocus = id; setFocus(id); orbit = 0; vO = AUTO_O; rebuild(true); }
    function enter(id: string) {
      if (anim || curFocus === id) return;
      const p = pts.find((q) => q.it.id === id);
      if (reduce || !p) return doEnter(id);
      target = null;
      anim = { dir: "in", t: 0, id, h: byId(id).hue, from: { x: p.sx, y: p.sy, r: p.r } };
    }
    function leave() {
      if (anim || !curFocus) return;
      const id = curFocus;
      curFocus = null; setFocus(null); rebuild();
      items.forEach((it) => dr.set(it.id, targetR(it)));
      if (!reduce) anim = { dir: "out", t: 0, id, h: byId(id).hue };
    }
    function spinTo(id: string) {
      if (curFocus) { curFocus = null; setFocus(null); anim = null; rebuild(); }
      const p = pos.get(id);
      if (!p) return;
      const [x, y, z] = p;
      target = { y: Math.atan2(-x, z), x: Math.atan2(y, Math.hypot(x, z)) };
      vY = 0; vX = 0;
    }

    function tap(it: Interest) {
      if (it.id === ADD.id) { setCreating(true); return; }
      const L = (P.current.levels[it.id] ?? 0) as Lv;
      if (!curFocus && (kc.get(it.id) ?? 0) > 0) {
        if (!L) {
          setLevel(it, 1, true);
          P.current.onToast(`Estourou ${it.name}! Agora escolha os detalhes`);
          setTimeout(() => enter(it.id), reduce ? 0 : 420);
        } else enter(it.id);
        return;
      }
      setLevel(it, ((L + 1) % 3) as Lv);
    }

    function frame(t: number) {
      raf = requestAnimationFrame(frame);
      now = t;
      if (!W || document.hidden) return;
      ctx.clearRect(0, 0, W, H);
      if (anim) {
        anim.t = Math.min(1, anim.t + 0.045);
        const e = ease(anim.t), S = shellR(), c = shellC();
        if (anim.dir === "in") {
          rotY += vY * 0.3; fade = 1 - e; project(); pts.forEach(drawBubble); fade = 1;
          const f = anim.from!;
          drawShell(lerp(f.x, c.x, e), lerp(f.y, c.y, e), lerp(f.r, S, e), anim.h, 1, (1 - e) * 0.85);
          if (anim.t >= 1) { const id = anim.id; anim = null; doEnter(id); }
        } else {
          fade = e; project(); pts.forEach(drawBubble); fade = 1;
          const id = anim.id, p = pts.find((q) => q.it.id === id);
          const to = p ? { x: p.sx, y: p.sy, r: p.r } : { x: c.x, y: c.y, r: 0 };
          drawShell(lerp(c.x, to.x, e), lerp(c.y, to.y, e), lerp(S, to.r, e), anim.h, 1 - e * 0.6, e * 0.6);
          if (anim.t >= 1) anim = null;
        }
      } else if (curFocus) {
        if (!drag) { orbit += vO; vO += (AUTO_O - vO) * 0.03; }
        const S = shellR(), c = shellC();
        drawShell(c.x, c.y, S, byId(curFocus).hue, 1, 0); drawCenter();
        project(); pts.forEach(drawBubble);
      } else {
        if (target && !drag) {
          const dy = wrap(target.y - rotY), dx = target.x - rotX;
          rotY += dy * 0.08; rotX += dx * 0.08;
          if (Math.abs(dy) < 0.002 && Math.abs(dx) < 0.002) { target = null; vY = AUTO; }
        } else if (!drag) {
          rotY += vY; rotX += vX; vX *= 0.95;
          vY += ((reduce ? 0 : AUTO * Math.sign(vY || 1)) - vY) * 0.02;
        }
        rotX = Math.max(-1.3, Math.min(1.3, rotX));
        const halo = ctx.createRadialGradient(W / 2, H / 2, R * 0.2, W / 2, H / 2, R * 1.5);
        halo.addColorStop(0, "rgba(143,240,222,.07)"); halo.addColorStop(1, "rgba(143,240,222,0)");
        ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
        project(); pts.forEach(drawBubble);
      }
      drawFx();
    }

    /* ---- ponteiro: arrastar gira, toque estoura ---- */
    let drag = false;
    let start = { x: 0, y: 0 }, last = { x: 0, y: 0 };
    const down = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId); drag = true; target = null;
      cv.style.cursor = "grabbing"; start = last = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      if (curFocus) { orbit += dx * 0.006; vO = dx * 0.006; return; }
      rotY += dx * 0.008; rotX -= dy * 0.008; vY = dx * 0.008; vX = -dy * 0.008;
    };
    const up = (e: PointerEvent) => {
      drag = false; cv.style.cursor = "grab";
      if (anim || Math.hypot(e.clientX - start.x, e.clientY - start.y) >= 7) return;
      if (!curFocus) { vY = AUTO; vX = 0; }
      const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      const hit = [...pts].reverse().find((p) => Math.hypot(p.sx - x, p.sy - y) < p.r + 4);
      if (hit) return tap(hit.it);
      if (curFocus) { const c = shellC(); if (Math.hypot(x - c.x, y - c.y) > shellR()) leave(); }
    };
    const cancel = () => { drag = false; cv.style.cursor = "grab"; };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", cancel);

    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    api.current = { enter, leave, spinTo, setLevel, rebuild: () => rebuild() };
    resize(); rebuild(true);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", cancel);
      api.current = null;
    };
  }, []);

  const focused = focus ? interests.find((i) => i.id === focus) : null;
  const L = focus ? (levels[focus] ?? 0) : 0;

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    onCreate(n, focus);
    setName("");
    setCreating(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {focused ? (
        <div className="flex min-h-11 items-center gap-3 px-4 pt-1">
          <button onClick={() => api.current?.leave()} className="min-h-10 rounded-xl bg-surface-2 px-3.5 text-sm font-semibold">← Voltar</button>
          <span className="min-w-0 truncate text-[13px] text-muted">
            Todas as bolhas › <b className="ml-0.5 font-display text-lg text-ink">{focused.name}</b>
          </span>
        </div>
      ) : (
        <div className="px-4">
          <p className="pt-1 text-[13px] text-muted">Arraste pra girar. Toque 1×: curto · 2×: é minha vida · 3×: sai.</p>
          {trend.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-2 [scrollbar-width:none]">
              <span className="shrink-0 text-[11px] uppercase tracking-wider text-muted">Em alta</span>
              {trend.map(({ i, r }) => (
                <button
                  key={i.id}
                  onClick={() => { api.current?.spinTo(i.id); onToast(`${i.name}: +${i.week_count} pessoas esta semana`); }}
                  className="shrink-0 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold tabular-nums"
                  style={{ borderColor: `hsl(${i.hue} 80% 65% / .45)`, background: `hsl(${i.hue} 70% 50% / .12)`, color: `hsl(${i.hue} 95% 84%)` }}
                >
                  {i.name}<b className="ml-1 text-warn">+{Math.round(r * 100)}%</b>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div ref={stageRef} className="relative min-h-0 flex-1">
        <canvas ref={cvRef} aria-label="Globo de bolhas de interesses" className="absolute inset-0 size-full cursor-grab touch-none select-none" />
      </div>

      <div className="flex items-center gap-2 px-4 pb-3 pt-2">
        {focused ? (
          <>
            <div role="group" aria-label="Quanto você curte esta bolha" className="flex flex-1 overflow-hidden rounded-xl border border-line bg-surface">
              {([[1, "Curto"], [2, "É minha vida ♥"]] as const).map(([l, t]) => (
                <button key={l} onClick={() => api.current?.setLevel(focused, l)} aria-pressed={L === l}
                  className={`min-h-11 flex-1 px-3 text-sm font-semibold ${L === l ? "bg-surface-2 text-ink" : "text-muted"} ${l === 2 ? "border-l border-line" : ""}`}>
                  {t}
                </button>
              ))}
            </div>
            <button onClick={() => { api.current?.setLevel(focused, 0); api.current?.leave(); }} className="min-h-11 whitespace-nowrap rounded-xl bg-surface-2 px-4 text-sm font-semibold">Sair da bolha</button>
          </>
        ) : (
          <form onSubmit={submitCreate} className="flex min-w-0 flex-1 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Não achou? Crie uma bolha" autoComplete="off"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-ink placeholder:text-muted md:max-w-sm" />
            <button type="submit" className="min-h-11 rounded-xl bg-surface-2 px-4 text-sm font-semibold">Criar</button>
          </form>
        )}
      </div>

      {creating && focused && (
        <div className="fixed inset-0 z-30 grid place-items-end bg-[#050912b3] backdrop-blur-[3px] sm:place-items-center sm:p-6" onClick={(e) => e.target === e.currentTarget && setCreating(false)}>
          <form onSubmit={submitCreate} role="dialog" aria-modal="true" aria-label="Nova sub-bolha"
            className="w-full max-w-md rounded-t-3xl border border-line bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] [animation:up_.22s_ease-out] sm:rounded-3xl">
            <h3 className="font-display text-xl font-extrabold">Nova sub-bolha em {focused.name}</h3>
            <p className="mb-4 mt-1 text-sm text-muted">Quanto mais específica, mais forte o match com quem também estourar.</p>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Ex.: algo bem específico" required
              className="min-h-12 w-full rounded-xl border border-line bg-bg px-3 text-ink placeholder:text-muted" />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setCreating(false)} className="min-h-11 flex-1 rounded-xl bg-surface-2 font-semibold">Cancelar</button>
              <button type="submit" className="min-h-11 flex-1 rounded-xl bg-accent font-bold text-[#2a0d1b]">Criar e estourar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
