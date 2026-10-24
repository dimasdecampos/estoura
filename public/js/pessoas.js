// Visão de pessoas (botão no globo, pra quem está logado): bolhas de pessoas e rede. No fim, inicia o app.
/* ================= PESSOAS (aba Matches, pra quem está logado) =================
   Menu no topo dos Matches: Lista | Bolhas | Rede. Mostra as mesmas pessoas da lista (até 24, dentro do raio).
   - Bolhas: cada bolha é uma pessoa; quanto mais combina, maior e mais perto de você.
     Tocar abre a bolha dela com tudo o que ela curtiu: coloridas = vocês dois curtem; transparentes = só ela (toque pra estourar).
   - Rede: você no centro, as bolhas em comum no anel do meio e as pessoas por fora. As linhas mostram o que liga vocês;
     toque numa bolha ou pessoa pra destacar as linhas dela (na pessoa, 2º toque abre o perfil). */
var pm={on:false,mode:"bolhas",open:null,closing:false,z:0,nodes:new Map(),inner:[],innerKey:"",ints:new Map(),sel:null,hover:null,W:0,H:0,top:52,DPR:1,imgs:new Map(),raf:0,down:null,now:0};
const pv=document.getElementById("people"), px=pv.getContext("2d");
const PM_MAX=24, NET_MAX=18, GOLD=2.39996;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const pmView=()=>document.getElementById("view-bolhas");
const ICON_SPREAD='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6.500" cy="7" r="2.800"/><circle cx="17" cy="6" r="2"/><circle cx="18" cy="15.500" r="3.200"/><circle cx="8" cy="17.500" r="2.300"/><circle cx="12.500" cy="11.500" r="1.200"/></svg>';
const ICON_GLOBE='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.200 3 3.200 15 0 18M12 3c-3.200 3-3.200 15 0 18"/></svg>';
function peopleAccess(ok){
  pm.access=ok; renderFocus(); // some quando uma bolha está aberta, como a lupa e o +
  if(!ok && pm.on) setPeople(false);
}
function setPeople(on){
  if(on===pm.on) return;
  pm.on=on; pmView().classList.toggle("pm",on); pv.hidden=!on; document.getElementById("people-bar").hidden=!on;
  const b=document.getElementById("people-toggle"), t=on?"Voltar pro globo de bolhas":"Ver pessoas que combinam com você";
  b.innerHTML=on?ICON_GLOBE:ICON_SPREAD; // o ícone mostra pra onde você vai
  b.setAttribute("aria-pressed",String(on)); b.title=t; b.setAttribute("aria-label",t);
  cancelAnimationFrame(pm.raf);
  if(on){ goHome(); pm.open=null; pm.closing=false; pm.z=0; pm.sel=null; pm.hover=null; pm.nodes.clear(); pm.ints.clear(); pmResize(); peopleSync(); pm.raf=requestAnimationFrame(pmFrame); }
  else resize();
}
document.getElementById("people-toggle").innerHTML=ICON_SPREAD;
document.getElementById("people-toggle").onclick=()=>setPeople(!pm.on);

function photoOf(url,blur){
  if(!url) return null;
  let im=pm.imgs.get(url);
  if(!im){ im=new Image(); im.referrerPolicy="no-referrer"; im.src=url; pm.imgs.set(url,im); }
  if(!(im.complete&&im.naturalWidth)) return null;
  if(!blur) return im;
  // embaçada: reduz pra 8x8 e deixa o navegador suavizar ao ampliar (funciona em qualquer navegador)
  if(!im._blur){ const m=Math.min(im.naturalWidth,im.naturalHeight), t=document.createElement("canvas"); t.width=t.height=18;
    t.getContext("2d").drawImage(im,(im.naturalWidth-m)/2,(im.naturalHeight-m)/2,m,m,0,0,18,18); im._blur=t; }
  return im._blur;
}
const myPhoto=()=>{ const i=document.querySelector("#auth-btn img"); return i?i.src:null; };
function pmGeo(){ const W=pm.W,H=pm.H,top=pm.top,S=Math.min(W,H-top); return {W,H,top,S,cx:W/2,cy:top+(H-top)/2,ex:clamp(W/Math.max(1,H-top),1,1.6),ey:clamp((H-top)/Math.max(1,W),1,1.3)}; }

/* ---------- dados ---------- */
const pmList=()=>ranked().filter(x=>inRadius(x.d)).slice(0,PM_MAX);
function peopleSync(){
  if(!pm.on) return;
  const keep=new Map(), g=pmGeo();
  pmList().forEach((x,k)=>{
    const id=x.p.id, n=pm.nodes.get(id)||{id,x:g.cx+(Math.random()-.5)*60,y:g.cy+(Math.random()-.5)*60,r:0,vx:0,vy:0,seed:Math.random()*7};
    Object.assign(n,{p:x.p,pct:x.pct,shared:x.shared,k}); keep.set(id,n);
  });
  pm.nodes=keep;
  if(pm.open){ const n=keep.get(pm.open.id); if(n){ pm.open=n; pmInner(); } else { pm.open=null; pm.z=0; } }
  if(pm.sel && pm.sel.kind==="p" && !keep.has(pm.sel.id)) pm.sel=null;
  pmLayout(); pmBar();
}
function pmLayout(){
  const g=pmGeo(), list=[...pm.nodes.values()]; if(!g.S) return;
  // Bolhas: quem combina mais fica maior e mais perto (relativo ao grupo, pra espalhar mesmo com % parecidos)
  const lo=Math.min(...list.map(n=>n.pct)), hi=Math.max(...list.map(n=>n.pct)), fit=Math.min(1,Math.sqrt(10/Math.max(1,list.length)));
  pm.rMe=clamp(g.S*.085,24,54);
  list.forEach(n=>{
    n.rel=hi>lo?(n.pct-lo)/(hi-lo):1;
    n.br=clamp(g.S*(.05+.05*n.rel)*Math.max(.6,fit),15,62);
    const a=n.k*GOLD-Math.PI/2, inner=pm.rMe+n.br+16, outer=Math.max(inner,g.S*.47-n.br), d=inner+(1-n.rel)*(outer-inner);
    n.btx=g.cx+Math.cos(a)*d*g.ex; n.bty=g.cy+Math.sin(a)*d*g.ey;
  });
  // Rede: bolhas em comum no anel do meio (as que mais ligam gente), pessoas por fora perto das bolhas delas
  const cnt=new Map(); list.forEach(n=>n.shared.forEach(id=>cnt.set(id,(cnt.get(id)||0)+1)));
  const ints=[...cnt].filter(([id])=>byId(id)).map(([id,c])=>({id,c,s:c*weight(id)})).sort((a,b)=>b.s-a.s).slice(0,NET_MAX)
    .sort((a,b)=>byId(a.id).hue-byId(b.id).hue); // cores parecidas lado a lado (sub-bolhas ficam perto da mãe)
  const rI=g.S*.2, rO=g.S*.4, m=ints.length, im=new Map();
  ints.forEach((x,k)=>{
    const a=k/m*Math.PI*2-Math.PI/2, old=pm.ints.get(x.id);
    im.set(x.id,Object.assign(old||{id:x.id,x:g.cx,y:g.cy,r:0},{c:x.c,a,tx:g.cx+Math.cos(a)*rI*g.ex,ty:g.cy+Math.sin(a)*rI*g.ey,tr:clamp((4+3*Math.sqrt(x.c))*g.S/520,5,16)}));
  });
  pm.ints=im;
  const want=list.map(n=>{ let sx=0,sy=0; n.shared.forEach(id=>{ const it=im.get(id); if(it){ const w=weight(id); sx+=Math.cos(it.a)*w; sy+=Math.sin(it.a)*w; } });
    return {n,a:sx||sy?Math.atan2(sy,sx):n.k*GOLD}; }).sort((a,b)=>a.a-b.a);
  const N=want.length; let ox=0,oy=0;
  want.forEach((q,i)=>{ const d=q.a-i/N*Math.PI*2; ox+=Math.cos(d); oy+=Math.sin(d); });
  const off=Math.atan2(oy,ox);
  want.forEach((q,i)=>{ const a=i/N*Math.PI*2+off; q.n.ntx=g.cx+Math.cos(a)*rO*g.ex; q.n.nty=g.cy+Math.sin(a)*rO*g.ey; q.n.na=a; q.n.nr=clamp(g.S*.036,13,22); });
}
// bolhas de dentro da pessoa aberta: em comum no meio, as outras em volta (posição guardada em fração do raio)
function pmInner(){
  const p=pm.open.p, ids=[...p.lv.keys()].filter(byId), key=ids.slice().sort().join();
  if(key===pm.innerKey) return; // a mesma lista: não mexe nas posições (tocar numa bolha não embaralha tudo)
  pm.innerKey=key;
  const sh=id=>state.lv.has(id);
  ids.sort((a,b)=>(sh(b)-sh(a))||(weight(b)-weight(a)));
  const n=ids.length, rb=clamp(.8/Math.sqrt(Math.max(1,n)),.07,.3);
  const out=ids.map((id,k)=>{ const d=.72*Math.sqrt((k+.5)/n), a=k*GOLD;
    return {id,x:Math.cos(a)*d,y:Math.sin(a)*d,r:rb*(sh(id)?1.1:.9)*(byId(id).parent?.88:1)}; });
  for(let it=0;it<80;it++){ // desencosta as bolhas e mantém todas dentro da bolha da pessoa
    for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){ const a=out[i],b=out[j]; let dx=b.x-a.x,dy=b.y-a.y; const d=Math.hypot(dx,dy)||.001, min=a.r+b.r+.012;
      if(d<min){ const s=(min-d)/2; dx/=d; dy/=d; a.x-=dx*s; a.y-=dy*s; b.x+=dx*s; b.y+=dy*s; } }
    out.forEach(b=>{ const d=Math.hypot(b.x,b.y), lim=.94-b.r; if(d>lim){ b.x*=lim/d; b.y*=lim/d; } });
  }
  pm.inner=out;
}
function pmOpen(n){ pm.open=n; pm.closing=false; pm.innerKey=""; pmInner(); pmBar(); }
function pmClose(){ if(pm.open){ pm.closing=true; pmBar(); } }

/* ---------- barra de cima ---------- */
function pmBar(){
  const el=document.getElementById("people-bar"), n=pm.nodes.size, o=pm.open&&!pm.closing?pm.open:null;
  if(o){
    const f=esc(o.p.name.split(" ")[0]);
    el.innerHTML=`<button class="btn sm" data-pact="back">← Voltar</button><span class="pwho"><b>${esc(nameOf(o.p))}</b> · ${o.pct}% · ${o.shared.length} em comum</span><button class="btn sm" data-pact="profile">Ver perfil</button>
      <span class="note plegend"><span>${bub(165,{on:1})}Colorida: vocês dois curtem</span><span>${bub(200)}Transparente: só ${f} curte. Toque pra estourar também</span></span>`;
  } else {
    let note=n?`${n} ${n>1?"pessoas que combinam":"pessoa que combina"} com você`:"";
    if(pm.mode==="rede"){
      const s=pm.sel, it=s&&s.kind==="i"&&byId(s.id), nd=s&&s.kind==="p"&&pm.nodes.get(s.id);
      if(it){ const c=[...pm.nodes.values()].filter(x=>x.shared.includes(it.id)).length; note=`${esc(it.name)} liga você a ${c} ${c>1?"pessoas":"pessoa"}`; }
      else if(nd) note=`${esc(nameOf(nd.p))} · ${nd.pct}% · ${nd.shared.length} em comum. Toque de novo pra abrir o perfil.`;
      else if(n) note+=". Toque numa bolha ou pessoa pra ver as linhas dela.";
    } else if(n) note+=". Toque numa pessoa pra ver o que ela curte.";
    el.innerHTML=`<div class="seg" role="group" aria-label="Como ver as pessoas"><button data-pm="bolhas" aria-pressed="${pm.mode==="bolhas"}">Bolhas</button><button data-pm="rede" aria-pressed="${pm.mode==="rede"}">Rede</button></div><span class="note">${note}</span>`;
  }
  const top=Math.max(48,el.offsetHeight+16);
  if(top!==pm.top){ pm.top=top; pmLayout(); }
}
document.getElementById("people-bar").onclick=e=>{
  const m=e.target.closest("[data-pm]"); if(m){ pm.mode=m.dataset.pm; pm.sel=null; pm.hover=null; pm.open=null; pm.closing=false; pm.z=0; pmBar(); return; }
  const a=e.target.closest("[data-pact]"); if(!a) return;
  if(a.dataset.pact==="back") pmClose(); else if(pm.open) openProfile(pm.open.p);
};

/* ---------- toque ---------- */
function pmShell(){ // a bolha da pessoa aberta, no ponto atual da animação
  const g=pmGeo(), n=pm.open, e=ease(pm.z), SR=Math.min(g.W*.47,(g.H-g.top)*.47);
  return {x:lerp(n.x,g.cx,e),y:lerp(n.y,g.cy,e),r:lerp(n.r||n.br,SR,e)};
}
function pmHit(x,y){
  if(pm.open){
    const s=pmShell();
    for(const b of pm.inner) if(Math.hypot(x-(s.x+b.x*s.r),y-(s.y+b.y*s.r))<b.r*s.r+3) return {kind:"in",id:b.id};
    return Math.hypot(x-s.x,y-s.y)<s.r?{kind:"shell"}:null;
  }
  for(const n of pm.nodes.values()) if(Math.hypot(x-n.x,y-n.y)<n.r+5) return {kind:"p",id:n.id};
  if(pm.mode==="rede") for(const it of pm.ints.values()) if(Math.hypot(x-it.x,y-it.y)<it.r+9) return {kind:"i",id:it.id};
  return null;
}
function pmTap(x,y){
  const h=pmHit(x,y);
  if(pm.open){
    if(pm.closing) return;
    if(!h) return pmClose();
    if(h.kind!=="in") return;
    const it=byId(h.id), L=state.lv.get(h.id)||0, his=pm.open.p.lv.get(h.id);
    if(!L) setLevel(it,1); // estoura pra você também (o toast diz o que aconteceu)
    else toast(L===2&&his===2?`Vocês dois amam ${it.name} ♥`:`Vocês dois curtem ${it.name}`);
    return;
  }
  if(pm.mode==="bolhas"){ if(h&&h.kind==="p") pmOpen(pm.nodes.get(h.id)); return; }
  if(h&&h.kind==="p"&&pm.sel&&pm.sel.kind==="p"&&pm.sel.id===h.id) return openProfile(pm.nodes.get(h.id).p);
  pm.sel=h; pmBar();
}
pv.addEventListener("pointerdown",e=>{ pm.down={x:e.offsetX,y:e.offsetY}; });
pv.addEventListener("pointerup",e=>{ const d=pm.down; pm.down=null; if(d&&Math.hypot(e.offsetX-d.x,e.offsetY-d.y)<10) pmTap(e.offsetX,e.offsetY); });
pv.addEventListener("pointermove",e=>{ if(e.pointerType!=="mouse") return; const h=pmHit(e.offsetX,e.offsetY); pm.hover=h&&h.kind!=="shell"?h:null; pv.style.cursor=pm.hover?"pointer":"default"; });
pv.addEventListener("pointerleave",()=>{ pm.hover=null; });
document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&pm.on&&pm.open&&!layer.firstElementChild) pmClose(); });

function pmResize(){
  const box=pv.parentElement.getBoundingClientRect(); if(!box.width) return;
  pm.DPR=Math.min(2,window.devicePixelRatio||1); pm.W=box.width; pm.H=box.height;
  pv.width=pm.W*pm.DPR; pv.height=pm.H*pm.DPR; px.setTransform(pm.DPR,0,0,pm.DPR,0,0);
}
new ResizeObserver(()=>{ if(pm.on){ pmResize(); pmLayout(); } }).observe(pv.parentElement);

/* ---------- animação ---------- */
function pmStep(){
  const g=pmGeo(), list=[...pm.nodes.values()], net=pm.mode==="rede";
  if(net){
    list.forEach(n=>{ n.x+=(n.ntx-n.x)*.1; n.y+=(n.nty-n.y)*.1; n.r+=(n.nr-n.r)*.12; n.vx=n.vy=0; });
    pm.ints.forEach(it=>{ it.x+=(it.tx-it.x)*.1; it.y+=(it.ty-it.y)*.1; it.r+=(it.tr-it.r)*.12; });
  } else if(!pm.open){
    list.forEach(n=>{ n.vx+=(n.btx-n.x)*.012; n.vy+=(n.bty-n.y)*.012; n.r+=(n.br-n.r)*.12; });
    for(let i=0;i<list.length;i++){ const a=list[i];
      const dx0=a.x-g.cx, dy0=a.y-g.cy, d0=Math.hypot(dx0,dy0)||.01, m0=pm.rMe+a.r+10; // não encosta em você
      if(d0<m0){ a.vx+=dx0/d0*(m0-d0)*.08; a.vy+=dy0/d0*(m0-d0)*.08; }
      for(let j=i+1;j<list.length;j++){ const b=list[j]; let dx=b.x-a.x,dy=b.y-a.y; const d=Math.hypot(dx,dy)||.01, min=a.r+b.r+6;
        if(d<min){ const s=(min-d)*.04; dx/=d; dy/=d; a.vx-=dx*s; a.vy-=dy*s; b.vx+=dx*s; b.vy+=dy*s; } } }
    list.forEach(n=>{ n.vx*=.86; n.vy*=.86; n.x+=n.vx; n.y+=n.vy;
      n.x=clamp(n.x,n.r+4,g.W-n.r-4); n.y=clamp(n.y,g.top+n.r,g.H-n.r-14); });
  }
  if(pm.open){
    const t=pm.closing?0:1; pm.z+=(t-pm.z)*(reduce?1:.14);
    if(pm.closing&&pm.z<.02){ pm.open=null; pm.closing=false; pm.z=0; pmBar(); }
  }
}
// a pessoa como uma bolha igual às do globo: transparente, borda na cor dela, reflexo, e a foto no fundo (sem foto: as iniciais)
// o: {label, extra (linha de baixo), photoA (força da foto), ring (borda mais grossa)}
function pmFace(x,y,r,photo,txt,h,o={}){
  if(r<1) return;
  const c=px, A=c.globalAlpha, im=photoOf(photo,o.blur);
  c.save(); c.beginPath(); c.arc(x,y,r,0,7); c.clip();
  if(im){ c.imageSmoothingQuality="high"; const w=im.naturalWidth||im.width, hh=im.naturalHeight||im.height, m=Math.min(w,hh); c.globalAlpha=A*(o.photoA??.62); c.drawImage(im,(w-m)/2,(hh-m)/2,m,m,x-r,y-r,r*2,r*2); c.globalAlpha=A; }
  else if(!o.label){ c.fillStyle=`hsla(${h} 90% 82% / .55)`; c.font=`800 ${Math.max(9,r*.62)}px Figtree, system-ui, sans-serif`; c.textAlign="center"; c.textBaseline="middle"; c.fillText(txt,x,y+1); }
  const g=c.createRadialGradient(x,y,r*.2,x,y,r); // película da bolha por cima da foto: mais forte na borda
  g.addColorStop(0,`hsla(${h} 90% 70% / .04)`); g.addColorStop(.75,`hsla(${h} 90% 70% / .2)`); g.addColorStop(1,`hsla(${h} 95% 75% / .55)`);
  c.fillStyle=g; c.fillRect(x-r,y-r,r*2,r*2);
  c.restore();
  c.lineWidth=o.ring||1.4; c.strokeStyle=`hsla(${h} 95% 78% / .85)`; c.beginPath(); c.arc(x,y,r,0,7); c.stroke();
  c.strokeStyle=`hsla(${(h+70)%360} 95% 78% / .55)`; c.lineWidth=1.6; c.beginPath(); c.arc(x,y,r*.9,Math.PI*.15,Math.PI*.75); c.stroke();
  c.fillStyle="rgba(255,255,255,.75)"; c.beginPath(); c.ellipse(x-r*.4,y-r*.45,r*.18,r*.1,-.7,0,7); c.fill();
  if(o.label && r>15){ // nome (e o %) dentro da bolha, com sombra pra ler por cima da foto
    const fs=clamp(r*.3,10,16), ex=o.extra&&r>22;
    c.shadowColor="rgba(5,9,18,.9)"; c.shadowBlur=5;
    pmText(o.label,x,y-(ex?fs*.4:0),fs,"#f1f5ff",800);
    if(ex) pmText(o.extra,x,y+fs*.75,fs*.78,"#f1f5ff",600);
    c.shadowBlur=0;
  }
}
function pmText(t,x,y,fs,color,w){ px.font=`${w||600} ${fs}px Figtree, system-ui, sans-serif`; px.textAlign="center"; px.textBaseline="middle"; px.fillStyle=color; px.fillText(t,x,y); }
function pmFrame(t){
  pm.raf=requestAnimationFrame(pmFrame);
  if(!pm.W||pmView().hidden||document.hidden) return;
  pm.now=t||0; pmStep();
  const g=pmGeo(), c=px, list=[...pm.nodes.values()];
  c.clearRect(0,0,g.W,g.H);
  const halo=c.createRadialGradient(g.cx,g.cy,g.S*.05,g.cx,g.cy,Math.min(g.W,g.H)*.5); // some antes da borda (sem "caixa" visível) halo.addColorStop(0,"rgba(255,158,196,.07)"); halo.addColorStop(1,"rgba(255,158,196,0)");
  c.fillStyle=halo; c.fillRect(0,0,g.W,g.H);
  if(!list.length){
    pmFace(g.cx,g.cy,pm.rMe||40,myPhoto(),"Você",330,{label:"Você",ring:2});
    pmText(state.lv.size?"Ainda ninguém combina com você nesse raio":"Estoure algumas bolhas pra achar sua turma",g.cx,g.cy+(pm.rMe||40)+24,13,"#94a1c3",500);
    return;
  }
  if(pm.mode==="rede") pmDrawNet(g,list); else pmDrawBubbles(g,list);
}
function pmDrawBubbles(g,list){
  const c=px, z=pm.open?ease(pm.z):0, wob=reduce?0:1;
  c.globalAlpha=1-z;
  list.forEach(n=>{ const h=hueOf(n.p); c.strokeStyle=`hsla(${h} 90% 75% / ${.06+.22*n.rel})`; c.lineWidth=1+n.rel*1.5;
    c.beginPath(); c.moveTo(g.cx,g.cy); c.lineTo(n.x,n.y); c.stroke(); });
  pmFace(g.cx,g.cy,pm.rMe,myPhoto(),"Você",330,{label:"Você",ring:2});
  list.forEach(n=>{ if(n===pm.open) return;
    const y=n.y+Math.sin(pm.now/900+n.seed)*2*wob, h=hueOf(n.p), hov=pm.hover&&pm.hover.id===n.id;
    pmFace(n.x,y,n.r*(hov?1.08:1),n.p.photo,initials(n.p.name),h,{label:n.p.name.split(" ")[0],extra:n.pct+"%",ring:hov?2:1.4,blur:!isLinked(n.p)});
    if(n.r<=15) pmText(n.p.name.split(" ")[0]+" · "+n.pct+"%",n.x,y+n.r+10,11,"#ecf1ff",700); // bolha pequena: nome embaixo
  });
  c.globalAlpha=1;
  if(pm.open) pmDrawOpen(g);
}
function pmDrawOpen(g){
  const c=px, n=pm.open, s=pmShell(), h=hueOf(n.p), a=ease(pm.z);
  const gr=c.createRadialGradient(s.x-s.r*.3,s.y-s.r*.35,s.r*.1,s.x,s.y,s.r);
  gr.addColorStop(0,`hsla(${h} 90% 70% / .04)`); gr.addColorStop(.85,`hsla(${h} 90% 65% / .1)`); gr.addColorStop(1,`hsla(${h} 95% 75% / .32)`);
  const im=photoOf(n.p.photo,!isLinked(n.p)); // a foto da pessoa bem clarinha no fundo da bolha dela
  if(im){ const w=im.naturalWidth||im.width, hh=im.naturalHeight||im.height, m=Math.min(w,hh); c.save(); c.beginPath(); c.arc(s.x,s.y,s.r,0,7); c.clip(); c.globalAlpha=.16; c.drawImage(im,(w-m)/2,(hh-m)/2,m,m,s.x-s.r,s.y-s.r,s.r*2,s.r*2); c.restore(); }
  c.fillStyle=gr; c.beginPath(); c.arc(s.x,s.y,s.r,0,7); c.fill(); c.strokeStyle=`hsla(${h} 95% 80% / .7)`; c.lineWidth=1.8; c.stroke();
  c.fillStyle="rgba(255,255,255,.35)"; c.beginPath(); c.ellipse(s.x-s.r*.45,s.y-s.r*.55,s.r*.16,s.r*.06,-.6,0,7); c.fill();
  c.globalAlpha=a;
  pm.inner.forEach(b=>{
    const it=byId(b.id); if(!it) return;
    const x=s.x+b.x*s.r, y=s.y+b.y*s.r, r=b.r*s.r, L=state.lv.get(b.id)||0, his=n.p.lv.get(b.id)||0, hu=it.hue, hov=pm.hover&&pm.hover.id===b.id;
    if(L){
      const q=c.createRadialGradient(x-r*.35,y-r*.4,r*.1,x,y,r); q.addColorStop(0,`hsl(${hu} 95% ${L===2?84:78}%)`); q.addColorStop(1,`hsl(${hu} 75% ${L===2?52:44}%)`);
      if(L===2&&his===2){ c.shadowColor=`hsl(${hu} 100% 70%)`; c.shadowBlur=r*.7; }
      c.fillStyle=q; c.beginPath(); c.arc(x,y,r*(hov?1.06:1),0,7); c.fill(); c.shadowBlur=0;
      c.strokeStyle=`hsl(${hu} 100% 90%)`; c.lineWidth=1.6; c.stroke();
    } else {
      // só a pessoa curte: transparente, igual à bolha que ainda não é sua no globo
      const rr=r*(hov?1.06:1), q=c.createRadialGradient(x,y,rr*.2,x,y,rr);
      q.addColorStop(0,`hsla(${hu} 90% 70% / .04)`); q.addColorStop(.8,`hsla(${hu} 90% 70% / ${hov?.26:.16})`); q.addColorStop(1,`hsla(${hu} 95% 75% / .42)`);
      c.fillStyle=q; c.beginPath(); c.arc(x,y,rr,0,7); c.fill();
      c.lineWidth=1.3; c.strokeStyle=`hsla(${hu} 95% 78% / .75)`; c.stroke();
      c.strokeStyle=`hsla(${(hu+70)%360} 95% 78% / .55)`; c.lineWidth=1.4; c.beginPath(); c.arc(x,y,rr*.9,Math.PI*.15,Math.PI*.75); c.stroke();
      c.fillStyle="rgba(255,255,255,.7)"; c.beginPath(); c.ellipse(x-rr*.4,y-rr*.45,rr*.16,rr*.09,-.7,0,7); c.fill();
    }
    if(r>12){
      const fs=clamp(r*.3,9,13), nm=it.name+(his===2?" ♥":"");
      c.font=`700 ${fs}px Figtree, system-ui, sans-serif`;
      const lines=c.measureText(nm).width<=r*1.8||!nm.includes(" ")?[nm]:[nm.split(" ").slice(0,Math.ceil(nm.split(" ").length/2)).join(" "),nm.split(" ").slice(Math.ceil(nm.split(" ").length/2)).join(" ")];
      lines.forEach((l,k)=>pmText(l,x,y+(k-(lines.length-1)/2)*fs*1.1,fs,L?"#10172a":"#c9d3ee",700));
    }
  });
  c.globalAlpha=1;
  pmFace(s.x,s.y-s.r,clamp(s.r*.13,16,28),n.p.photo,initials(n.p.name),h,{photoA:1,ring:2,blur:!isLinked(n.p)}); // o rosto da pessoa em cima da bolha dela
}
function pmDrawNet(g,list){
  let act=pm.sel||pm.hover; const c=px, me={x:g.cx,y:g.cy};
  if(act&&!(act.kind==="p"&&pm.nodes.has(act.id)||act.kind==="i"&&pm.ints.has(act.id))) act=null; // saiu da lista
  const on=(pid,iid)=>!act||(act.kind==="p"?act.id===pid&&(iid==null||pm.nodes.get(pid).shared.includes(iid)):act.id===iid); // essa linha está destacada?
  const meOn=iid=>!act||(act.kind==="i"?act.id===iid:pm.nodes.get(act.id).shared.includes(iid));
  // linhas: você → bolha em comum → pessoa
  pm.ints.forEach(it=>{ const i=byId(it.id), lit=meOn(it.id);
    c.strokeStyle=`hsla(${i.hue} 90% 72% / ${lit?(act?.8:.32):.05})`; c.lineWidth=state.lv.get(it.id)===2?2.4:1.3;
    c.beginPath(); c.moveTo(me.x,me.y); c.lineTo(it.x,it.y); c.stroke(); });
  const links=[];
  list.forEach(n=>n.shared.forEach(id=>{ const it=pm.ints.get(id); if(it) links.push({n,it,id,love:both2(n.p,id)}); }));
  links.forEach(l=>{ const i=byId(l.id), lit=on(l.n.id,l.id);
    c.strokeStyle=l.love?`hsla(335 100% 78% / ${lit?(act?.9:.4):.05})`:`hsla(${i.hue} 90% 72% / ${lit?(act?.75:.22):.04})`;
    c.lineWidth=l.love?2.2:1.1; c.beginPath(); c.moveTo(l.it.x,l.it.y); c.lineTo(l.n.x,l.n.y); c.stroke(); });
  // sinais andando pelas linhas, como numa rede neural: de você até a pessoa, passando pela bolha
  if(!reduce) links.forEach(l=>{ const lit=on(l.n.id,l.id); if(act&&!lit) return;
    const t=(pm.now/2200+l.n.seed+l.it.a)%1, A=t<.5?me:l.it, B=t<.5?l.it:l.n, u=t<.5?t*2:t*2-1;
    c.fillStyle=l.love?"rgba(255,170,205,.95)":`hsla(${byId(l.id).hue} 100% 85% / ${act?.95:.6})`;
    c.beginPath(); c.arc(lerp(A.x,B.x,u),lerp(A.y,B.y,u),act?2.6:1.8,0,7); c.fill(); });
  // bolhas em comum
  pm.ints.forEach(it=>{ const i=byId(it.id), lit=meOn(it.id)||(act&&act.kind==="i"&&act.id===it.id);
    c.globalAlpha=lit?1:.25;
    const q=c.createRadialGradient(it.x-it.r*.3,it.y-it.r*.35,it.r*.1,it.x,it.y,it.r); q.addColorStop(0,`hsl(${i.hue} 95% 82%)`); q.addColorStop(1,`hsl(${i.hue} 75% 50%)`);
    c.fillStyle=q; c.beginPath(); c.arc(it.x,it.y,it.r,0,7); c.fill();
    if(act&&act.kind==="i"&&act.id===it.id){ c.strokeStyle="#fff"; c.lineWidth=2; c.beginPath(); c.arc(it.x,it.y,it.r+4,0,7); c.stroke(); }
    // nome pra fora do anel, deitado
    const lx=it.x+Math.cos(it.a)*(it.r+8), ly=it.y+Math.sin(it.a)*(it.r+8);
    c.font=`600 11px Figtree, system-ui, sans-serif`; c.textBaseline="middle"; c.textAlign=Math.abs(Math.cos(it.a))<.3?"center":Math.cos(it.a)>0?"left":"right";
    c.fillStyle=`hsl(${i.hue} 90% 84%)`; c.fillText(i.name+(it.c>1?" · "+it.c:""),lx,ly+(Math.abs(Math.cos(it.a))<.3?Math.sign(Math.sin(it.a))*4:0));
    c.globalAlpha=1; });
  pmFace(me.x,me.y,pm.rMe*.8,myPhoto(),"Você",330,{label:"Você",ring:2});
  // pessoas
  list.forEach(n=>{ const lit=!act||(act.kind==="p"?act.id===n.id:n.shared.includes(act.id)), h=hueOf(n.p), sel=act&&act.kind==="p"&&act.id===n.id;
    c.globalAlpha=lit?1:.25;
    pmFace(n.x,n.y,n.r*(sel?1.15:1),n.p.photo,initials(n.p.name),h,{photoA:.85,ring:sel?2.5:1.4,blur:!isLinked(n.p)});
    const ox=Math.cos(n.na), oy=Math.sin(n.na), ty=n.y+(oy>-.3?n.r+10:-n.r-10);
    pmText(n.p.name.split(" ")[0]+" · "+n.pct+"%",n.x+ox*4,ty,11.5,"#ecf1ff",700);
    c.globalAlpha=1; });
}

document.getElementById("filter-toggle").innerHTML=FILTERS[0].ic;
document.getElementById("filter-toggle").onclick=()=>setFilter(FILTERS[(FILTERS.findIndex(x=>x.k===bubbleFilter)+1)%FILTERS.length].k);
resize(); rebuild(); renderAll(); welcome(); requestAnimationFrame(frame);
try{ const v=sessionStorage.getItem("estoura-aba");
  if(v==="chat"){ state.wantChat=true; setTimeout(()=>{ state.wantChat=false; },15000); } // a aba Chat só aparece quando as conversas chegarem (renderChats)
  else if(v && v!=="bolhas" && document.getElementById("view-"+v)) setView(v); }catch(_){}
try{ localStorage.removeItem("estoura-view"); }catch(_){} // a visão espalhada não existe mais
try{ const f=localStorage.getItem("estoura-filter"); if(f && f!=="all" && FILTERS.some(x=>x.k===f)) setFilter(f,true); }catch(_){} // lembra o último filtro
