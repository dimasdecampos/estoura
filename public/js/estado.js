// Estado do app (o que você estourou, conexões, filtros) e as contas de match.
/* ================= ESTADO ================= */
const state = {
  lv:new Map(),
  auto:new Set(), // bolhas-mãe marcadas só porque você marcou uma sub-bolha (saem junto quando a última sub-bolha sai)
  pp:new Map(), // onde você guardou cada uma das suas bolhas: id -> id da bolha de fora (null = bolha principal)
  chats:{}, created:new Set(), conn:{p14:"accepted"}, going:new Set(), city:"São Paulo", radius:300, focus:null
};
let floatIds = new Set(); // eventos que estão flutuando nos cantos (flutuantes.js): saem do globo
let COMMUNITY = 1; // quantas pessoas existem no Estoura (vem do banco)
const count = i => i.base + (state.lv.has(i.id)?1:0);
// bolha rara pesa mais: quanto menor a fatia da comunidade que estourou, maior o peso
const weight = id => Math.log((COMMUNITY+2)/(count(byId(id))+1)) + 0.1;
const myC = () => coordsOf(state.city); // null enquanto a cidade do perfil estiver vazia ou não for reconhecida
const coordOf = p => p.c || coordsOf(p.city);
const distTo = c => { const o=myC(); return o&&c?km(o,c):null; };
const distTxt = c => { const d=distTo(c); return d!=null?" · "+fmtDist(d):""; };
function km(a,b){const t=x=>x*Math.PI/180,dA=t(b[0]-a[0]),dO=t(b[1]-a[1]);const h=Math.sin(dA/2)**2+Math.cos(t(a[0]))*Math.cos(t(b[0]))*Math.sin(dO/2)**2;return 12742*Math.asin(Math.sqrt(h));}
const fmtDist = d => d<5?"menos de 5 km": d<100?`~${Math.round(d/5)*5} km`:`~${Math.round(d/10)*10} km`;
const inRadius = d => d==null || state.radius===0 || d<=state.radius;

function match(p){
  const mine=state.lv; if(!mine.size) return {pct:0,shared:[]};
  const ids=new Set([...mine.keys(),...p.lv.keys()]);
  let s=0,u=0; const shared=[], parts={};
  ids.forEach(id=>{ if(!byId(id)) return; const w=weight(id); u+=w;
    if(mine.has(id)&&p.lv.has(id)){ const v=w*(mine.get(id)===p.lv.get(id)?1:.7); s+=v; parts[id]=v; shared.push(id); } });
  shared.sort((a,b)=>parts[b]-parts[a]);
  const why=shared.map(id=>({id,pts:100*parts[id]/u}));
  return {pct:Math.round(100*s/u),shared,why};
}
function ranked(){
  return everyone().map(p=>({p,...match(p),d:distTo(coordOf(p))})).filter(x=>x.shared.length).sort((a,b)=>b.pct-a.pct);
}
const hueOf = p => { const i=byId([...p.lv.keys()][0]); return i?i.hue:215; };
const initials = n => n.split(" ").filter(s=>s&&s[0]!=="*").map(s=>s[0]).slice(0,2).join(""); // "Maria *****" -> "M"
const esc = s => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const both2 = (p,id) => p && state.lv.get(id)===2 && p.lv.get(id)===2;
function chip(id,{dim,p}={}){ const i=byId(id); const h=both2(p,id);
  return `<span class="chip${dim?" dim":""}${i.parent?" sub":""}" style="--h:${i.hue}"${h?' title="Os dois: eu amo!"':""}>${esc(i.name)}${h?" ♥":""}</span>`; }
// quem ainda não aceitou conversar: foto embaçada e só o primeiro nome
const firstName = n => String(n||"").trim().split(" ")[0];
const maskName = n => { const w=String(n||"").trim().split(/\s+/); return [w[0],...w.slice(1).map(x=>"*".repeat(x.length))].join(" "); };
const nameOf = p => isLinked(p) ? p.name : maskName(p.name);
const avatar = p => { const lk=isLinked(p); return `<span class="av" style="--h:${hueOf(p)}">${p.photo?`<img${lk?"":' class="blur"'} src="${esc(p.photo)}" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`:initials(nameOf(p))}</span>`; };
const relevant = id => state.lv.has(id) || ancestors(id).some(a=>state.lv.has(a));

// em alta = bolhas que mais ganharam gente nos últimos 7 dias (pelo menos 2 pessoas novas); só pra quem está logado
function trending(){ if(!authed()) return []; /* quem não entrou não vê as em alta */ return INTERESTS.filter(i=>!i.parent && i.week>=2).map(i=>({i,r:i.week})).sort((a,b)=>b.r-a.r).slice(0,3); }
const evDate = e => { const d=new Date(); d.setDate(d.getDate()+e.days); const [h,m]=e.time.split(":"); d.setHours(+h,+m,0,0); return d; };
const evWhen = e => e.days===0?"hoje":e.days===1?"amanhã":`em ${e.days} dias`;
const evLong = e => evDate(e).toLocaleDateString("pt-BR",{weekday:"short",day:"numeric",month:"short"});
const evShortDay = e => evDate(e).toLocaleDateString("pt-BR",{weekday:"short",day:"numeric"}).replace(".","").replace(",","");
const evPlace = e => e.place + (e.city && !cityKey(e.place).includes(cityKey(e.city)) ? ", " + e.city : "");
const evCount = e => e.going.length + (state.going.has(e.id)?1:0);
const visibleEvents = () => EVENTS.filter(e=>e.days>=0 && inRadius(distTo(e.c)));

function suggestGroups(){
  const mine=[...state.lv.keys()], combos=[], out=[], seen=new Set();
  const related=(a,b)=>byId(a).parent===b||byId(b).parent===a;
  for(let a=0;a<mine.length;a++)for(let b=a+1;b<mine.length;b++){
    if(related(mine[a],mine[b])) continue; combos.push([mine[a],mine[b]]);
    for(let c=b+1;c<mine.length;c++) if(!related(mine[a],mine[c])&&!related(mine[b],mine[c])) combos.push([mine[a],mine[b],mine[c]]);
  }
  combos.forEach(ids=>{
    const members=PEOPLE.filter(p=>ids.every(i=>p.lv.has(i)));
    if(members.length>=2) out.push({ids,members,key:"g:"+ids.slice().sort().join("+"),w:ids.reduce((s,i)=>s+weight(i),0)});
  });
  out.sort((x,y)=>y.ids.length-x.ids.length || y.w-x.w);
  return out.filter(g=>{const k=g.members.map(m=>m.id).join();if(seen.has(k))return false;seen.add(k);return true;}).slice(0,5);
}


// Alinha as bolhas locais com o banco: entram as novas, saem as excluídas, mudam de lugar as que
// a maioria passou a guardar em outro lugar (as suas ficam onde você guardou).
function syncWorld(rows, keep = new Set(), onRemove = () => {}){
  const ids = new Set(rows.map(r => r.id)), out = { fresh: [], removed: 0, moved: false };
  if (rows.length) for (let i = INTERESTS.length - 1; i >= 0; i--) { // só poda se o banco devolveu bolhas
    const id = INTERESTS[i].id;
    if (ids.has(id) || keep.has(id)) continue; // bolha recém-criada ainda chegando no banco fica
    INTERESTS.splice(i, 1); state.lv.delete(id); state.pp.delete(id); state.auto.delete(id); onRemove(id); out.removed++;
    state.pp.forEach((p, k) => { if (p === id) state.pp.set(k, null); });
  }
  rows.forEach(r => {
    let it = byId(r.id);
    if (!it) { it = { id: r.id, name: r.name, hue: r.hue, base: r.people, week: r.week_count, parent: null }; INTERESTS.push(it); out.fresh.push(it); }
    if (it.name !== r.name) { it.name = r.name; it._s = undefined; } // renomeada por um admin
    it.gp = r.parent_id || null; it.custom = !!r.custom; it.places = r.places || [];
  });
  out.moved = reparent();
  // se a bolha em que você estava foi excluída, volta pro início
  if (state.focus && !byId(state.focus)) state.focus = null;
  COMMUNITY = community(rows);
  rows.forEach(r => { const it = byId(r.id); it.base = r.people - (state.lv.has(r.id) ? 1 : 0); it.week = r.week_count; });
  return out;
}
// tamanho da comunidade: o banco informa (coluna total); sem o SQL 0005, usa a maior bolha como aproximação
const community = rows => (rows.length && rows[0].total != null ? rows[0].total : Math.max(1, ...rows.map(r => r.people)));

// Cópia da sua conta neste aparelho (bolhas, mapa, cidade e papel), salva a cada carregamento do banco.
// Ao abrir o app logado, a tela já nasce com ela; o banco confirma e corrige logo em seguida (conta.js).
const BOOT_KEY = "estoura-boot", BOOT_V = 1; // mudou o formato da cópia? aumente BOOT_V e a cópia antiga é ignorada
function readBoot(){ try{ const c = JSON.parse(localStorage.getItem(BOOT_KEY) || "null"); return c && c.v === BOOT_V ? c : null; }catch(e){ return null; } }
// bolhas, cidade e papel (loadMine): mantém matches e convites já guardados da mesma conta
function saveBoot(o){ const c = readBoot(); try{ localStorage.setItem(BOOT_KEY, JSON.stringify({ ...(c && c.uid === o.uid ? c : {}), ...o, v: BOOT_V })); }catch(e){} }
// matches (real) e convites (conns): só completa uma cópia que já existe
function patchBoot(o){ const c = readBoot(); if (!c) return; try{ localStorage.setItem(BOOT_KEY, JSON.stringify({ ...c, ...o })); }catch(e){} }
function clearBoot(){ try{ localStorage.removeItem(BOOT_KEY); }catch(e){} }
// devolve {user, cache} quando há sessão salva do Supabase e a cópia é dessa mesma conta
function bootData(){
  const cfg = window.ESTOURA_CONFIG || {};
  if (!cfg.url || !cfg.key) return null;
  try {
    const s = JSON.parse(localStorage.getItem(`sb-${new URL(cfg.url).hostname.split(".")[0]}-auth-token`) || "null");
    const c = readBoot();
    const u = s && s.user;
    if (!u || !s.refresh_token || !c || c.uid !== u.id || !Array.isArray(c.rows) || !Array.isArray(c.mine)) return null;
    return { user: u, cache: c };
  } catch (e) { return null; }
}
