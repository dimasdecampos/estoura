// Bolhas de evento flutuantes: os próximos eventos saem do globo e flutuam nos cantos da tela, maiores pra ler.
// Tocar: mini bolhas em volta com ver o evento e fechar (a bolha grande sai daqui e o evento volta pequeno pro globo).
// Tocar fora ou na bolha de novo só recolhe as mini bolhas.
// Arrastar: muda a bolha de lugar (o lugar fica guardado neste aparelho). Os outros eventos continuam no globo (evF, em globo.js).
const FLOAT_MAX=4, FLOAT_SLOTS=["tl","tr","bl","br"], FLOAT_KEY="estoura-flutuantes";
// pos: {id: {x,y}} lugar pra onde você arrastou (fração da tela); hidden: ids que você tirou dos cantos (voltam pro globo)
let floatPrefs={pos:{},hidden:[]};
try{ const p=JSON.parse(localStorage.getItem(FLOAT_KEY)||"null"); if(p) floatPrefs={pos:p.pos||{},hidden:p.hidden||[]}; }catch(e){}
const saveFloats=()=>{ try{ localStorage.setItem(FLOAT_KEY,JSON.stringify(floatPrefs)); }catch(e){} };
const floatLayer=document.getElementById("floats");
const floatsOn=()=>!state.focus && !spread.on && !(typeof pm!=="undefined" && pm.on) && bubbleFilter==="all";
let floatSig="", floatMenu=null;

function pickFloats(){
  const vis=visibleEvents().filter(e=>!floatPrefs.hidden.includes(e.id));
  return vis.sort((a,b)=>(relevant(b.interest)-relevant(a.interest))||a.days-b.days).slice(0,FLOAT_MAX);
}
const posOf=id=>floatPrefs.pos[id]||null;
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
  const sig=list.map(e=>[e.id,e.title,e.days,e.time].join("|")).join("~");
  if(sig===floatSig) return;
  const old=new Set([...floatLayer.querySelectorAll(".evf")].map(b=>b.dataset.ev));
  floatSig=sig; closeFloatMenu();
  floatLayer.innerHTML=list.map((e,k)=>{ const h=(byId(e.interest)||{hue:40}).hue;
    return `<button class="evf${old.has(e.id)?"":" in"}" type="button" data-ev="${esc(e.id)}" data-slot="${FLOAT_SLOTS[k]}" style="--h:${h}" aria-label="Evento: ${esc(e.title)}, ${esc(evWhen(e))} às ${e.time}. Toque pra ver ou fechar; arraste pra mover.">
      <b>${esc(e.title)}</b><small>${esc(evShortDay(e))} · ${e.time}</small></button>`; }).join("");
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
function closeFloatMenu(){ if(floatMenu){ const m=floatMenu; floatMenu=null; m.classList.remove("on"); setTimeout(()=>m.remove(),180); } }
// ícones das mini bolhas
const FICON={
  open:'<circle cx="12" cy="12" r="3"/><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/>',
  close:'<path d="M6 6l12 12M18 6L6 18"/>'};
// toque: mini bolhas com ícones em volta da bolha do evento, abrindo pro lado de dentro da tela
function openFloatMenu(el,e){
  closeFloatMenu();
  const opts=[["open","Ver evento"],["close","Fechar (volta pequeno pro globo)"]];
  const box=floatLayer.getBoundingClientRect(), r=el.getBoundingClientRect();
  const cx=r.left-box.left+r.width/2, cy=r.top-box.top+r.height/2;
  // leque de ~105° na diagonal livre (pro lado oposto ao canto onde a bolha está)
  const dir=Math.atan2(Math.sign(box.height/2-cy)||1,Math.sign(box.width/2-cx)||1), ring=r.width/2+34, spread=Math.PI*.3;
  floatMenu=document.createElement("div"); floatMenu.className="evf-menu"; floatMenu.setAttribute("role","menu");
  floatMenu.style.left=cx+"px"; floatMenu.style.top=cy+"px";
  const inside=(v,max)=>Math.max(24,Math.min(max-24,v)); // a mini bolha nunca sai da tela
  floatMenu.innerHTML=opts.map(([k,t],i)=>{ const a=dir+(i/(opts.length-1)-.5)*spread;
    const tx=inside(cx+Math.cos(a)*ring,box.width)-cx, ty=inside(cy+Math.sin(a)*ring,box.height)-cy;
    return `<button type="button" role="menuitem" class="evf-opt" data-fm="${k}" aria-label="${t}" title="${t}" style="--tx:${tx.toFixed(1)}px;--ty:${ty.toFixed(1)}px;--d:${i*35}ms"><svg viewBox="0 0 24 24" aria-hidden="true">${FICON[k]}</svg></button>`; }).join("");
  floatLayer.appendChild(floatMenu);
  requestAnimationFrame(()=>floatMenu&&floatMenu.classList.add("on")); // as mini bolhas saem de dentro da bolha
  floatMenu.onclick=ev=>{
    const b=ev.target.closest("[data-fm]"); if(!b) return;
    const k=b.dataset.fm; closeFloatMenu();
    if(k==="open") return openEvent(e);
    floatPrefs.hidden.push(e.id); delete floatPrefs.pos[e.id]; saveFloats();
    el.classList.add("out"); // estoura e some daqui...
    setTimeout(()=>{ floatSig=""; renderFloats(); },260); // ...e volta pequeno pro globo
    toast("Pronto: o evento volta pro globo, pequeno.");
  };
}
function unhideFloat(id){ floatPrefs.hidden=floatPrefs.hidden.filter(x=>x!==id); saveFloats(); floatSig=""; renderFloats(); }

// tocar abre as mini bolhas; arrastar (sem precisar segurar) muda de lugar
if(floatLayer){
  let hold=null;
  floatLayer.addEventListener("pointerdown",ev=>{
    const el=ev.target.closest(".evf"); if(!el) return;
    const r=el.getBoundingClientRect();
    hold={el,id:el.dataset.ev,x0:ev.clientX,y0:ev.clientY,dx:ev.clientX-r.left,dy:ev.clientY-r.top,drag:false};
    el.setPointerCapture(ev.pointerId);
  });
  floatLayer.addEventListener("pointermove",ev=>{
    if(!hold) return;
    if(!hold.drag){ if(Math.hypot(ev.clientX-hold.x0,ev.clientY-hold.y0)<6) return; hold.drag=true; hold.el.classList.add("drag"); closeFloatMenu(); }
    const box=floatLayer.getBoundingClientRect(), s=hold.el.offsetWidth;
    hold.el.classList.remove("s-tl","s-tr","s-bl","s-br");
    hold.el.style.left=Math.max(0,Math.min(box.width-s,ev.clientX-box.left-hold.dx))+"px";
    hold.el.style.top=Math.max(0,Math.min(box.height-s,ev.clientY-box.top-hold.dy))+"px";
  });
  const end=ev=>{
    if(!hold) return;
    const h=hold; hold=null;
    if(h.drag){
      h.el.classList.remove("drag");
      const box=floatLayer.getBoundingClientRect(), r=h.el.getBoundingClientRect();
      const p={x:(r.left+r.width/2-box.left)/box.width,y:(r.top+r.height/2-box.top)/box.height};
      floatPrefs.pos[h.id]=p; saveFloats();
      return;
    }
    if(ev.type!=="pointerup") return;
    if(floatMenu && floatMenu.dataset.ev===h.id) return closeFloatMenu(); // tocar de novo fecha
    const e=EVENTS.find(x=>x.id===h.id); if(e){ openFloatMenu(h.el,e); floatMenu.dataset.ev=h.id; }
  };
  floatLayer.addEventListener("pointerup",end);
  floatLayer.addEventListener("pointercancel",end);
  document.addEventListener("pointerdown",ev=>{ if(floatMenu && !ev.target.closest(".evf-menu,.evf")) closeFloatMenu(); });
  new ResizeObserver(()=>floatLayer.querySelectorAll(".evf").forEach(el=>placeFloat(el,el.dataset.ev,el.dataset.slot))).observe(floatLayer);
}
