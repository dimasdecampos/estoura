// Login com Google e tudo que vai pro banco (Supabase): bolhas, matches, convites, chat, eventos, push, admin.
/* ================= LOGIN COM GOOGLE (Supabase) ================= */
// Sem chaves em .env.local o botão fica escondido e o protótipo segue idêntico.
const cfg = window.ESTOURA_CONFIG || {};
const btn = document.getElementById("auth-btn");
if (cfg.url && cfg.key) {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm");
  const sb = createClient(cfg.url, cfg.key, { auth: { flowType: "pkce" } });
  window.estouraSupabase = sb;
  btn.hidden = false;

  const first = u => ((u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || u.email || "Você").split(" ")[0];
  const photo = u => u.user_metadata && (u.user_metadata.avatar_url || u.user_metadata.picture);
  window.estouraSignIn = () => signIn();
  const signIn = () => sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + "/", queryParams: { prompt: "select_account" } } });

  // redes que a pessoa pode colocar no perfil (os links são montados por socialLink, no script principal)
  const SOCIALS = SOCIAL_NETS.map(n => [n.key, n.ph, n.hint || ""]);
  async function openAccount(u){
    // cidade e redes ficam só na sua linha de profiles; os outros só veem as redes depois que você aceita a conversa
    const { data: me } = await sb.from("profiles").select("city, socials").eq("id", u.id).maybeSingle();
    const s = (me && me.socials) || {};
    openSheet(`<div class="ph">${photo(u) ? `<img src="${esc(photo(u))}" alt="" referrerpolicy="no-referrer" style="width:64px;height:64px;border-radius:50%;object-fit:cover">` : `<span class="av me">${esc(first(u)[0])}</span>`}
        <div style="min-width:0"><h3>${esc((u.user_metadata && u.user_metadata.full_name) || first(u))}</h3><div class="meta">${esc(u.email || "")}</div></div></div>
      <div class="sec"><div class="tag">Seu perfil</div>
        <form class="form" id="prof-form">
          <label for="pf-city">Cidade<input type="text" id="pf-city" maxlength="60" placeholder="Ex.: São Paulo" value="${esc((me && me.city) || "")}"></label>
          <div class="tag" style="margin-top:4px">Redes sociais</div>
          ${SOCIALS.map(([k, ph, hint]) => `<label for="pf-${k}">${k}<input type="text" id="pf-${k}" maxlength="120" placeholder="${esc(ph)}" value="${esc(s[k] || "")}" autocapitalize="off" autocomplete="off" spellcheck="false"${k === "WhatsApp" ? ' inputmode="tel"' : ""}>${hint ? `<span class="note" style="margin:0">${esc(hint)}</span>` : ""}</label>`).join("")}
          <div class="note">Só aparecem para quem você aceitar conversar, e só depois que os dois aceitarem. Pode deixar em branco o que não quiser mostrar.</div>
          <button class="btn mint" type="submit">Salvar perfil</button>
        </form></div>
      ${deviceHTML()}
      <div class="actions"><button class="btn" data-close>Fechar</button><button class="btn primary" id="signout">Sair da conta</button></div>`, { type: "account" });
    wireDevice(() => openAccount(u));
    document.getElementById("prof-form").onsubmit = async e => {
      e.preventDefault();
      const socials = {};
      for (const [k] of SOCIALS) {
        const v = document.getElementById("pf-" + k).value.replace(/[\u0000-\u001f]/g, "").trim();
        if (!v) continue;
        if (!socialLink(k, v)) return toast(`Confira o campo ${k}: use o @usuário, o número ou o link do perfil`);
        socials[k] = v;
      }
      const city = document.getElementById("pf-city").value.trim() || null;
      const { error } = await sb.from("profiles").update({ city, socials }).eq("id", u.id);
      toast(error ? "Não consegui salvar o perfil" : "Perfil salvo");
      if (!error) { state.city = city || ""; rebuild(); renderAll(); }
    };
    // recarrega a página para não deixar as bolhas da conta na memória
    document.getElementById("signout").onclick = async () => { if (window.estouraPush) await window.estouraPush.unsubscribe(); await sb.auth.signOut(); location.reload(); };
  }

  /* ---------- avisos (push) e mensagens não lidas ---------- */
  // pede ao servidor do site pra avisar a outra pessoa (só funciona se as chaves VAPID estiverem configuradas)
  async function notifyServer(kind, id){
    if (!cfg.vapid || !uid) return;
    try {
      const { data } = await sb.auth.getSession(), t = data.session && data.session.access_token;
      if (!t) return;
      fetch("/api/push", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", Authorization: "Bearer " + t }, body: JSON.stringify({ kind, id: String(id) }) }).catch(() => {});
    } catch (e) {}
  }
  const b64u = v => { const raw = atob((v + "=".repeat((4 - v.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, ch => ch.charCodeAt(0)); };
  window.estouraPush = {
    async subscribe(){
      if (!cfg.vapid || !uid || !("PushManager" in window)) return false;
      try {
        const reg = await navigator.serviceWorker.ready, key = b64u(cfg.vapid);
        let sub = await reg.pushManager.getSubscription();
        if (sub && sub.options && sub.options.applicationServerKey) { // chaves trocadas: refaz a inscrição
          const cur = new Uint8Array(sub.options.applicationServerKey);
          if (cur.length !== key.length || cur.some((v, i) => v !== key[i])) { await sub.unsubscribe(); sub = null; }
        }
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        const j = sub.toJSON();
        const { error } = await sb.rpc("save_push_subscription", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
        return !error;
      } catch (e) { return false; }
    },
    async unsubscribe(){
      try {
        const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
        if (sub) { if (uid) await sb.rpc("delete_push_subscription", { p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
      } catch (e) {}
    },
  };
  // mensagens novas desde a última vez que cada conversa foi aberta (a leitura fica guardada neste aparelho)
  async function loadUnread(){
    if (!uid) return;
    const [a, b] = await Promise.all([
      sb.from("messages").select("id, connection_id, sender_id, body, created_at").order("id", { ascending: false }).limit(300),
      sb.from("event_messages").select("id, event_id, sender_id, body, created_at").order("id", { ascending: false }).limit(300),
    ]);
    if (a.error && b.error) return;
    const all = [...(a.data || []).map(r => ({ key: chatKey(r.connection_id), id: r.id, me: r.sender_id === uid, text: r.body, at: Date.parse(r.created_at) || 0 })),
      ...(b.data || []).map(r => ({ key: "e_" + r.event_id, id: r.id, me: r.sender_id === uid, text: r.body, at: Date.parse(r.created_at) || 0 }))];
    const last = new Map(); // a mais recente de cada conversa (para a aba Chat)
    all.forEach(r => { const o = last.get(r.key); if (!o || r.at > o.at) last.set(r.key, { text: r.text, me: r.me, at: r.at }); });
    state.last = last;
    const rows = all.filter(r => !r.me);
    let map = readMap();
    if (map === null) { // primeira vez neste aparelho: o que já existe conta como lido
      try { localStorage.setItem("estoura-read", "{}"); } catch (e) {}
      rows.forEach(r => markRead(r.key, r.id));
      map = readMap() || {};
    }
    const next = new Map();
    rows.forEach(r => { if (r.id > (map[r.key] || 0) && !watching(r.key)) next.set(r.key, (next.get(r.key) || 0) + 1); });
    state.unread = next;
    renderAll();
  }

  /* ---------- convites, conexões e chat de verdade ---------- */
  const unpack = r => ({ id: r.connection_id, status: r.status, mine: r.i_am_requester, otherId: r.other_id, name: r.display_name || "Alguém", photo: r.avatar_url, city: r.city || "", socials: r.socials || {} });
  const chatKey = id => "c:" + id;
  const linkConns = () => REAL.forEach(p => { p.conn = CONNS.find(c => c.otherId === p.uid) || null; });
  let live = null, lastAccepted = null;

  async function loadConnections(){
    if (!uid) return;
    const { data, error } = await sb.rpc("connection_people");
    if (error || !uid) return; // se o SQL 0002 ainda não rodou, o app segue sem convites
    CONNS.length = 0; CONNS.push(...data.map(unpack));
    linkConns(); renderAll();
    patchBoot({ conns: CONNS });
    // conversa aceita (ou desfeita): o banco passa a mandar nome completo e foto, então busca os matches de novo
    const acc = CONNS.filter(c => c.status === "accepted").map(c => c.id).sort().join();
    if (acc !== lastAccepted) { if (lastAccepted !== null) loadMatches(); lastAccepted = acc; }
    if (sheet && sheet.type === "profile") { const p = everyone().find(x => x.id === sheet.id); if (p) openProfile(p); }
  }

  window.estouraInvite = async p => {
    const { data: made, error } = await sb.from("connections").insert({ requester_id: uid, addressee_id: p.uid }).select("id").single();
    if (!error && made) notifyServer("i", made.id);
    toast(error ? (error.code === "23505" ? "Já existe um convite entre vocês" : "Não consegui enviar o convite") : `Convite enviado pra ${p.name.split(" ")[0]}`);
    await loadConnections();
  };
  window.estouraRespond = async (connId, accept) => {
    const c = CONNS.find(x => x.id === connId);
    const { error } = await sb.rpc("respond_connection", { p_id: connId, p_accept: accept });
    if (error) return toast("Não consegui responder ao convite");
    if (accept) notifyServer("a", connId);
    toast(accept ? `Vocês estão conectados${c ? " com " + c.name.split(" ")[0] : ""}! Redes liberadas` : "Convite recusado");
    await loadConnections();
  };

  function pushMsg(key, m){
    if (!(m.id != null && state.chats[key] && state.chats[key].some(x => x.id === m.id))) { state.last.set(key, { text: m.text, me: !!m.me, at: Date.now() }); renderChats(); }
    if (m.id != null && (m.me || watching(key))) markRead(key, m.id);
    const list = state.chats[key]; if (!list) return;
    if (list.some(x => x.id === m.id)) return; // a mesma mensagem chega pela resposta do envio e pelo tempo real
    list.push(m);
    if (current && current.key === key) renderMsgs();
  }
  // autor de uma mensagem: no chat 1:1 é a outra pessoa; no chat de evento, quem estiver na lista de presença
  const authorOf = (c, senderId) => (c.ev ? (c.members.find(p => p.uid === senderId) || { name: "Alguém", lv: new Map([[c.shared[0], 1]]) }) : c.members[0]);
  window.estouraLoadChat = async c => {
    const q = c.ev
      ? sb.from("event_messages").select("id, sender_id, body").eq("event_id", c.ev).order("id")
      : sb.from("messages").select("id, sender_id, body").eq("connection_id", c.real).order("id");
    const { data, error } = await q;
    if (error) return toast("Não consegui carregar a conversa");
    const intro = state.chats[c.key].filter(m => m.sys);
    state.chats[c.key] = [...intro, ...data.map(m => ({ id: m.id, me: m.sender_id === uid, p: authorOf(c, m.sender_id), text: m.body }))];
    if (data.length) {
      markRead(c.key, data[data.length - 1].id);
      const l = data[data.length - 1]; state.last.set(c.key, { text: l.body, me: l.sender_id === uid, at: state.last.has(c.key) ? state.last.get(c.key).at : Date.now() });
      renderChats();
    }
    if (current === c) renderMsgs();
  };
  window.estouraSend = async (c, text) => {
    const q = c.ev
      ? sb.from("event_messages").insert({ event_id: c.ev, sender_id: uid, body: text })
      : sb.from("messages").insert({ connection_id: c.real, sender_id: uid, body: text });
    const { data, error } = await q.select("id").single();
    if (error) return toast("Não consegui enviar a mensagem");
    pushMsg(c.key, { id: data.id, me: true, p: authorOf(c, uid), text });
    notifyServer(c.ev ? "e" : "c", data.id);
  };

  /* ---------- eventos reais ---------- */
  const toEvent = r => {
    const d = new Date(r.starts_at), t0 = new Date(), d0 = new Date(d);
    t0.setHours(0, 0, 0, 0); d0.setHours(0, 0, 0, 0);
    const att = (r.attendees || []).filter(a => a.id !== uid)
      .map(a => ({ id: "u_" + a.id, uid: a.id, name: a.name || "Alguém", photo: a.photo, city: "", real: true, lv: new Map([[r.interest_id, 1]]) }));
    return { type: "event", real: true, uuid: r.id, id: "e_" + r.id, title: r.title, short: r.title.length > 18 ? r.title.slice(0, 17) + "…" : r.title,
      interest: r.interest_id, city: r.city || "", mine: r.created_by === uid, start: d, days: Math.round((d0 - t0) / 86400000), place: r.place, going: att, iGo: r.i_go,
      time: String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"),
      c: r.lat != null ? [r.lat, r.lng] : null };
  };
  async function loadEvents(){
    if (!uid) return;
    const { data, error } = await sb.rpc("upcoming_events");
    if (error || !uid) return; // se o SQL 0004 ainda não rodou, ficam só os eventos de exemplo
    for (let i = EVENTS.length - 1; i >= 0; i--) if (EVENTS[i].real) EVENTS.splice(i, 1);
    data.filter(r => byId(r.interest_id)).map(toEvent).filter(e => e.c).forEach(e => {
      EVENTS.push(e);
      if (e.iGo) state.going.add(e.id); else state.going.delete(e.id);
    });
    rebuild(); renderAll();
    if (sheet && sheet.type === "event") { const e = EVENTS.find(x => x.id === sheet.id); if (e) openEvent(e); }
  }
  window.estouraToggleGo = async e => {
    const going = state.going.has(e.id);
    const { error } = going
      ? await sb.from("event_attendees").delete().eq("event_id", e.uuid).eq("user_id", uid)
      : await sb.from("event_attendees").insert({ event_id: e.uuid, user_id: uid });
    if (error && error.code !== "23505") return toast("Não consegui atualizar sua presença");
    toast(going ? "Tudo bem, você saiu do evento" : `Você vai! Chat de ${e.short} liberado`);
    await loadEvents();
  };
  window.estouraUpdateEvent = async (old, e) => {
    const start = new Date();
    start.setDate(start.getDate() + e.days);
    const [h, m] = e.time.split(":"); start.setHours(+h, +m, 0, 0);
    const { data, error } = await sb.from("events").update({ interest_id: e.interest, title: e.title, place: e.place, city: e.city, lat: e.c[0], lng: e.c[1], starts_at: start.toISOString() }).eq("id", old.uuid).select("id");
    if (error || !data || !data.length) return toast("Não consegui salvar o evento. Rode o SQL 0013 no Supabase.");
    toast("Evento atualizado");
    await loadEvents();
  };
  window.estouraCreateEvent = async e => {
    const start = new Date();
    start.setDate(start.getDate() + e.days);
    const [h, m] = e.time.split(":"); start.setHours(+h, +m, 0, 0);
    if (!uid) { toast("Ainda conectando à sua conta. Tente de novo em instantes."); return false; }
    const { error } = await sb.from("events").insert({ created_by: uid, interest_id: e.interest, title: e.title, place: e.place, city: e.city, lat: e.c[0], lng: e.c[1], starts_at: start.toISOString() });
    if (error) {
      console.error("criar evento:", error);
      if (error.code === "42P01" || error.code === "PGRST205") { // sem o SQL 0004 o evento vale só neste aparelho, como no protótipo
        EVENTS.push(e); state.going.add(e.id); rebuild(); renderAll();
        toast("Evento criado só no seu aparelho: rode o SQL 0004 para compartilhar"); return true;
      }
      // qualquer outro erro: mostra o motivo e mantém o formulário aberto pra tentar de novo
      toast(`Não consegui criar o evento: ${error.message || error.code || "erro desconhecido"}`); return false;
    }
    toast("Bolha de evento solta no globo!");
    await loadEvents();
    return true;
  };

  // convites e mensagens chegam na hora (Supabase Realtime, filtrado pelo RLS)
  function startLive(){
    if (live) return;
    live = sb.channel("estoura-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, ({ new: m }) => {
        const c = CONNS.find(x => x.id === m.connection_id), mine = m.sender_id === uid, key = chatKey(m.connection_id);
        pushMsg(key, { id: m.id, me: mine, p: { name: c ? c.name : "Alguém" }, text: m.body });
        if (mine) return;
        if (watching(key)) return markRead(key, m.id); // a conversa está aberta na tela
        bumpUnread(key);
        incoming({ title: c ? c.name : "Nova mensagem", body: m.body.slice(0, 140), tag: key + "#" + m.id, url: "/?chat=" + key });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_messages" }, ({ new: m }) => {
        const ev = EVENTS.find(x => x.id === "e_" + m.event_id), mine = m.sender_id === uid, key = "e_" + m.event_id;
        const who = (ev && ev.going.find(p => p.uid === m.sender_id)) || { name: "Alguém", lv: new Map([[ev ? ev.interest : "", 1]]) };
        pushMsg(key, { id: m.id, me: mine, p: who, text: m.body });
        if (mine) return;
        if (watching(key)) return markRead(key, m.id);
        bumpUnread(key);
        incoming({ title: ev ? ev.title : "Chat de evento", body: `${who.name.split(" ")[0]}: ${m.body.slice(0, 130)}`, tag: key + "#" + m.id, url: "/?chat=" + key });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, async ({ eventType, new: row }) => {
        await loadConnections();
        if (!row) return;
        const c = CONNS.find(x => x.id === row.id), nm = c ? c.name.split(" ")[0] : "Alguém";
        if (eventType === "INSERT" && row.addressee_id === uid) incoming({ title: "Novo convite", body: `${nm} convidou você pra conversar`, tag: "i:" + row.id, url: "/?tab=matches" });
        if (eventType === "UPDATE" && row.status === "accepted" && row.requester_id === uid) incoming({ title: "Convite aceito", body: `${nm} aceitou! Redes sociais liberadas`, tag: "a:" + row.id, url: "/?chat=c:" + row.id });
      })
      .subscribe();
  }
  // alinha as bolhas locais com o banco (syncWorld, em estado.js); bolha recém-criada ainda chegando fica
  const syncInterests = rows => syncWorld(rows, creating, id => saved.delete(id));
  // a bolha criada já existia no banco (nome igual ou apelido de outra): passa a usar a de lá
  function adopt(from, to){
    const a = byId(from); if (!a || from === to) return;
    const toWasMine = state.lv.has(to);
    if (byId(to)) INTERESTS.splice(INTERESTS.indexOf(a), 1); else a.id = to;
    INTERESTS.forEach(i => { if (i.gp === from) i.gp = to; });
    if (state.lv.has(from)) { const l = state.lv.get(from); state.lv.delete(from); if ((state.lv.get(to) || 0) < l) state.lv.set(to, l); }
    if (state.pp.has(from)) { const p = state.pp.get(from); state.pp.delete(from); if (!state.pp.has(to)) state.pp.set(to, p === to ? null : p); }
    state.pp.forEach((p, k) => { if (p === from) state.pp.set(k, k === to ? null : to); });
    if (state.auto.delete(from) && !toWasMine) state.auto.add(to);
    if (state.focus === from) state.focus = to;
    reparent(); rebuild(); renderAll();
  }

  // bolhas novas (de qualquer pessoa), contagens e matches ao vivo
  let worldTimer = null;
  async function refreshWorldNow(){
    if (!uid || loading) return;
    const st = await sb.rpc("interest_stats");
    if (st.error || !uid) return;
    const ch = syncInterests(st.data);
    if (ch.fresh.length || ch.removed || ch.moved) {
      rebuild();
      if (ch.fresh.length) toast(ch.fresh.length === 1 ? `Nova bolha: ${ch.fresh[0].name}` : `${ch.fresh.length} bolhas novas`);
      else if (ch.removed) toast("Uma bolha saiu do Estoura");
      else toast("O mapa de bolhas mudou: veja onde a maioria guarda cada uma");
    }
    renderAll();
    await Promise.all([loadMatches(), loadEvents()]);
  }
  function refreshWorld(){ clearTimeout(worldTimer); worldTimer = setTimeout(refreshWorldNow, 400); }
  // puxar pra baixo pra atualizar: rebusca bolhas, matches, convites e eventos e espera terminar
  window.estouraRefreshAll = async () => {
    if (!uid) { location.reload(); return new Promise(() => {}); }
    await Promise.all([refreshWorldNow(), loadConnections()]);
  };
  let pulse = null;
  function startPulse(){
    if (pulse) return;
    pulse = sb.channel("estoura-pulse").on("broadcast", { event: "pulse" }, refreshWorld).subscribe();
    // reforço: se o canal cair ou o SQL 0003 não tiver rodado, atualiza a cada 30 s (só com a aba visível)
    setInterval(() => { if (!document.hidden) refreshWorld(); }, 30000);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { loadConnections(); refreshWorld(); loadUnread(); } });

  /* ---------- bolhas salvas na conta ---------- */
  let uid = null, loading = false, timer = null, queue = Promise.resolve(), pending = Promise.resolve();
  const saved = new Map(); // o que já está no banco: interest_id -> "nível|onde você guardou"
  const creating = new Set(); // bolhas criadas agora que ainda estão indo pro banco
  let hasAuto = true; // banco já tem a coluna auto (SQL 0010)
  const row = id => `${state.lv.get(id)}|${state.pp.get(id) || ""}|${hasAuto && state.auto.has(id) ? 1 : ""}`;

  async function loadMine(quiet){
    loading = true;
    let [st, mine, pr] = await Promise.all([ sb.rpc("interest_stats"), sb.from("user_interests").select("interest_id, level, parent_id, auto"),
      sb.from("profiles").select("city, role").eq("id", uid).maybeSingle() ]);
    if (pr.error) pr = await sb.from("profiles").select("city").eq("id", uid).maybeSingle(); // sem o SQL 0014 não há a coluna role
    if (mine.error) { // sem o SQL 0010 ainda: funciona sem lembrar as bolhas-mãe automáticas
      const old = await sb.from("user_interests").select("interest_id, level, parent_id");
      if (!old.error) { mine = old; hasAuto = false; }
    }
    loading = false;
    if (st.error || mine.error) { uid = null; toast("Não consegui carregar suas bolhas. Nada será salvo agora."); return; }
    // "Você está em" e o raio seguem a cidade do perfil (vazia = sem filtro de distância)
    state.city = (pr.data && pr.data.city) || "";
    setRole((pr.data || {}).role); // sem o SQL 0014: segue como usuário comum
    saveBoot({ uid, rows: st.data, mine: mine.data, city: state.city, role: (pr.data || {}).role || "user" });
    state.lv.clear(); state.auto.clear(); state.pp.clear(); saved.clear();
    mine.data.forEach(r => { state.lv.set(r.interest_id, r.level); state.pp.set(r.interest_id, r.parent_id || null); if (r.auto) state.auto.add(r.interest_id); saved.set(r.interest_id, row(r.interest_id)); });
    syncInterests(st.data); // bolhas novas, excluídas e movidas por outras pessoas + contagens do banco
    if (pruneAuto()) setTimeout(window.estouraSync, 0); // bolha-mãe automática que ficou sem sub-bolha marcada: sai
    rebuild(); renderAll();
    loadMatches();
    loadConnections(); loadEvents(); startLive(); startPulse();
    loadUnread();
    if ("Notification" in window && Notification.permission === "granted" && !notifOff()) window.estouraPush.subscribe(); // garante o aparelho inscrito nesta conta
    if (mine.data.length && !window.estouraBooted && !quiet) toast(`${mine.data.length} ${mine.data.length > 1 ? "bolhas carregadas" : "bolha carregada"} da sua conta`);
  }

  // pessoas reais que estouraram bolhas iguais às suas (função my_matches do banco)
  async function loadMatches(){
    if (!uid) return;
    const { data, error } = await sb.rpc("my_matches");
    if (error || !uid) { if (state.loadingPeople) { state.loadingPeople = false; renderAll(); } return; }
    const people = new Map();
    data.forEach(r => {
      if (!byId(r.interest_id)) return; // bolha criada depois do último carregamento
      let p = people.get(r.user_id);
      if (!p) { p = { id: "r_" + r.user_id, name: r.display_name || "Alguém", age: null, city: r.city || "", c: null, bio: "", social: {}, shy: true, real: true, uid: r.user_id, photo: r.avatar_url, lv: new Map() }; people.set(r.user_id, p); }
      p.lv.set(r.interest_id, r.level);
    });
    REAL.length = 0; REAL.push(...people.values()); linkConns();
    state.loadingPeople = false;
    renderAll();
    patchBoot({ real: REAL.map(p => ({ ...p, conn: null, lv: [...p.lv] })) });
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadMatches(); });

  async function flush(){
    await pending;
    const up = [], del = [];
    state.lv.forEach((l, id) => { if (byId(id) && saved.get(id) !== row(id)) up.push({ user_id: uid, interest_id: id, level: l, parent_id: state.pp.get(id) || null, ...(hasAuto ? { auto: state.auto.has(id) } : {}) }); });
    saved.forEach((_, id) => { if (!state.lv.has(id)) del.push(id); });
    if (!up.length && !del.length) return;
    let err = null;
    if (up.length) err = (await sb.from("user_interests").upsert(up)).error;
    if (!err && del.length) err = (await sb.from("user_interests").delete().eq("user_id", uid).in("interest_id", del)).error;
    if (err) { toast("Não consegui salvar. Confira sua conexão."); return; }
    up.forEach(r => saved.set(r.interest_id, `${r.level}|${r.parent_id || ""}|${r.auto ? 1 : ""}`));
    del.forEach(id => saved.delete(id));
    loadMatches(); // seus matches mudam quando suas bolhas mudam
  }
  // chamado pelo protótipo a cada mudança; junta cliques rápidos num único envio
  window.estouraSync = () => {
    if (!uid || loading) return;
    clearTimeout(timer);
    timer = setTimeout(() => { queue = queue.then(flush).catch(() => toast("Não consegui salvar. Confira sua conexão.")); }, 300);
  };
  // bolha nova: grava a bolha (para todos) antes de gravar que você estourou.
  // Se o banco já tem uma com esse nome (ou apelido), ele devolve o id dela e o app passa a usar a de lá.
  window.estouraCreateInterest = i => {
    if (!uid) return;
    creating.add(i.id);
    pending = pending.then(async () => {
      const { data, error } = await sb.rpc("create_interest", { p_id: i.id, p_name: i.name, p_parent: i.gp || null, p_hue: i.hue });
      creating.delete(i.id);
      if (error) { // não deu: a bolha sai daqui também, pra não ficar uma bolha que só existe nesta tela
        toast("Não consegui criar a bolha. Confira sua conexão.");
        const k = INTERESTS.indexOf(i); if (k >= 0) INTERESTS.splice(k, 1);
        state.lv.delete(i.id); state.pp.delete(i.id); state.auto.delete(i.id);
        state.pp.forEach((p, id) => { if (p === i.id) state.pp.set(id, null); });
        if (state.focus === i.id) state.focus = null;
        reparent(); rebuild(); renderAll(); return;
      }
      if (data && data !== i.id) adopt(i.id, data);
    });
    return pending;
  };
  // você saiu de uma bolha que criou e que ninguém mais tem: apaga do banco (depois de salvar a saída)
  window.estouraForget = id => {
    if (!uid) return;
    clearTimeout(timer);
    queue = queue.then(flush).then(() => sb.rpc("forget_interest", { p_id: id })).catch(() => {});
  };

  /* ---------- administração (só aparece para admin e super_admin; o banco confere tudo de novo) ---------- */
  let myRole = "user", admUsers = [], blurFilled = false;
  const ROLE_LABEL = { user: "Usuário", admin: "Admin", super_admin: "Super admin" };
  function setRole(r){
    myRole = ["admin", "super_admin"].includes(r) ? r : "user";
    const isAdm = myRole !== "user";
    document.querySelector('nav [data-view="admin"]').hidden = !isAdm;
    if (isAdm && !blurFilled) { blurFilled = true; setTimeout(fillMissingBlur, 1500); }
    if (!isAdm && !document.getElementById("view-admin").hidden) setView("bolhas");
  }
  function renderAdmin(){
    const q = cityKey(document.getElementById("adm-q").value), list = document.getElementById("admin-list");
    const rows = admUsers.filter(u => !q || cityKey([u.display_name, u.email, u.city].join(" ")).includes(q));
    document.getElementById("adm-note").textContent = `${rows.length} de ${admUsers.length}`;
    list.innerHTML = rows.map(u => {
      const self = u.id === uid, canRole = myRole === "super_admin" && !self && u.role !== "super_admin";
      const canDel = !self && u.role !== "super_admin" && (u.role === "user" || myRole === "super_admin");
      return `<div class="card" data-u="${u.id}" style="grid-template-columns:auto 1fr">
        ${avatar({ name: u.display_name || u.email || "?", photo: u.avatar_url, lv: new Map() })}
        <span class="who"><span class="name">${esc(u.display_name || "Sem nome")}</span> <span class="ok">${ROLE_LABEL[u.role] || esc(u.role)}</span>${self ? ' <span class="ok">você</span>' : ""}
          <span class="meta" style="display:block">${esc([u.email, u.city, u.bubbles + (u.bubbles === 1 ? " bolha" : " bolhas")].filter(Boolean).join(" · "))}</span>
          <span class="meta" style="display:block">Entrou em ${new Date(u.created_at).toLocaleDateString("pt-BR")}${u.last_sign_in_at ? " · último acesso " + new Date(u.last_sign_in_at).toLocaleDateString("pt-BR") : ""}</span></span>
        <span class="row" style="grid-column:1/-1;justify-content:flex-end;gap:8px">
          ${canRole ? `<select data-role aria-label="Papel de ${esc(u.display_name || "")}"><option value="user"${u.role === "user" ? " selected" : ""}>Usuário</option><option value="admin"${u.role === "admin" ? " selected" : ""}>Admin</option></select>` : ""}
          ${canDel ? '<button class="btn sm" data-del type="button">Excluir</button>' : ""}</span></div>`;
    }).join("") || '<div class="empty">Ninguém encontrado.</div>';
  }
  async function loadAdmin(){
    const { data, error } = await sb.rpc("admin_list_users");
    if (error) return toast("Não consegui carregar os usuários. Rode o SQL 0014 no Supabase.");
    admUsers = data || []; renderAdmin();
  }
  document.querySelector('nav [data-view="admin"]').addEventListener("click", loadAdmin);
  document.getElementById("adm-q").addEventListener("input", renderAdmin);
  document.getElementById("admin-list").addEventListener("change", async e => {
    const sel = e.target.closest("[data-role]"); if (!sel) return;
    const id = sel.closest("[data-u]").dataset.u, u = admUsers.find(x => x.id === id);
    const { error } = await sb.rpc("admin_set_role", { p_user: id, p_role: sel.value });
    toast(error ? "Não consegui mudar o papel" : `${u.display_name || "Usuário"} agora é ${ROLE_LABEL[sel.value]}`);
    await loadAdmin();
  });
  document.getElementById("admin-list").addEventListener("click", async e => {
    if (!e.target.closest("[data-del]")) return;
    const id = e.target.closest("[data-u]").dataset.u, u = admUsers.find(x => x.id === id); if (!u) return;
    if (!confirm(`Excluir a conta de ${u.display_name || u.email}? Bolhas, conversas e eventos dela somem. Isso não tem volta.`)) return;
    const { error } = await sb.rpc("admin_delete_user", { p_user: id });
    toast(error ? "Não consegui excluir" : "Conta excluída");
    await loadAdmin();
  });

  /* ---------- admin: bolhas (renomear, juntar e excluir pra todo mundo; SQL 0017) ---------- */
  document.getElementById("adm-tabs").onclick = e => {
    const b = e.target.closest("[data-adm]"); if (!b) return;
    document.querySelectorAll("#adm-tabs [data-adm]").forEach(x => x.setAttribute("aria-pressed", x === b));
    document.getElementById("adm-pessoas").hidden = b.dataset.adm !== "pessoas";
    document.getElementById("adm-bolhas").hidden = b.dataset.adm !== "bolhas";
    if (b.dataset.adm === "bolhas") renderAdminBubbles();
  };
  const placeOf = i => i.parent ? pathOf(i.parent).join(" › ") : "bolha principal";
  const people = n => n + (n === 1 ? " pessoa" : " pessoas");
  function renderAdminBubbles(){
    const q = slugify(document.getElementById("admb-q").value), list = document.getElementById("admb-list");
    const all = INTERESTS.filter(i => !q || slugOf(i).includes(q)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    document.getElementById("admb-note").textContent = all.length > 60 ? `60 de ${all.length}` : `${all.length}`;
    list.innerHTML = all.slice(0, 60).map(i => `<div class="card" data-b="${esc(i.id)}" style="grid-template-columns:auto 1fr">
        <span class="av" style="--h:${i.hue}"></span>
        <span class="who"><span class="name">${esc(i.name)}</span><span class="meta" style="display:block">${esc(placeOf(i))} · ${people(count(i))}</span></span>
        <span class="row" style="grid-column:1/-1;justify-content:flex-end;gap:8px"><button class="btn sm" type="button" data-ba="rename">Renomear</button><button class="btn sm" type="button" data-ba="merge">Juntar</button><button class="btn sm" type="button" data-ba="delete">Excluir</button></span></div>`).join("")
      || '<div class="empty">Nenhuma bolha com esse nome.</div>';
  }
  document.getElementById("admb-q").addEventListener("input", renderAdminBubbles);
  // depois de mexer: recarrega o mapa e as suas bolhas (as suas podem ter mudado ao juntar)
  const afterAdmin = async msg => { toast(msg); await loadMine(true); renderAdminBubbles(); };
  const H3 = t => `<h3 style="font-family:var(--display);font-size:22px;margin:0 0 4px">${t}</h3>`;
  function adminRename(it){
    openSheet(`${H3(`Renomear "${esc(it.name)}"`)}
      <p class="sub" style="margin-bottom:8px">Muda pra todo mundo. O nome antigo vira apelido: quem digitar ele cai nesta bolha.</p>
      <input type="text" id="admb-name" maxlength="24" value="${esc(it.name)}" autocomplete="off" style="width:100%">
      <div class="actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="admb-save">Salvar</button></div>`, { type: "admin-bubble" });
    const inp = document.getElementById("admb-name"); inp.focus(); inp.select();
    const save = async () => {
      const name = inp.value.replace(/\s+/g, " ").trim(); if (!name || name === it.name) return closeLayer();
      const { error } = await sb.rpc("admin_rename_interest", { p_id: it.id, p_name: name });
      if (error) return toast(error.code === "23505" ? "Já existe uma bolha com esse nome. Use Juntar." : "Não consegui renomear. Rode o SQL 0017 no Supabase.");
      const old = it.name; closeLayer(); afterAdmin(`"${old}" agora é "${name}"`);
    };
    document.getElementById("admb-save").onclick = save;
    inp.onkeydown = ev => { if (ev.key === "Enter") save(); };
  }
  function adminMerge(it){
    const others = INTERESTS.filter(i => i.id !== it.id).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    openSheet(`${H3(`Juntar "${esc(it.name)}" com…`)}
      <p class="sub" style="margin-bottom:8px">"${esc(it.name)}" some e ${count(it) === 1 ? "quem curtia passa" : `as ${people(count(it))} que curtiam passam`} a curtir a bolha escolhida. Escolha a certa:</p>
      <input type="text" id="admb-mq" placeholder="Buscar bolha" autocomplete="off" style="width:100%;margin-bottom:8px">
      <div id="admb-mlist" style="display:grid;gap:6px;max-height:46vh;overflow:auto">${others.map(i => `<button class="btn" data-into="${esc(i.id)}" style="justify-content:flex-start;text-align:left">${esc(i.name)} <span class="meta" style="margin-left:6px">${esc(placeOf(i))}</span></button>`).join("")}</div>
      <div class="actions"><button class="btn" data-close>Cancelar</button></div>`, { type: "admin-bubble" });
    const mq = document.getElementById("admb-mq"), ml = document.getElementById("admb-mlist");
    mq.oninput = () => { const t = slugify(mq.value); ml.querySelectorAll("[data-into]").forEach(x => { x.hidden = !!t && !slugOf(byId(x.dataset.into)).includes(t); }); };
    ml.onclick = ev => {
      const x = ev.target.closest("[data-into]"); if (!x) return;
      const into = byId(x.dataset.into);
      openSheet(`${H3(`Juntar "${esc(it.name)}" em "${esc(into.name)}"?`)}
        <p class="sub" style="margin-bottom:6px">"${esc(it.name)}" sai do Estoura e vira apelido de "${esc(into.name)}". Não tem volta.</p>
        <div class="actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="admb-ok">Juntar</button></div>`, { type: "admin-bubble" });
      document.getElementById("admb-ok").onclick = async () => {
        const { error } = await sb.rpc("admin_merge_interest", { p_from: it.id, p_into: into.id });
        if (error) return toast("Não consegui juntar. Rode o SQL 0017 no Supabase.");
        closeLayer(); afterAdmin(`"${it.name}" foi juntada em "${into.name}"`);
      };
    };
  }
  function adminDelete(it){
    const ks = kids(it.id);
    openSheet(`${H3(`Excluir "${esc(it.name)}" pra todo mundo?`)}
      <p class="sub" style="margin-bottom:6px">${count(it) ? `${people(count(it))} ${count(it) === 1 ? "perde" : "perdem"} essa bolha. ` : ""}${ks.length ? `As ${ks.length} sub-bolhas de dentro dela continuam e viram principais. ` : ""}Não tem volta. Se é só um nome errado, prefira Renomear ou Juntar.</p>
      <div class="actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="admb-ok" style="background:#ff7a7a;color:#2a0d0d">Excluir</button></div>`, { type: "admin-bubble" });
    document.getElementById("admb-ok").onclick = async () => {
      const { error } = await sb.rpc("admin_delete_interest", { p_id: it.id });
      if (error) return toast(error.code === "23503" ? "Tem eventos nessa bolha. Use Juntar pra levar os eventos pra outra." : "Não consegui excluir. Rode o SQL 0017 no Supabase.");
      closeLayer(); afterAdmin(`"${it.name}" foi excluída`);
    };
  }
  document.getElementById("admb-list").addEventListener("click", e => {
    const b = e.target.closest("[data-ba]"); if (!b) return;
    const it = byId(b.closest("[data-b]").dataset.b); if (!it) return;
    ({ rename: adminRename, merge: adminMerge, delete: adminDelete })[b.dataset.ba](it);
  });

  let wasLogged = false;
  // Foto embaçada (SQL 0015): uma miniatura 20x20 da sua foto, que quem ainda não aceitou conversar com você recebe no lugar dela.
  // Se o servidor da foto não deixar ler a imagem, fica sem miniatura e os outros veem só a inicial.
  // miniatura 20x20 de uma foto (promessa com o data:image/jpeg, ou null se o servidor da foto não deixar ler)
  const makeBlur = src => new Promise(done => {
    const im = new Image(); im.crossOrigin = "anonymous"; im.referrerPolicy = "no-referrer";
    im.onerror = () => done(null);
    im.onload = () => {
      try {
        const t = document.createElement("canvas"), m = Math.min(im.naturalWidth, im.naturalHeight); t.width = t.height = 20;
        t.getContext("2d").drawImage(im, (im.naturalWidth - m) / 2, (im.naturalHeight - m) / 2, m, m, 0, 0, 20, 20);
        done(t.toDataURL("image/jpeg", .7));
      } catch (e) { done(null); }
    };
    im.src = src;
  });
  async function saveBlur(u){
    const src = photo(u); if (!src) return;
    const data = await makeBlur(src); if (!data) return;
    const key = "estoura-blur:" + u.id;
    try { if (localStorage.getItem(key) === data) return; } catch (e) {}
    const { error } = await sb.from("profiles").update({ avatar_blur: data }).eq("id", u.id);
    if (!error) try { localStorage.setItem(key, data); } catch (e) {}
  }
  // admin: gera a miniatura de quem tem foto mas ainda não abriu a versão nova (SQL 0016; sem ele, não faz nada)
  async function fillMissingBlur(){
    const { data, error } = await sb.rpc("admin_missing_blur");
    if (error || !data) return;
    for (const r of data) {
      const blur = await makeBlur(r.avatar_url);
      if (blur) await sb.rpc("admin_set_blur", { p_user: r.id, p_blur: blur });
    }
    if (data.length) loadMatches();
  }

  function render(event, session){
    const u = session && session.user;
    if (u) {
      btn.classList.add("in"); btn.innerHTML = (photo(u) ? `<img src="${esc(photo(u))}" alt="" referrerpolicy="no-referrer">` : "") + esc(first(u));
      btn.setAttribute("aria-label", "Minha conta");
      btn.onclick = () => openAccount(u);
      window.estouraEditProfile = () => openAccount(u);
      if (event === "SIGNED_IN" && !wasLogged) toast(`Olá, ${first(u)}!`);
      window.estouraAuthed = true; peopleAccess(true); // Bolhas e Rede nos Matches: pra quem está logado
      if (uid !== u.id) {
        uid = u.id;
        // quem já tem conta não precisa da tela de boas-vindas (e "começar do zero" não pode apagar o banco)
        try { localStorage.setItem("estoura-welcome", "1"); } catch (e) {}
        if (sheet && sheet.type === "welcome") closeLayer();
        if (!REAL.length) state.loadingPeople = true; // a lista de matches mostra a sombra até chegar
        loading = true; setTimeout(loadMine, 0); // fora do callback de auth, para não travar o cliente
        setTimeout(() => saveBlur(u), 0);
      }
    } else {
      btn.classList.remove("in"); btn.textContent = "Entrar";
      btn.setAttribute("aria-label", "Entrar com o Google");
      btn.onclick = signIn;
      uid = null;
      setRole("user");
      window.estouraAuthed = false; peopleAccess(false);
      clearBoot();
      // abriu com a cópia da conta, mas a sessão não vale mais: recarrega como visitante
      if (window.estouraBooted) { window.estouraBooted = false; location.reload(); }
    }
    wasLogged = !!u;
  }
  sb.auth.onAuthStateChange((event, session) => render(event, session));
  const { data } = await sb.auth.getSession();
  render("INITIAL", data.session);
  // quem ainda não entrou vê as mesmas bolhas, com quantas pessoas tem em cada e tamanho proporcional (só números, nada de pessoas)
  async function loadPublic(){
    if (uid) return;
    const { data: rows, error } = await sb.rpc("public_interest_stats");
    if (error || uid || !rows || !rows.length) return; // sem o SQL 0012, segue com as bolhas de exemplo
    syncInterests(rows); rebuild(true); renderAll();
  }
  if (!data.session) loadPublic();
}
