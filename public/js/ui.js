// Telas: abas, avisos, matches, chat, eventos, grupos, janelas (sheets), criar bolha e boas-vindas.
/* ================= UI ================= */
let tt; function toast(t){ const el=document.getElementById("toast"); el.textContent=t; noticeTop(); delete el.dataset.off; clearTimeout(tt); tt=setTimeout(()=>el.dataset.off="",2400); }

/* ---------- avisos: mensagens novas, notificações e app instalado ---------- */
state.unread=new Map(); // chave da conversa ("c:<conexão>" ou "e_<evento>") -> mensagens novas
const unreadOf=key=>state.unread.get(key)||0;
const unreadKind=prefix=>[...state.unread].filter(([k])=>k.startsWith(prefix)).reduce((a,[,n])=>a+n,0);
const pendingInvites=()=>CONNS.filter(c=>c.status==="pending"&&!c.mine).length;
const novidades=()=>unreadKind("")+pendingInvites();
// o que a pessoa já leu: id da última mensagem lida de cada conversa (guardado neste aparelho)
const readMap=()=>{ try{ return JSON.parse(localStorage.getItem("estoura-read")||"null"); }catch(e){ return null; } };
function markRead(key,id){ try{ const m=readMap()||{}; if(id!=null&&(m[key]||0)<id){ m[key]=id; localStorage.setItem("estoura-read",JSON.stringify(m)); } }catch(e){} }
function refreshBadges(){
  const n=novidades(); document.title=n?`(${n}) Estoura`:"Estoura";
  try{ if(navigator.setAppBadge){ if(n) navigator.setAppBadge(n); else navigator.clearAppBadge(); } }catch(e){}
}
function bumpUnread(key){ state.unread.set(key,unreadOf(key)+1); renderAll(); }
function clearUnread(key){ if(state.unread.delete(key)) renderAll(); }
const watching=key=>!!current&&current.key===key&&document.visibilityState==="visible"&&document.hasFocus(); // a conversa está aberta e na tela

// som curto + vibração (o som só toca depois do primeiro toque na página, regra do navegador)
let audioCtx=null;
const unlockAudio=()=>{ try{ audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==="suspended") audioCtx.resume(); }catch(e){} };
addEventListener("pointerdown",unlockAudio,{once:true});
function beep(){
  try{ if(!audioCtx||audioCtx.state!=="running") return; const t=audioCtx.currentTime;
    [[880,0],[1175,.13]].forEach(([f,d])=>{ const o=audioCtx.createOscillator(), g=audioCtx.createGain(); o.type="sine"; o.frequency.value=f;
      g.gain.setValueAtTime(0,t+d); g.gain.linearRampToValueAtTime(.1,t+d+.02); g.gain.exponentialRampToValueAtTime(.001,t+d+.2);
      o.connect(g); g.connect(audioCtx.destination); o.start(t+d); o.stop(t+d+.22); }); }catch(e){}
}
let alertT;
function showAlert(n){
  const el=document.getElementById("alert"); el.innerHTML=`<b>${esc(n.title)}</b><span>${esc(n.body)}</span>`; el.dataset.url=n.url||"";
  delete el.dataset.off; clearTimeout(alertT); alertT=setTimeout(()=>el.dataset.off="",6500);
  beep(); try{ navigator.vibrate&&navigator.vibrate([60,40,60]); }catch(e){}
}
document.getElementById("alert").onclick=e=>{ const el=e.currentTarget; el.dataset.off=""; if(el.dataset.url) openLink(el.dataset.url); };
// notificação do sistema (fora do app). Usa a mesma etiqueta (tag) do aviso do servidor, então não aparece duas vezes
async function systemNotify(n){
  if(!("Notification" in window)||Notification.permission!=="granted"||notifOff()||!navigator.serviceWorker) return;
  try{ const reg=await navigator.serviceWorker.ready;
    await reg.showNotification(n.title,{body:n.body,tag:n.tag,icon:"/icons/icon-192.png",badge:"/icons/icon-192.png",data:{url:n.url||"/"}}); }catch(e){}
}
// n: {title, body, tag, url}. Com o app na tela: faixa no topo. Fora dela: notificação do sistema.
function incoming(n){ if(document.visibilityState==="visible"&&document.hasFocus()) showAlert(n); else systemNotify(n); }

// abrir direto uma conversa ou aba (toque no alerta, na notificação ou em um atalho do app)
function openLink(url){
  let u; try{ u=new URL(url,location.origin); }catch(e){ return; }
  const tab=u.searchParams.get("tab"), chat=u.searchParams.get("chat");
  if(tab&&document.getElementById("view-"+tab)) setView(tab);
  if(chat){ state.link=chat; clearTimeout(state.linkT); state.linkT=setTimeout(()=>{ state.link=null; },20000); tryLink(); }
}
function tryLink(){
  const key=state.link; if(!key) return;
  if(key.startsWith("c:")){ const p=REAL.find(x=>x.conn&&"c:"+x.conn.id===key); if(!p) return; state.link=null; closeLayer(); setView(chatHome()); openRealChat(p); }
  else if(key.startsWith("e_")){ const e=EVENTS.find(x=>x.id===key); if(!e) return; state.link=null; closeLayer(); setView(chatHome()); openEventChat(e); }
}
if(navigator.serviceWorker) navigator.serviceWorker.addEventListener("message",e=>{ if(e.data&&e.data.type==="open") openLink(e.data.url); });
addEventListener("load",()=>{ if(/[?&](chat|tab)=/.test(location.search)){ openLink(location.href); try{ history.replaceState(null,"",location.pathname); }catch(e){} } });

// quem curte sem estar logado: avisa que nada é salvo e que sem conta não há matches (1ª curtida e de novo a cada 6)
let newLikes=0, nudgeT;
function nudgeLogin(){
  if(authed()) return;
  const b=document.getElementById("auth-btn"); if(!b||b.hidden) return; // login não está disponível (modo de demonstração)
  newLikes++; if(newLikes%6!==1) return;
  const el=document.getElementById("nudge"); el.hidden=false; clearTimeout(nudgeT); nudgeT=setTimeout(()=>{ el.hidden=true; },14000);
}
document.getElementById("nudge-x").onclick=()=>{ document.getElementById("nudge").hidden=true; };
document.getElementById("nudge-go").onclick=()=>{ document.getElementById("nudge").hidden=true; if(window.estouraSignIn) window.estouraSignIn(); };

// ativar notificações e instalar o app
const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
const standalone=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
const notifSupported=()=>"Notification" in window&&"serviceWorker" in navigator&&"PushManager" in window;
const canAskNotif=()=>notifSupported()&&(!isIOS||standalone()); // no iPhone só funciona com o app instalado na tela inicial
const notifState=()=>"Notification" in window?Notification.permission:"unsupported"; // default | granted | denied
const notifOff=()=>{ try{ return localStorage.getItem("estoura-notif-off")==="1"; }catch(e){ return false; } };
const setNotifOff=v=>{ try{ if(v) localStorage.setItem("estoura-notif-off","1"); else localStorage.removeItem("estoura-notif-off"); }catch(e){} };
const tipsDone=()=>{ try{ return JSON.parse(localStorage.getItem("estoura-tips")||"{}"); }catch(e){ return {}; } };
const tipDone=k=>!!tipsDone()[k];
function dismissTip(k){ try{ const t=tipsDone(); t[k]=1; localStorage.setItem("estoura-tips",JSON.stringify(t)); }catch(e){} renderTips(); }
async function enableNotifications(){ // só depois de um toque da pessoa (regra do navegador)
  if(!canAskNotif()) return false;
  if(notifState()==="granted"){ setNotifOff(false); if(window.estouraPush) await window.estouraPush.subscribe(); toast("Notificações ativadas!"); renderTips(); return true; }
  let perm; try{ perm=await Notification.requestPermission(); }catch(e){ perm="denied"; }
  if(perm!=="granted"){ toast("Notificações bloqueadas. Libere nas configurações do navegador."); return false; }
  setNotifOff(false);
  if(window.estouraPush) await window.estouraPush.subscribe();
  toast("Notificações ativadas!"); renderTips(); return true;
}
let deferredInstall=null;
addEventListener("beforeinstallprompt",e=>{ e.preventDefault(); deferredInstall=e; renderTips(); });
addEventListener("appinstalled",()=>{ deferredInstall=null; setInstallSeen(); hideInstallBar(); renderTips(); toast("App instalado!"); });
async function installApp(){
  if(!deferredInstall) return;
  deferredInstall.prompt(); try{ await deferredInstall.userChoice; }catch(e){}
  deferredInstall=null; renderTips();
}
/* aviso de instalação no primeiro acesso: aparece uma vez, quando o navegador permite instalar (ou no iPhone, com o passo a passo) */
const SHARE_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4M6 12v7h12v-7"/></svg>';
const installSeen=()=>{ try{ return localStorage.getItem("estoura-install-seen")==="1"; }catch(e){ return false; } };
const setInstallSeen=()=>{ try{ localStorage.setItem("estoura-install-seen","1"); }catch(e){} };
function hideInstallBar(){ document.getElementById("install-bar").hidden=true; noticeTop(); }
// devolve true quando não precisa mais tentar (mostrou, já instalado ou já viu)
function maybeShowInstallBar(){
  const el=document.getElementById("install-bar");
  if(standalone()||installSeen()) return true;
  if(!el.hidden) return true;
  if(layer.firstElementChild) return false; // tem boas-vindas, conversa ou folha aberta: espera fechar
  if(deferredInstall){
    el.innerHTML=`<span>📲 <b>Instale o Estoura</b> no seu aparelho: abre em tela cheia e mais rápido.</span><button class="btn sm primary" id="install-go" type="button">Instalar</button><button class="x" id="install-x" type="button" aria-label="Agora não">×</button>`;
    el.hidden=false; noticeTop(); setInstallSeen();
    document.getElementById("install-go").onclick=async()=>{ hideInstallBar(); await installApp(); };
    document.getElementById("install-x").onclick=hideInstallBar;
    return true;
  }
  if(isIOS){
    el.innerHTML=`<span>📲 <b>Instale o Estoura</b>: toque em Compartilhar ${SHARE_ICON} e depois em <b>Adicionar à Tela de Início</b>.</span><button class="btn sm" id="install-x" type="button">Entendi</button>`;
    el.hidden=false; noticeTop(); setInstallSeen();
    document.getElementById("install-x").onclick=hideInstallBar;
    return true;
  }
  return false; // o navegador ainda não liberou a instalação
}
{ let tries=0; const t=setInterval(()=>{ if(maybeShowInstallBar()||++tries>40) clearInterval(t); },1500); }
function renderTips(){
  const el=document.getElementById("tip-bar"); if(!el) return;
  const out=[];
  if(authed()&&notifState()==="default"&&!tipDone("notif")){
    if(canAskNotif()) out.push(`<div class="tip"><span>🔔 Ative as notificações pra saber na hora quando alguém te responder.</span><button class="btn sm primary" data-tip="notif">Ativar</button><button class="x" data-skip="notif" aria-label="Agora não">×</button></div>`);
    else if(isIOS&&!standalone()) out.push(`<div class="tip"><span>🔔 No iPhone, toque em Compartilhar › Adicionar à Tela de Início pra instalar o app e receber notificações.</span><button class="x" data-skip="notif" aria-label="Fechar">×</button></div>`);
  }
  if(deferredInstall&&!tipDone("install")) out.push(`<div class="tip"><span>📲 Instale o Estoura no seu aparelho: abre mais rápido e em tela cheia.</span><button class="btn sm primary" data-tip="install">Instalar</button><button class="x" data-skip="install" aria-label="Agora não">×</button></div>`);
  el.innerHTML=out.join("");
}
document.getElementById("tip-bar").onclick=async e=>{
  const s=e.target.closest("[data-skip]"); if(s) return dismissTip(s.dataset.skip);
  const b=e.target.closest("[data-tip]"); if(!b) return;
  if(b.dataset.tip==="notif") await enableNotifications(); else await installApp();
};
// bloco "Este aparelho" do menu da conta
function deviceHTML(){
  const n=notifState();
  const notif=!notifSupported()?`<span class="note" style="margin:0">Este navegador não envia notificações.</span>`
    :isIOS&&!standalone()?`<span class="note" style="margin:0">No iPhone, instale o app (Compartilhar › Adicionar à Tela de Início) pra receber notificações.</span>`
    :n==="granted"&&!notifOff()?`<div class="row"><span>🔔 Notificações ligadas</span><button class="btn sm" type="button" id="dev-notif-off">Desligar</button></div>`
    :n==="denied"?`<span class="note" style="margin:0">Notificações bloqueadas. Libere nas configurações do navegador pra este site.</span>`
    :`<div class="row"><span>🔔 Notificações desligadas</span><button class="btn sm primary" type="button" id="dev-notif-on">Ativar</button></div>`;
  const inst=standalone()?"":isIOS?`<span class="note" style="margin:0">📲 Pra instalar o app: toque em Compartilhar e depois em Adicionar à Tela de Início.</span>`:deferredInstall?`<div class="row"><span>📲 App na tela inicial</span><button class="btn sm primary" type="button" id="dev-install">Instalar</button></div>`:"";
  return `<div class="sec"><div class="tag">Este aparelho</div><div class="form">${notif}${inst}</div></div>`;
}
function wireDevice(reopen){
  const g=id=>document.getElementById(id);
  if(g("dev-notif-on")) g("dev-notif-on").onclick=async()=>{ await enableNotifications(); reopen(); };
  if(g("dev-notif-off")) g("dev-notif-off").onclick=async()=>{ setNotifOff(true); if(window.estouraPush) await window.estouraPush.unsubscribe(); toast("Notificações desligadas neste aparelho."); reopen(); };
  if(g("dev-install")) g("dev-install").onclick=async()=>{ await installApp(); reopen(); };
}

function setView(v){
  setTimeout(noticeTop,0);
  document.querySelectorAll(".view").forEach(s=>s.hidden = s.id!=="view-"+v);
  document.querySelectorAll("nav button").forEach(b=>{ if(b.dataset.view===v) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });
  if(v==="bolhas") resize();
  try{ sessionStorage.setItem("estoura-aba",v); }catch(e){} // atualizar a página volta pra mesma aba
}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{ state.wantChat=false; setView(b.dataset.view); if(b.dataset.view==="bolhas"){ if(pm&&pm.on) setPeople(false); goHome(); } });
document.getElementById("logo").onclick=()=>{ setView("bolhas"); if(pm&&pm.on) setPeople(false); goHome(); };

function renderAll(){ renderFloats(); renderHeader(); renderTrend(); renderFocus(); renderMatches(); renderChats(); renderEvents(); renderGroups(); renderTips(); refreshBadges(); tryLink(); if(pm&&pm.on) peopleSync(); }
function renderHeader(){ document.querySelector("#pop-count b").textContent = state.lv.size; }

function renderTrend(){
  const el=document.getElementById("trend"); el.hidden=!!state.focus;
  const tr=trending(); TREND.clear(); tr.forEach(x=>TREND.add(x.i.id)); // as bolhas em alta pulsam no globo
  el.innerHTML=tr.length ? `<span class="tag">Em alta</span>`+tr.map(({i,r})=>`<button data-trend="${i.id}" style="--h:${i.hue}">${esc(i.name)}<b>+${r}</b></button>`).join("")
    : "";
}
/* avisos (toast e "instale o app") aparecem no topo, logo abaixo do "Em alta" (ou do cabeçalho, nas outras abas) */
function noticeTop(){
  const h=document.querySelector("header").getBoundingClientRect().bottom, t=document.getElementById("topbar");
  let b=h; if(t&&t.offsetParent&&t.offsetHeight) b=Math.max(b,t.getBoundingClientRect().bottom); // topo da tela de bolhas: Em alta + aviso de instalar
  document.documentElement.style.setProperty("--ntop",Math.round(b+8)+"px");
}
new ResizeObserver(noticeTop).observe(document.getElementById("topbar")); addEventListener("resize",noticeTop);
document.getElementById("trend").onclick=e=>{ const b=e.target.closest("[data-trend]"); if(b) spinTo(b.dataset.trend); };

function renderFocus(){
  const f=state.focus;
  document.getElementById("topbar").hidden=!!f; document.getElementById("dock-top").hidden=!!f||!newOpen; document.getElementById("new-toggle").hidden=!!f;
  document.getElementById("people-toggle").hidden=!(pm&&pm.access)||!!f;
  document.getElementById("dock-search").hidden=!!f||!searchOpen; document.getElementById("search-toggle").hidden=!!f;
  document.getElementById("crumb").hidden=!f; document.getElementById("dock-focus").hidden=!f;
  if(f){
    const pn=pathOf(f); // Todas as bolhas › A › B › <b>C</b>
    document.querySelector("#crumb .path").innerHTML=`Todas as bolhas › ${pn.slice(0,-1).map(esc).join(" › ")}${pn.length>1?" › ":""}<b id="focus-title">${esc(pn[pn.length-1])}</b>`;
    document.querySelectorAll("#focus-seg button").forEach(b=>b.setAttribute("aria-pressed", String(+b.dataset.l===(state.lv.get(f)||0))));
  }
}

const MATCH_PREVIEW=3; // quantas pessoas a tela de Matches mostra antes do "Ver mais"
// sombra das informações enquanto os dados de verdade chegam
const skeletonCards = n => Array.from({length:n},()=>`<div class="card skel" aria-hidden="true"><span class="av"></span><span class="who"><i style="width:55%"></i><i style="width:80%"></i><i style="width:40%"></i></span><span class="sk-score"></span></div>`).join("")+`<span class="sr-only">Carregando matches…</span>`;
function renderMatches(){
  document.getElementById("filters").innerHTML=`
    ${window.estouraAuthed
      ? `<label>Você está em <b>${esc(cityName(state.city)||state.city||"—")}</b> <button class="btn" type="button" data-editcity="1">${state.city?"Mudar":"Definir"} no perfil</button>
          ${myC()?"":`<span class="note" style="margin:0;flex-basis:100%">${state.city?"Não reconheci essa cidade, então o raio não filtra ninguém. Confira a grafia no perfil.":"Coloque sua cidade no perfil pra o raio funcionar."}</span>`}</label>`
      : `<label for="city">Você está em <select id="city">${Object.keys(CITIES).map(c=>`<option${c===state.city?" selected":""}>${c}</option>`).join("")}</select></label>`}
    <div class="seg" role="group" aria-label="Raio de distância">${[[10,"10 km"],[50,"50 km"],[300,"300 km"],[0,"Brasil todo"]].map(([v,l])=>`<button data-r="${v}" aria-pressed="${state.radius===v}">${l}</button>`).join("")}</div>`;
  const all=ranked(), r=all.filter(x=>x.d==null||inRadius(x.d)), out=all.length-r.length;
  const inv=CONNS.filter(c=>c.status==="pending"&&!c.mine).length;
  // o selo da aba mostra os convites novos; sem convite, quantas pessoas combinam
  const nv=inv, mb=document.getElementById("match-badge"); mb.hidden=!(nv||r.length); mb.textContent=nv||r.length; mb.classList.toggle("alert-on",!!nv);
  // mostra só 3 de cada vez (quem mandou mensagem nova sempre aparece primeiro); "Ver mais" abre o resto
  const chatKey=x=>x.p.conn?"c:"+x.p.conn.id:"", news=r.filter(x=>unreadOf(chatKey(x))>0);
  const ordered=state.moreMatches?r:[...news,...r.filter(x=>!news.includes(x))];
  const shown=state.moreMatches?r:ordered.slice(0,Math.max(MATCH_PREVIEW,news.length)), rest=r.length-shown.length;
  document.getElementById("match-list").innerHTML =
    inviteBlock() +
    (out?`<div class="note">${out} ${out>1?"pessoas":"pessoa"} com bolhas em comum fora do raio.</div>`:"") +
    (r.length ? shown.map(({p,pct,shared,d})=>{ const nn=unreadOf(p.conn?"c:"+p.conn.id:""); return `
    <button class="card" data-person="${p.id}">
      ${avatar(p)}
      <span class="who"><span class="name">${esc(nameOf(p))}</span> ${nn?`<span class="newmsg">${nn} ${nn>1?"novas":"nova"}</span>`:""}${isLinked(p)?'<span class="ok">conectados</span>':""}${p.conn&&p.conn.status==="pending"&&!p.conn.mine?'<span class="ok">convidou você</span>':""}${exTag(p)}
        <span class="meta" style="display:block">${esc(metaLine(p,d))}</span>
        <span class="chips">${shared.slice(0,3).map(i=>chip(i,{p})).join("")}${shared.length>3?`<span class="chip dim">+${shared.length-3}</span>`:""}</span></span>
      <span><span class="score">${pct}%<small>${shared.length} em comum</small></span><span class="bar"><span style="width:${pct}%"></span></span></span>
    </button>`; }).join("")
      + (r.length>MATCH_PREVIEW?`<button class="btn more" data-more="1" aria-expanded="${!!state.moreMatches}">${state.moreMatches?"Mostrar menos":`Ver mais ${rest} ${rest>1?"pessoas":"pessoa"}`}</button>`:"")
      : state.loadingPeople ? skeletonCards(3)
      : `<div class="empty">${!state.lv.size?"Estoure algumas bolhas pra ver seus matches.":out?"Ninguém nesse raio ainda. Aumente a distância.":"Ainda ninguém estourou as mesmas bolhas que você. Convide amigos pra entrar no Estoura!"}</div>`);
}
document.getElementById("filters").addEventListener("change",e=>{ if(e.target.id==="city"){ state.city=e.target.value; rebuild(); renderAll(); } });
document.getElementById("filters").addEventListener("click",e=>{ if(e.target.closest("[data-editcity]")){ if(window.estouraEditProfile) window.estouraEditProfile(); return; } const b=e.target.closest("[data-r]"); if(b){ state.radius=+b.dataset.r; rebuild(); renderAll(); } });
document.getElementById("match-list").onclick=e=>{
  if(e.target.closest("[data-more]")){ state.moreMatches=!state.moreMatches; renderMatches(); return; }
  const a=e.target.closest("[data-inv]"); if(a){ if(window.estouraRespond) window.estouraRespond(a.dataset.inv,a.dataset.act==="accept"); return; }
  const b=e.target.closest("[data-person]"); if(b) openProfile(everyone().find(p=>p.id===b.dataset.person)); };

/* ---------- aba Chat: só aparece quando há conversas ---------- */
state.last=new Map(); // chave da conversa -> última mensagem {text, me, at}
// quem aceitou conversar com você mas não combina em nenhuma bolha agora ainda tem conversa
const personOf=c=>({id:"r_"+c.otherId,uid:c.otherId,name:c.name,photo:c.photo,city:c.city,real:true,shy:true,lv:new Map(),conn:c});
function chatItems(){
  const out=[];
  CONNS.filter(c=>c.status==="accepted").forEach(c=>{
    const p=REAL.find(x=>x.conn&&x.conn.id===c.id)||personOf(c);
    out.push({key:"c:"+c.id,title:c.name,p,kind:"c",open:()=>openRealChat(p)});
  });
  EVENTS.filter(e=>e.real&&state.going.has(e.id)).forEach(e=>out.push({key:e.id,title:e.title,e,kind:"e",open:()=>openEventChat(e)}));
  return out.sort((a,b)=>((state.last.get(b.key)||{}).at||0)-((state.last.get(a.key)||{}).at||0)||a.title.localeCompare(b.title,"pt-BR"));
}
const chatHome=()=>chatItems().length?"chat":"matches";
function renderChats(){
  const items=chatItems(), tab=document.querySelector('nav [data-view="chat"]'); if(!tab) return;
  tab.hidden=!items.length;
  const nu=unreadKind("c:")+unreadKind("e_"), b=document.getElementById("chat-badge");
  b.hidden=!nu; b.textContent=nu; b.classList.toggle("alert-on",!!nu);
  if(!items.length && !document.getElementById("view-chat").hidden) setView("bolhas"); // a aba sumiu: não fica numa tela vazia
  if(items.length && state.wantChat){ state.wantChat=false; setView("chat"); } // atualizou a página estando no Chat
  document.getElementById("chat-list").innerHTML=items.map(it=>{
    const l=state.last.get(it.key), n=unreadOf(it.key);
    const av=it.kind==="c"?avatar(it.p):`<span class="av" style="--h:${(byId(it.e.interest)||{hue:215}).hue}">📅</span>`;
    return `<button class="card" data-chat="${esc(it.key)}">${av}
      <span class="who" style="min-width:0"><span class="name">${esc(it.title)}</span>${it.kind==="e"?' <span class="ok">evento</span>':""}
        <span class="meta" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap${n?";color:var(--ink);font-weight:600":""}">${l?(l.me?"Você: ":"")+esc(l.text):"Diga oi 👋"}</span></span>
      <span>${n?`<span class="newmsg">${n}</span>`:""}</span></button>`; }).join("");
}
document.getElementById("chat-list").onclick=e=>{
  const b=e.target.closest("[data-chat]"); if(!b) return;
  const it=chatItems().find(x=>x.key===b.dataset.chat); if(it) it.open();
};

function renderEvents(){
  const vis=visibleEvents().sort((a,b)=>(relevant(b.interest)-relevant(a.interest))||a.days-b.days);
  const rel=vis.filter(e=>relevant(e.interest)).length;
  const eb=document.getElementById("event-badge"); eb.hidden=!rel; eb.textContent=rel;
  const hidden=EVENTS.filter(e=>e.days>=0).length-vis.length;
  document.getElementById("ev-note").textContent = `${vis.length} ${myC()?"perto de "+(cityName(state.city)||state.city):"no total"}${hidden?` · ${hidden} fora do raio`:""}`;
  document.getElementById("event-list").innerHTML = vis.length ? vis.map(e=>{ const i=byId(e.interest), me=state.going.has(e.id);
    return `<div class="group ev" style="--h:${i.hue}">
      <button class="link" data-event="${e.id}">
        <span class="row"><span>${chip(e.interest)} ${unreadOf(e.id)?`<span class="newmsg">${unreadOf(e.id)} ${unreadOf(e.id)>1?"novas":"nova"}</span> `:""}${relevant(e.interest)?'<span class="ok">combina com você</span>':""}${exTag(e)}</span><span class="when">${evWhen(e)}</span></span>
        <span class="gt" style="margin-top:8px">${esc(e.title)}</span>
        <span class="meta">${esc(evLong(e))} · ${e.time} · ${esc(evPlace(e))}${distTxt(e.c)}</span>
      </button>
      <div class="row"><div class="stack">${me?'<span class="av me">EU</span>':""}${e.going.map(avatar).join("")}<span class="meta" style="margin-left:14px">${evCount(e)} ${evCount(e)>1?"vão":"vai"}</span></div>
        <button class="btn sm ${me?"":"primary"}" data-go="${e.id}">${me?"Abrir chat":"Eu vou"}</button></div>
    </div>`; }).join("") : `<div class="empty">Nenhum evento nesse raio. Crie o primeiro!</div>`;
}
document.getElementById("event-list").onclick=e=>{
  const g=e.target.closest("[data-go]"), o=e.target.closest("[data-event]");
  if(g){ const ev=EVENTS.find(x=>x.id===g.dataset.go); state.going.has(ev.id)?openEventChat(ev):toggleGoing(ev); }
  else if(o) openEvent(EVENTS.find(x=>x.id===o.dataset.event));
};
document.getElementById("new-event").onclick=()=>openCreateEvent(); // sem argumento: o clique não pode virar "evento a editar"

function renderGroups(){
  const gs=suggestGroups();
  const gb=document.getElementById("group-badge"); gb.hidden=!gs.length; gb.textContent=gs.length;
  document.getElementById("group-list").innerHTML = gs.length ? gs.map(g=>`
    <div class="group">
      <div class="chips" style="margin:0">${g.ids.map(i=>chip(i)).join("")}</div>
      <div class="row"><div class="stack">${g.members.map(avatar).join("")}</div>
        <span class="meta">você + ${g.members.length} pessoas</span></div>
      <div class="row"><span class="gt">${esc(g.ids.map(i=>byId(i).name).join(" + "))}</span>
        <button class="btn sm ${state.created.has(g.key)?"":"mint"}" data-group="${g.key}">${state.created.has(g.key)?"Abrir chat":"Criar grupo"}</button></div>
    </div>`).join("") : `<div class="empty">Grupos por afinidade chegam em breve. Por enquanto, convide pessoas dos seus matches e crie ou entre em eventos.</div>`;
}
document.getElementById("group-list").onclick=e=>{
  const b=e.target.closest("[data-group]"); if(!b) return;
  const g=suggestGroups().find(x=>x.key===b.dataset.group); if(!g) return;
  state.created.add(g.key); renderGroups();
  openChat({key:g.key,title:g.ids.map(i=>byId(i).name).join(" + "),members:g.members,shared:g.ids,
    intro:"Grupo criado. As redes sociais de cada pessoa continuam ocultas até vocês aceitarem uma conversa 1:1."});
};

/* ---------- sheets ---------- */
const layer=document.getElementById("layer");
let sheet=null;
function closeLayer(){ layer.innerHTML=""; sheet=null; current=null; }
function openSheet(html,meta){
  sheet=meta;
  layer.innerHTML=`<div class="scrim${/<input|<select|<textarea/.test(html)?" top":""}" id="scrim"><div class="sheet gut" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;
  // No celular, o "clique" que o navegador dispara depois do toque cai na janela recém-aberta
  // e a fechava na hora. Ignoramos cliques nos primeiros instantes.
  const born=Date.now();
  document.getElementById("scrim").addEventListener("click",e=>{ if(Date.now()-born<450) return; if(e.target.id==="scrim"||e.target.closest("[data-close]")) closeLayer(); });
}
const LOCK=`<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;

function openProfile(p){
  const {pct,shared,why=[]}=match(p), d=distTo(coordOf(p)), conn=state.conn[p.id];
  const top=why.slice(0,5), max=Math.max(1,...top.map(w=>w.pts));
  const others=[...p.lv.keys()].filter(i=>!shared.includes(i));
  openSheet(`
    <div class="ph">${avatar(p)}<div style="min-width:0"><h3>${esc(nameOf(p))}${exTag(p)}</h3><div class="meta">${esc(metaLine(p,d,true))}</div></div>
      <div class="score" style="margin-left:auto">${pct}%<small>match</small></div></div>
    ${p.bio?`<p style="margin:14px 0 0;line-height:1.5">${esc(p.bio)}</p>`:""}
    <div class="sec"><div class="tag">Por que ${pct}% de match</div>
      ${top.map(w=>{ const i=byId(w.id); return `<div class="why" style="--h:${i.hue}"><span>${esc(i.name)}${both2(p,w.id)?" ♥":""}</span><span class="wb"><i style="width:${Math.round(100*w.pts/max)}%"></i></span><b>+${Math.round(w.pts)} · ${count(i).toLocaleString("pt-BR")} pessoas</b></div>`; }).join("")}
      ${shared.length>5?`<div class="chips">${shared.slice(5).map(i=>chip(i,{p})).join("")}</div>`:""}
      <div class="note" style="margin-top:8px">Bolha rara vale mais. ♥ = vocês dois marcaram "eu amo!".</div></div>
    ${others.length?`<div class="sec"><div class="tag">Outras bolhas</div><div class="chips">${others.map(i=>chip(i,{dim:true})).join("")}</div></div>`:""}
    <div class="sec"><div class="tag">Redes sociais</div>
      ${p.real ? realSocials(p)
      : conn==="accepted" ? `<div class="socials">${Object.entries(p.social).map(([k,v])=>`<span class="soc"><span>${k}</span>${esc(v)}</span>`).join("")}</div>`
        : `<div class="locked">${LOCK}<div><b>${Object.keys(p.social).join(", ")} protegido${Object.keys(p.social).length>1?"s":""}</b><span>Aparece${Object.keys(p.social).length>1?"m":""} quando vocês dois aceitarem conversar.</span></div></div>`}</div>
    <div class="actions"><button class="btn" data-close>Fechar</button>
      ${p.real?realActions(p)
        : conn==="accepted"?`<button class="btn primary" id="chat-btn">Abrir chat</button>`
        : conn==="pending"?`<button class="btn" disabled>Aguardando ${esc(p.name.split(" ")[0])}</button>`
        : `<button class="btn primary" id="invite-btn">Convidar pra conversar</button>`}</div>`,{type:"profile",id:p.id});
  if(p.real){
    const g=id=>document.getElementById(id);
    if(g("real-invite")) g("real-invite").onclick=()=>window.estouraInvite&&window.estouraInvite(p);
    if(g("real-accept")) g("real-accept").onclick=()=>window.estouraRespond&&window.estouraRespond(p.conn.id,true);
    if(g("real-decline")) g("real-decline").onclick=()=>window.estouraRespond&&window.estouraRespond(p.conn.id,false);
    if(g("real-chat")) g("real-chat").onclick=()=>openRealChat(p);
  }
  const c=document.getElementById("chat-btn"); if(c) c.onclick=()=>openChat({key:"p:"+p.id,title:p.name,members:[p],shared});
  const iv=document.getElementById("invite-btn"); if(iv) iv.onclick=()=>invite(p);
}
function openRealChat(p){ openChat({key:"c:"+p.conn.id,title:p.name,members:[p],shared:match(p).shared,real:p.conn.id}); }
function invite(p){
  state.conn[p.id]="pending"; openProfile(p); toast(`Convite enviado pra ${p.name.split(" ")[0]}`);
  if(p.shy) return;
  setTimeout(()=>{
    state.conn[p.id]="accepted"; renderMatches();
    toast(`${p.name.split(" ")[0]} aceitou! Redes sociais liberadas`);
    if(sheet && sheet.type==="profile" && sheet.id===p.id) openProfile(p);
  },1800);
}

function openEvent(e){
  const i=byId(e.interest), me=state.going.has(e.id);
  openSheet(`
    <div class="row"><span>${chip(e.interest)}</span><span class="when">${evWhen(e)}</span></div>
    <h3 style="font-family:var(--display);font-size:24px;margin:10px 0 4px">${esc(e.title)}</h3>
    <div class="meta">${esc(evLong(e))} · ${e.time}</div>
    <div class="meta">${esc(evPlace(e))}${distTxt(e.c)}</div>
    <div class="sec"><div class="tag">Quem vai (${evCount(e)})</div>
      <div class="chips">${me?'<span class="chip" style="--h:330">Você</span>':""}${e.going.map(p=>`<span class="chip" style="--h:${hueOf(p)}">${esc(p.name.split(" ")[0])}</span>`).join("")}</div></div>
    <p class="note" style="margin-top:14px">A bolha deste evento some do globo depois de ${esc(evLong(e))}.${floatPrefs.hidden.includes(e.id)?' Você tirou ela dos cantos. <button class="link" id="ev-unhide" type="button" style="display:inline;width:auto;color:var(--accent)">Mostrar grande de novo</button>':""}</p>
    <div class="actions"><button class="btn" data-close>Fechar</button>${e.real&&e.mine?'<button class="btn" id="ev-edit">Editar</button>':""}
      ${me?`<button class="btn" id="ev-leave">Não vou mais</button><button class="btn primary" id="ev-chat">Abrir chat</button>`:`<button class="btn primary" id="ev-go">Eu vou</button>`}</div>`,{type:"event",id:e.id});
  const g=document.getElementById("ev-go"); if(g) g.onclick=()=>{ toggleGoing(e); openEvent(e); };
  const l=document.getElementById("ev-leave"); if(l) l.onclick=()=>{ toggleGoing(e); openEvent(e); };
  const c=document.getElementById("ev-chat"); if(c) c.onclick=()=>openEventChat(e);
  const ed=document.getElementById("ev-edit"); if(ed) ed.onclick=()=>openCreateEvent(e);
  const uh=document.getElementById("ev-unhide"); if(uh) uh.onclick=()=>{ unhideFloat(e.id); openEvent(e); toast("O evento volta a aparecer grande"); };
}
function toggleGoing(e){
  if(e.real && window.estouraToggleGo){ window.estouraToggleGo(e); return; } // evento de verdade: salva no banco
  if(state.going.has(e.id)){ state.going.delete(e.id); toast("Tudo bem, você saiu do evento"); }
  else { state.going.add(e.id); toast(`Você vai! Chat de ${e.short} liberado`); }
  renderEvents();
}
function openEventChat(e){
  openChat({key:e.id,title:e.title,members:e.going,shared:[e.interest],ev:e.real?e.uuid:null,
    intro:`Chat do evento · ${evLong(e)} às ${e.time} · ${e.place}. Ele é arquivado depois do evento.`});
}
function openCreateEvent(old){ // com um evento seu na mão, edita ele
  if(!old||old.type!=="event") old=null;
  const opts=[...state.lv.keys()].map(byId); const list=(opts.length?opts:INTERESTS.filter(i=>!i.parent));
  if(old&&!list.some(i=>i.id===old.interest)) list.push(byId(old.interest));
  const dstr=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  openSheet(`
    <h3 style="font-family:var(--display);font-size:22px;margin:0 0 4px">${old?"Editar evento":"Nova bolha de evento"}</h3>
    <p class="sub" style="margin-bottom:6px">Aparece no globo de quem está perto da cidade do evento e some depois da data.</p>
    <form class="form" id="ev-form">
      <label for="ev-title">Nome do rolê<input type="text" id="ev-title" maxlength="40" value="${esc(old?old.title:"Slack + piquenique no Villa-Lobos")}" required></label>
      <label for="ev-int">Bolha<select id="ev-int">${list.map(i=>`<option value="${i.id}"${old&&old.interest===i.id?" selected":""}>${esc(pathOf(i.id).join(" › "))}</option>`).join("")}</select></label>
      <div class="two">
        ${old?`<label for="ev-date">Quando<input type="date" id="ev-date" value="${dstr(old.start||evDate(old))}" min="${dstr(new Date())}" required></label>`:`<label for="ev-day">Quando<select id="ev-day">${[1,2,3,4,5,6,7,14].map(d=>`<option value="${d}"${d===4?" selected":""}>${d===1?"amanhã":`em ${d} dias`}</option>`).join("")}</select></label>`}
        <label for="ev-time">Hora<input type="time" id="ev-time" value="${old?old.time:"15:00"}"></label>
      </div>
      <label for="ev-place">Lugar<input type="text" id="ev-place" maxlength="60" value="${esc(old?old.place:"Parque Villa-Lobos")}"></label>
      <label for="ev-city">Cidade do evento<input type="text" id="ev-city" maxlength="60" placeholder="Ex.: São Luiz do Paraitinga" value="${esc(old?(old.city||""):(cityName(state.city)||state.city||""))}" required></label>
      <div class="note">É a cidade que vale para o raio: só aparece pra quem está perto dela.</div>
      <div class="actions"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">${old?"Salvar":"Soltar a bolha"}</button></div>
    </form>`,{type:"create"});
  document.getElementById("ev-form").onsubmit=ev=>{
    ev.preventDefault();
    const cityTxt=document.getElementById("ev-city").value.trim(), cc=coordsOf(cityTxt);
    if(!cc) return toast("Não reconheci a cidade do evento. Confira a grafia.");
    const city=cityName(cityTxt);
    const t=document.getElementById("ev-title").value.trim()||"Rolê sem nome", dayEl=document.getElementById("ev-day"); // editando, o campo é a data (ev-date) e não existe ev-day
    const e={type:"event",id:"u"+Date.now(),title:t,short:t.length>18?t.slice(0,17)+"…":t,interest:document.getElementById("ev-int").value,
      days:dayEl?+dayEl.value:0,time:document.getElementById("ev-time").value||"15:00",
      place:document.getElementById("ev-place").value.trim()||city,city,c:cc,going:[]};
    if(old){
      const dd=document.getElementById("ev-date").value; if(!dd) return toast("Escolha a data");
      const t0=new Date(); t0.setHours(0,0,0,0); const [y,m,d]=dd.split("-").map(Number);
      e.days=Math.round((new Date(y,m-1,d)-t0)/86400000);
      if(window.estouraUpdateEvent){ window.estouraUpdateEvent(old,e); closeLayer(); }
      return;
    }
    if(window.estouraAuthed){ // logado: evento de verdade. O formulário só fecha quando o banco aceita
      if(!window.estouraCreateEvent) return toast("Ainda conectando à sua conta. Tente de novo em instantes.");
      const btn=document.querySelector("#ev-form button[type=submit]"); if(btn) btn.disabled=true;
      window.estouraCreateEvent(e).then(done=>{ if(done) closeLayer(); else if(btn) btn.disabled=false; });
      return;
    }
    EVENTS.push(e); state.going.add(e.id); rebuild(); renderAll(); closeLayer();
    toast("Bolha de evento solta no globo!");
  };
}

/* ---------- chat ---------- */
let current=null;
function openChat(c){
  current=c; sheet=null; clearUnread(c.key);
  if(!state.chats[c.key]) state.chats[c.key]=[{sys:(c.intro?c.intro+" ":"")+(c.shared.length?`Em comum: ${c.shared.map(i=>byId(i).name).join(", ")}.`:"Vocês estão conectados.")}];
  const n=c.members.length;
  const sub = n>1||c.key.startsWith("e")||c.key.startsWith("u") ? (n?"você, "+c.members.map(m=>m.name.split(" ")[0]).join(", "):"só você por enquanto") : [c.members[0].city,c.shared.length?`match ${match(c.members[0]).pct}%`:""].filter(Boolean).join(" · ");
  const ice=c.shared.length?c.shared.map(i=>ICE[i]||`O que te levou a ${byId(i).name.toLowerCase()}?`):["Oi! Tudo bem?","O que te trouxe pro Estoura?"];
  layer.innerHTML=`<div class="chat" role="dialog" aria-modal="true" aria-label="Conversa: ${esc(c.title)}">
    <div class="ch gut"><button class="back" id="back" aria-label="Voltar">←</button>
      ${n>1?`<div class="stack">${c.members.slice(0,3).map(avatar).join("")}</div>`:n?avatar(c.members[0]):""}
      <div class="t" style="margin-left:${n>1?8:0}px">${esc(c.title)}<small>${esc(sub)}</small></div></div>
    <div class="msgs gut" id="msgs"></div>
    <div class="tip gut" id="chat-tip" hidden style="margin:0;border-radius:0;border-width:1px 0 0"></div>
    <div class="ice gut" id="ice">${ice.map(q=>`<button data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    <form class="composer gut" id="composer"><input type="text" id="msg-input" placeholder="Escreva uma mensagem" autocomplete="off"><button class="btn primary" type="submit">Enviar</button></form>
  </div>`;
  renderMsgs();
  if((c.real||c.ev) && window.estouraLoadChat) window.estouraLoadChat(c); // conversa de verdade: busca o histórico no banco
  document.getElementById("back").onclick=closeLayer;
  chatTip(c);
  document.getElementById("ice").onclick=e=>{ const b=e.target.closest("[data-q]"); if(b) send(b.dataset.q); };
  document.getElementById("composer").onsubmit=e=>{ e.preventDefault(); const i=document.getElementById("msg-input"); if(i.value.trim()){ send(i.value.trim()); i.value=""; } };
}
// conversa de verdade: oferece ligar as notificações (o toque no botão é o que o navegador exige)
function chatTip(c){
  const el=document.getElementById("chat-tip"); if(!el||!(c.real||c.ev)||!authed()||notifState()!=="default"||tipDone("chat-notif")) return;
  if(!canAskNotif()&&!(isIOS&&!standalone())) return;
  el.hidden=false;
  el.innerHTML=canAskNotif()
    ?`<span>🔔 Quer ser avisado quando responderem?</span><button class="btn sm primary" id="tip-on" type="button">Ativar</button><button class="x" id="tip-x" type="button" aria-label="Agora não">×</button>`
    :`<span>🔔 Pra receber avisos no iPhone, instale o app: Compartilhar › Adicionar à Tela de Início.</span><button class="x" id="tip-x" type="button" aria-label="Fechar">×</button>`;
  const on=document.getElementById("tip-on"); if(on) on.onclick=async()=>{ if(await enableNotifications()) el.hidden=true; };
  document.getElementById("tip-x").onclick=()=>{ el.hidden=true; try{ const t=tipsDone(); t["chat-notif"]=1; localStorage.setItem("estoura-tips",JSON.stringify(t)); }catch(e){} };
}
function renderMsgs(typing){
  const box=document.getElementById("msgs"); if(!box||!current) return;
  const grp=current.members.length>1;
  box.innerHTML = state.chats[current.key].map(m=> m.sys?`<div class="sys">${esc(m.sys)}</div>`:
    m.me?`<div class="m me">${esc(m.text)}</div>`:
    `<div class="m them">${grp?`<span class="from" style="--h:${hueOf(m.p)}">${esc(m.p.name.split(" ")[0])}</span>`:""}${esc(m.text)}</div>`).join("")
    + (typing?`<div class="typing">${esc(typing)} está digitando…</div>`:"");
  box.scrollTop=box.scrollHeight;
}
function send(text){
  const c=current;
  if(c.real||c.ev){ if(window.estouraSend) window.estouraSend(c,text); return; } // pessoa real: sem respostas simuladas
  state.chats[c.key].push({me:true,text}); renderMsgs();
  if(!c.members.length) return;
  const who=c.members[Math.floor(Math.random()*c.members.length)];
  setTimeout(()=>{ if(current===c) renderMsgs(who.name.split(" ")[0]); },500);
  setTimeout(()=>{
    const topic=byId(c.shared[Math.floor(Math.random()*c.shared.length)]).name;
    state.chats[c.key].push({p:who,text:REPLIES[Math.floor(Math.random()*REPLIES.length)](topic)});
    if(current===c) renderMsgs();
  },1500+Math.random()*900);
}

/* ---------- nova bolha ---------- */
// Uma bolha existe uma vez só no Estoura. Se já tem uma com esse nome (mesmo com acento ou maiúscula
// diferente), ela é reaproveitada e guardada no lugar escolhido, só na sua árvore.
// parentId undefined (busca pelo "+" do globo): a que já existe é estourada onde está; a nova vira principal.
function createBubble(name,parentId){
  name=String(name||"").replace(/\s+/g," ").trim().slice(0,24); if(!name) return;
  const s=slugify(name), twin=s&&INTERESTS.find(i=>slugOf(i)===s);
  if(twin) return useBubble(twin,parentId);
  parentId=parentId||null;
  const par=parentId?byId(parentId):null;
  const i={id:"u"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),name,hue:par?(par.hue+40)%360:Math.floor(Math.random()*360),
    base:0,week:0,parent:parentId,gp:parentId,custom:true,places:[]};
  INTERESTS.push(i); state.pp.set(i.id,parentId); rebuild();
  if(window.estouraCreateInterest) window.estouraCreateInterest(i);
  setLevel(i,1,true); spotlight(i);
  if(!state.focus && !parentId) setTimeout(()=>{ if(rotating()) spinTo(i.id,true); },60); // gira o globo até ela
  toast(`Bolha "${name}" criada. Agora é chamar a galera!`);
}
// guarda uma bolha que já existe em parentId (null = principal), só pra você; undefined = onde ela já está
function useBubble(it,parentId){
  if(parentId===undefined) parentId=it.parent||null;
  const mine=state.lv.has(it.id), here=(it.parent||null)===parentId, where=parentId?"em "+byId(parentId).name:"nas suas bolhas principais";
  const at=it.parent?` (em ${byId(it.parent).name})`:"";
  if(mine&&here) return toast(`"${it.name}" já está nas suas bolhas${at}`);
  if(!placeMine(it,parentId)) return;
  spotlight(it);
  if(!state.focus && !it.parent) setTimeout(()=>{ if(rotating() && !it.parent) spinTo(it.id,true); },60); // gira o globo até ela (se você ainda está no globo)
  toast(here?`"${it.name}" já existia, estourei pra você${at}`:mine?`"${it.name}" agora está ${where}`:`"${it.name}" já existia: guardei ${where}`);
}
// lugar novo pra uma bolha na sua árvore (se ainda não era sua, passa a ser). Leva junto o que está dentro dela.
function placeMine(it,parentId){
  parentId=parentId||null;
  if(parentId&&(parentId===it.id||isDescendant(parentId,it.id))){ toast("Não dá pra guardar uma bolha dentro dela mesma"); return false; }
  state.pp.set(it.id,parentId); state.auto.delete(it.id);
  if(!state.lv.has(it.id)){ setLevel(it,1,true); return true; }
  reparent(); markUp(it.id); pruneAuto(); rebuild(); renderAll(); // a mãe antiga pode ter ficado sem sub-bolhas marcadas
  if(window.estouraSync) window.estouraSync();
  return true;
}
// bolhas com nome parecido com o que está sendo digitado (a de nome igual vem primeiro)
function suggest(q,max=5){
  const s=slugify(q); if(!s) return [];
  return INTERESTS.map(i=>({i,k:slugOf(i)})).filter(x=>x.k.includes(s))
    .sort((a,b)=>(b.k===s)-(a.k===s)||b.k.startsWith(s)-a.k.startsWith(s)||count(b.i)-count(a.i)||a.i.name.localeCompare(b.i.name,"pt-BR"))
    .slice(0,max).map(x=>x.i);
}
function suggHTML(q,parentId){
  const name=String(q||"").replace(/\s+/g," ").trim(); if(!slugify(name)) return "";
  const list=suggest(name), exact=list.some(i=>slugOf(i)===slugify(name));
  return list.map(i=>{
    const mine=state.lv.has(i.id), here=parentId===undefined||(i.parent||null)===parentId, n=count(i);
    const where=i.parent?"em "+pathOf(i.parent).join(" › "):"bolha principal";
    return `<button type="button" class="sg" role="option" data-sg="${esc(i.id)}" style="--h:${i.hue}"><i></i>
      <span><b>${esc(i.name)}</b><span class="meta">${esc(where)}${n?` · ${n} ${n>1?"pessoas":"pessoa"}`:""}</span></span>
      <em>${mine&&here?"Já é sua":mine?"Trazer pra cá":"Estourar"}</em></button>`;
  }).join("") + (exact?"":`<button type="button" class="sg new" role="option" data-sg-new><i></i>
      <span><b>Criar "${esc(name)}"</b><span class="meta">bolha nova${list.length?", diferente das de cima":""}</span></span></button>`);
}
// liga a lista de sugestões a um campo de texto; done() fecha o formulário depois de escolher
function wireSuggest(inp,box,parentId,done){
  const show=()=>{ box.innerHTML=suggHTML(inp.value,parentId()); box.hidden=!box.innerHTML; };
  inp.addEventListener("input",show);
  box.onclick=e=>{ const b=e.target.closest("[data-sg],[data-sg-new]"); if(!b) return;
    if(b.dataset.sg!=null) useBubble(byId(b.dataset.sg),parentId()); else createBubble(inp.value,parentId());
    inp.value=""; show(); done(); };
  return show;
}
var newOpen=false, searchOpen=false;
const newInp=document.getElementById("new-input"), newSugg=document.getElementById("new-sugg");
const showNewSugg=wireSuggest(newInp,newSugg,()=>undefined,()=>setNewOpen(false));
function setNewOpen(o){ if(o&&searchOpen) setSearchOpen(false); newOpen=o; if(!o){ newInp.value=""; showNewSugg(); } renderFocus(); if(o) newInp.focus(); }

/* buscar: acha uma bolha que já existe e leva você até ela (não curte nem cria nada) */
const srchInp=document.getElementById("search-input"), srchBox=document.getElementById("search-sugg");
function searchHTML(q){
  const name=String(q||"").replace(/\s+/g," ").trim(); if(!slugify(name)) return "";
  const list=suggest(name,8);
  if(!list.length) return `<div class="sg" style="grid-template-columns:1fr;cursor:default"><span><b>Nenhuma bolha com "${esc(name)}"</b><span class="meta">Ainda não existe uma com esse nome.</span></span></div>
    <button type="button" class="sg new" data-sg-make><i></i><span><b>Criar "${esc(name)}"</b><span class="meta">criar uma bolha nova</span></span></button>`;
  return list.map(i=>{ const n=count(i), where=i.parent?"em "+pathOf(i.parent).join(" › "):"bolha principal";
    return `<button type="button" class="sg" role="option" data-sg-go="${esc(i.id)}" style="--h:${i.hue}"><i></i>
      <span><b>${esc(i.name)}</b><span class="meta">${esc(where)}${n?` · ${n} ${n>1?"pessoas":"pessoa"}`:""}</span></span><em>${state.lv.has(i.id)?"♥ sua":"Ver"}</em></button>`; }).join("");
}
const showSearch=()=>{ srchBox.innerHTML=searchHTML(srchInp.value); srchBox.hidden=!srchBox.innerHTML; };
function setSearchOpen(o){ if(o&&newOpen) setNewOpen(false); searchOpen=o; if(!o){ srchInp.value=""; showSearch(); } renderFocus(); if(o) srchInp.focus(); }
// leva até a bolha: as principais giram o globo até elas; as de dentro de outra abrem a bolha-mãe
function goToBubble(id){
  const it=byId(id); if(!it) return;
  setSearchOpen(false);
  if(bubbleFilter!=="all") setFilter("all",true); // o filtro poderia esconder a bolha
  spotlight(it); // fica em destaque (e no globo) e o giro pausa um pouco
  const par=it.parent?byId(it.parent):null;
  if(par){ toast(`${it.name} está em ${pathOf(par.id).join(" › ")}`); state.focus=null; enter(par.id); return; }
  if(!items.includes(it)) rebuild();
  spinTo(id,true); toast(`${it.name}: toque nela pra estourar`);
}
srchInp.addEventListener("input",showSearch);
srchBox.onclick=e=>{
  const g=e.target.closest("[data-sg-go]"); if(g) return goToBubble(g.dataset.sgGo);
  if(e.target.closest("[data-sg-make]")){ const n=srchInp.value.trim().slice(0,24); setSearchOpen(false); setNewOpen(true); newInp.value=n; showNewSugg(); }
};
document.getElementById("search-form").onsubmit=e=>{ e.preventDefault(); const f=srchBox.querySelector("[data-sg-go]"); if(f) goToBubble(f.dataset.sgGo); };
document.getElementById("search-toggle").onclick=()=>setSearchOpen(!searchOpen);
document.getElementById("new-toggle").onclick=()=>setNewOpen(!newOpen);
document.getElementById("new-form").onsubmit=e=>{
  e.preventDefault(); const name=newInp.value.trim(); if(!name) return;
  createBubble(name,undefined); setNewOpen(false);
};
function openNewSub(){
  const par=byId(state.focus);
  openSheet(`<h3 style="font-family:var(--display);font-size:22px;margin:0 0 4px">Nova sub-bolha em ${esc(par.name)}</h3>
    <p class="sub" style="margin-bottom:6px">Busque uma que já existe ou crie uma nova. Quanto mais específica, mais forte o match com quem também estourar.</p>
    <form class="form" id="sub-form"><label for="sub-name">Nome<input type="text" id="sub-name" maxlength="24" autocomplete="off" placeholder="${par.id==="viagens"?"Ex.: Sudeste Asiático":"Ex.: algo bem específico"}" required aria-controls="sub-sugg"></label>
    <div class="sugg" id="sub-sugg" role="listbox" aria-label="Bolhas parecidas" hidden></div>
    <div class="actions"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Criar e estourar</button></div></form>`,{type:"sub"});
  const inp=document.getElementById("sub-name"); setTimeout(()=>inp.focus(),50);
  wireSuggest(inp,document.getElementById("sub-sugg"),()=>par.id,closeLayer);
  document.getElementById("sub-form").onsubmit=e=>{ e.preventDefault(); const n=inp.value.trim(); if(!n) return; closeLayer(); createBubble(n,par.id); };
}

/* ---------- minhas bolhas ---------- */
function openMine(){
  const tops=INTERESTS.filter(i=>!i.parent && state.lv.has(i.id));
  openSheet(`<h3 style="font-family:var(--display);font-size:22px;margin:0 0 4px">Minhas bolhas</h3>
    <p class="sub" style="margin-bottom:4px">É assim que as pessoas te encontram. Ajuste a intensidade ou toque no nome pra entrar na bolha.</p>
    <div class="mine">${tops.length?tops.map(i=>{ const all=descendants(i.id), subs=all.filter(k=>state.lv.has(k.id)), L=state.lv.get(i.id);
      return `<div class="group" style="--h:${i.hue}">
        <div class="row"><button class="link" style="width:auto" data-open="${i.id}"><span class="gt">${esc(i.name)}</span>${all.length?` <span class="meta">› ${subs.length} de ${all.length} sub-bolhas</span>`:""}</button>
          <div class="seg" role="group" aria-label="Intensidade de ${esc(i.name)}"><button data-set="${i.id}" data-l="1" aria-pressed="${L===1}">Curto</button><button data-set="${i.id}" data-l="2" aria-pressed="${L===2}">♥</button><button data-set="${i.id}" data-l="0" class="out" aria-label="Sair de ${esc(i.name)}">✕</button></div></div>
        ${subs.length?`<div class="chips" style="margin:0">${subs.map(s=>chip(s.id)).join("")}</div>`:""}
      </div>`; }).join(""):`<div class="empty">Nenhuma bolha estourada ainda.</div>`}</div>
    <div class="actions"><button class="btn" data-close>Fechar</button></div>`,{type:"mine"});
  layer.querySelector(".mine").onclick=e=>{
    const s=e.target.closest("[data-set]"), o=e.target.closest("[data-open]");
    if(s){ setLevel(byId(s.dataset.set),+s.dataset.l); openMine(); }
    else if(o){ closeLayer(); setView("bolhas"); spinTo(o.dataset.open,true); }
  };
}
document.getElementById("pop-count").onclick=openMine;

/* ---------- boas-vindas ---------- */
// uma bolha desenhada igual às do globo (drawBubble), pra legenda da introdução
let bubN=0;
function bub(h,{r=16,on,love,dots,pulse,event}={}){
  const id="wb"+(++bubN), c=24;
  const grad=on
    ? `<radialGradient id="${id}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="hsl(${h} 95% ${love?84:78}%)"/><stop offset="1" stop-color="hsl(${h} 75% ${love?52:44}%)"/></radialGradient>`
    : `<radialGradient id="${id}"><stop offset=".2" stop-color="hsl(${h} 90% 70% / .04)"/><stop offset=".8" stop-color="hsl(${h} 90% 70% / .16)"/><stop offset="1" stop-color="hsl(${h} 95% 75% / .42)"/></radialGradient>`;
  const stroke=on?`hsl(${h} 100% 90%)`:`hsl(${h} 95% 78% / .75)`;
  let s=`<defs>${grad}</defs>`;
  if(pulse) s+=`<circle class="wpulse" cx="${c}" cy="${c}" r="${r+2.5}" fill="none" stroke="hsl(${h} 100% 80%)" stroke-width="2"/>`;
  s+=`<circle cx="${c}" cy="${c}" r="${r}" fill="url(#${id})" stroke="${event?`hsl(${h} 95% 80%)`:stroke}" stroke-width="${on?2:1.4}"${event?' stroke-dasharray="4 3"':""}/>`;
  if(love) s+=`<circle cx="${c}" cy="${c}" r="${r+4}" fill="none" stroke="${stroke}" stroke-width="1.3"/>`;
  if(!on&&!event) s+=`<path d="M${c+Math.cos(.47)*r*.9} ${c+Math.sin(.47)*r*.9}A${r*.9} ${r*.9} 0 0 1 ${c+Math.cos(2.36)*r*.9} ${c+Math.sin(2.36)*r*.9}" fill="none" stroke="hsl(${(h+70)%360} 95% 78% / .55)" stroke-width="1.5"/>`;
  if(dots) for(let k=0;k<5;k++){ const t=Math.PI/2+(k-2)*.36; s+=`<circle cx="${c+Math.cos(t)*r*.72}" cy="${c+Math.sin(t)*r*.72}" r="1.7" fill="rgba(255,255,255,.75)"/>`; }
  if(event) s+=`<circle cx="${c+r*.68}" cy="${c-r*.68}" r="3" fill="#ffd28a"/>`;
  s+=`<ellipse cx="${c-r*.4}" cy="${c-r*.45}" rx="${r*.18}" ry="${r*.1}" transform="rotate(-40 ${c-r*.4} ${c-r*.45})" fill="rgba(255,255,255,.75)"/>`;
  return `<svg class="wbub${love?" love":""}" style="--h:${h}" viewBox="0 0 48 48" aria-hidden="true">${s}</svg>`;
}
function welcome(){
  let seen=false; try{ seen=localStorage.getItem("estoura-welcome")==="1"; }catch(e){}
  if(seen) return;
  // 3 páginas curtas: pra que serve, a legenda das bolhas (desenhadas como no globo) e gente/privacidade
  const pages=[
    `<svg class="wlogo" viewBox="0 0 160 160" role="img" aria-label="Estoura"><use href="#mark"/></svg>
     <h3 class="wtitle">Estoure suas bolhas.<br>Ache sua turma.</h3>
     <p class="wlead">Cada bolha é um interesse. O Estoura existe pra <b>unir pessoas com gostos em comum</b>: estoure as suas, encontre quem curte o mesmo e descubra coisas novas nas bolhas dos outros.</p>`,
    `<h3 class="wtitle">Entenda as bolhas</h3>
     <div class="legend">
       <div>${bub(200)}<span><b>Transparente</b> ainda não é sua. Toque pra estourar.</span></div>
       <div>${bub(165,{on:1})}<span><b>Colorida</b> você curte.</span></div>
       <div>${bub(330,{on:1,love:1})}<span><b>Com brilho</b> você ama ♥ e pesa mais no match.</span></div>
       <div>${bub(280,{dots:1})}<span><b>Pontinhos dentro</b> tem bolhas dentro dela. Toque pra entrar.</span></div>
       <div>${bub(120,{r:21,pulse:1})}<span><b>Grande</b> muita gente curte. <b>Pulsando</b> está em alta.</span></div>
       <div>${bub(40,{event:1})}<span><b>Tracejada</b> é um evento com data.</span></div>
     </div>`,
    `<h3 class="wtitle">Conheça gente</h3>
     <ul class="wlist">
       <li><b>Matches</b> mostram quem combina com você e por quê.</li>
       <li><b>Convide pra conversar.</b> O chat e as redes sociais só abrem quando os dois aceitam.</li>
       <li><b>Até lá</b>, aparece só o primeiro nome e a foto embaçada.</li>
     </ul>`];
  let at=0;
  const done=()=>{ try{ localStorage.setItem("estoura-welcome","1"); }catch(e){} closeLayer(); };
  const show=()=>{
    const last=at===pages.length-1;
    openSheet(`<div class="wpage">${pages[at]}</div>
      <div class="wdots" aria-label="Página ${at+1} de ${pages.length}">${pages.map((_,i)=>`<i${i===at?' class="on"':""}></i>`).join("")}</div>
      <div class="actions">${at?'<button class="btn" id="w-back">Voltar</button>':'<button class="btn" id="w-skip">Pular</button>'}
        ${last?`${!window.estouraAuthed&&window.estouraSignIn?'<button class="btn" id="w-login">Entrar com Google</button>':""}<button class="btn primary" id="w-zero">Começar</button>`
          :'<button class="btn primary" id="w-next">Próximo</button>'}</div>`,{type:"welcome"});
    const g=id=>document.getElementById(id);
    if(g("w-next")) g("w-next").onclick=()=>{ at++; show(); };
    if(g("w-back")) g("w-back").onclick=()=>{ at--; show(); };
    if(g("w-skip")) g("w-skip").onclick=()=>{ done(); toast("Toque nas bolhas que são a sua cara"); };
    if(g("w-login")) g("w-login").onclick=()=>{ done(); window.estouraSignIn(); };
    if(g("w-zero")) g("w-zero").onclick=()=>{ done(); toast("Toque nas bolhas que são a sua cara"); };
  };
  show();
}

