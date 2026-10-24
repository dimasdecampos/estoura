// Bolhas de evento flutuantes: os próximos eventos saem do globo e flutuam nos cantos da tela, maiores pra ler.
// Tocar: ver o evento, fixar (fica naquele lugar mesmo depois de recarregar) ou excluir (some só pra você).
// Segurar e arrastar: muda a bolha de lugar. Os outros eventos continuam no globo (evF, em globo.js).
const FLOAT_MAX=4, FLOAT_SLOTS=["tl","tr","bl","br"], FLOAT_KEY="estoura-flutuantes";
// fixed: {id: {x,y} (fração da tela) ou true}; hidden: ids excluídos por você
let floatPrefs={fixed:{},hidden:[]};
try{ const p=JSON.parse(localStorage.getItem(FLOAT_KEY)||"null"); if(p) floatPrefs={fixed:p.fixed||{},hidden:p.hidden||[]}; }catch(e){}
const floatSession={}; // posição arrastada de quem não está fixado (só até recarregar)
const saveFloats=()=>{ try{ localStorage.setItem(FLOAT_KEY,JSON.stringify(floatPrefs)); }catch(e){} };
const floatLayer=document.getElementById("floats");
const floatsOn=()=>!state.focus && !spread.on && !(typeof pm!=="undefined" && pm.on) && bubbleFilter==="all";
let floatSig="", floatMenu=null;

function pickFloats(){
  const vis=visibleEvents().filter(e=>!floatPrefs.hidden.includes(e.id));
  const fixed=vis.filter(e=>floatPrefs.fixed[e.id]);
  const rest=vis.filter(e=>!floatPrefs.fixed[e.id]).sort((a,b)=>(relevant(b.interest)-relevant(a.interest))||a.days-b.days);
  return [...fixed,...rest].slice(0,FLOAT_MAX);
}
const posOf=id=>{ const f=floatPrefs.fixed[id]; return f&&f.x!=null?f:floatSession[id]||null; };
function placeFloat(el,id,slot){
  const p=posOf(id), box=floatLayer.getBoundingClientRect(), s=el.offsetWidth||86;
  FLOAT_SLOTS.forEach(k=>el.classList.toggle("s-"+k,!p&&k===slot));
  if(p){ el.style.left=Math.max(0,Math.min(box.width-s,p.x*box.width-s/2))+"px"; el.style.top=Math.max(0,Math.min(box.height-s,p.y*box.height-s/2))+"px"; }
  else { el.style.left=el.style.top=""; }
}
function renderFloats(){
  if(!floatLayer) return;
  const list=pickFloats(), ids=new Set(list.map(e=>e.id));
  const changed=[...ids].join()!==[...floatIds].join();
  floatIds=ids;
  if(changed && !state.focus) rebuild(); // os que saíram do globo param de aparecer nele (e os que voltaram, voltam)
  floatLayer.hidden=!floatsOn();
  const sig=list.map(e=>[e.id,e.title,e.days,e.time,!!floatPrefs.fixed[e.id]].join("|")).join("~");
  if(sig===floatSig) return;
  const old=new Set([...floatLayer.querySelectorAll(".evf")].map(b=>b.dataset.ev));
  floatSig=sig; closeFloatMenu();
  floatLayer.innerHTML=list.map((e,k)=>{ const h=(byId(e.interest)||{hue:40}).hue, fx=!!floatPrefs.fixed[e.id];
    return `<button class="evf${fx?" fixed":""}${old.has(e.id)?"":" in"}" type="button" data-ev="${esc(e.id)}" data-slot="${FLOAT_SLOTS[k]}" style="--h:${h}" aria-label="Evento: ${esc(e.title)}, ${esc(evWhen(e))} às ${e.time}. Toque pra ver, fixar ou excluir; segure pra mover.">
      <b>${esc(e.title)}</b><small>${esc(evShortDay(e))} · ${e.time}</small>${fx?'<i class="pin" aria-hidden="true"></i>':""}</button>`; }).join("");
  const box=floatLayer.getBoundingClientRect();
  floatLayer.querySelectorAll(".evf").forEach(el=>{
    placeFloat(el,el.dataset.ev,el.dataset.slot);
    if(el.classList.contains("in")){ // sai do meio do globo voando até o canto
      const r=el.getBoundingClientRect();
      el.style.setProperty("--fx",(box.left+box.width/2-(r.left+r.width/2))+"px"); el.style.setProperty("--fy",(box.top+box.height/2-(r.top+r.height/2))+"px");
      el.addEventListener("animationend",()=>el.classList.remove("in"),{once:true});
    }
  });
}
function closeFloatMenu(){ if(floatMenu){ floatMenu.remove(); floatMenu=null; } }
function openFloatMenu(el,e){
  closeFloatMenu();
  const fx=!!floatPrefs.fixed[e.id];
  floatMenu=document.createElement("div"); floatMenu.className="evf-menu"; floatMenu.setAttribute("role","menu");
  floatMenu.innerHTML=`<button type="button" role="menuitem" data-fm="open">Ver evento</button><button type="button" role="menuitem" data-fm="pin">${fx?"Soltar":"Fixar aqui"}</button><button type="button" role="menuitem" data-fm="hide" class="danger">Excluir</button>`;
  floatLayer.appendChild(floatMenu);
  // abre do lado de dentro da tela, perto da bolha
  const box=floatLayer.getBoundingClientRect(), r=el.getBoundingClientRect(), m=floatMenu.getBoundingClientRect();
  const left=Math.max(6,Math.min(box.width-m.width-6,r.left-box.left+r.width/2-m.width/2));
  const below=r.bottom-box.top+6, above=r.top-box.top-m.height-6;
  floatMenu.style.left=left+"px"; floatMenu.style.top=(below+m.height<box.height?below:Math.max(6,above))+"px";
  floatMenu.onclick=ev=>{
    const b=ev.target.closest("[data-fm]"); if(!b) return;
    closeFloatMenu();
    if(b.dataset.fm==="open") return openEvent(e);
    if(b.dataset.fm==="pin"){
      if(fx){ delete floatPrefs.fixed[e.id]; toast("Solto: pode dar lugar a outro evento"); }
      else { floatPrefs.fixed[e.id]=posOf(e.id)||true; toast("Fixado: fica aqui até você soltar"); }
      saveFloats(); floatSig=""; renderFloats(); return;
    }
    floatPrefs.hidden.push(e.id); delete floatPrefs.fixed[e.id]; saveFloats(); rebuild(); // sai do globo também
    el.classList.add("out"); // estoura e some
    setTimeout(()=>{ floatSig=""; renderFloats(); },260);
    toast("Evento escondido do seu globo. Ele continua na aba Eventos.");
  };
}
function unhideFloat(id){ floatPrefs.hidden=floatPrefs.hidden.filter(x=>x!==id); saveFloats(); floatSig=""; rebuild(); renderFloats(); }

// tocar abre o menu; segurar (e arrastar) move
if(floatLayer){
  let hold=null;
  floatLayer.addEventListener("pointerdown",ev=>{
    const el=ev.target.closest(".evf"); if(!el) return;
    const r=el.getBoundingClientRect();
    hold={el,id:el.dataset.ev,x0:ev.clientX,y0:ev.clientY,dx:ev.clientX-r.left,dy:ev.clientY-r.top,drag:false,moved:false,
      t:setTimeout(()=>{ if(!hold) return; hold.drag=true; el.classList.add("drag"); closeFloatMenu(); try{ navigator.vibrate&&navigator.vibrate(15); }catch(e){} },380)};
    el.setPointerCapture(ev.pointerId);
  });
  floatLayer.addEventListener("pointermove",ev=>{
    if(!hold) return;
    if(!hold.drag){ if(Math.hypot(ev.clientX-hold.x0,ev.clientY-hold.y0)>10){ hold.moved=true; clearTimeout(hold.t); } return; }
    const box=floatLayer.getBoundingClientRect(), s=hold.el.offsetWidth;
    hold.el.classList.remove("s-tl","s-tr","s-bl","s-br");
    hold.el.style.left=Math.max(0,Math.min(box.width-s,ev.clientX-box.left-hold.dx))+"px";
    hold.el.style.top=Math.max(0,Math.min(box.height-s,ev.clientY-box.top-hold.dy))+"px";
  });
  const end=ev=>{
    if(!hold) return;
    const h=hold; hold=null; clearTimeout(h.t);
    if(h.drag){
      h.el.classList.remove("drag");
      const box=floatLayer.getBoundingClientRect(), r=h.el.getBoundingClientRect();
      const p={x:(r.left+r.width/2-box.left)/box.width,y:(r.top+r.height/2-box.top)/box.height};
      if(floatPrefs.fixed[h.id]){ floatPrefs.fixed[h.id]=p; saveFloats(); } else floatSession[h.id]=p;
      return;
    }
    if(ev.type==="pointerup" && !h.moved){ const e=EVENTS.find(x=>x.id===h.id); if(e) openFloatMenu(h.el,e); }
  };
  floatLayer.addEventListener("pointerup",end);
  floatLayer.addEventListener("pointercancel",end);
  document.addEventListener("pointerdown",ev=>{ if(floatMenu && !ev.target.closest(".evf-menu,.evf")) closeFloatMenu(); });
  new ResizeObserver(()=>floatLayer.querySelectorAll(".evf").forEach(el=>placeFloat(el,el.dataset.ev,el.dataset.slot))).observe(floatLayer);
}
