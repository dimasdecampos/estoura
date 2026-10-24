// O globo 3D de bolhas: desenho, rodízio, entrar/sair de bolha, toque, mover/remover, puxar pra atualizar.
/* ================= GLOBO 3D ================= */
const cv=document.getElementById("globe"), ctx=cv.getContext("2d");
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const AUTO=reduce?0:0.0025, AUTO_O=reduce?0:0.0016;
const SPH=.74; // tamanho da esfera em relação à área (as bolhas mantêm o tamanho; só ficam mais juntas)
let W=0,H=0,R=100,DPR=1, rotY=0.6, rotX=-0.25, vY=AUTO, vX=0, orbit=0, vO=AUTO_O;
let fY=0.6, fX=-0.25, fvY=AUTO, fvX=0; // giro da esfera de dentro de uma bolha com muitas sub-bolhas
let gS=1, pts=[], fx=[], items=[], target=null, anim=null, fade=1, now=0;
const ADD={type:"add",id:"__add"};
const TREND=new Set();
const lerp=(a,b,t)=>a+(b-a)*t, ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
const shellR=()=>Math.min(W*.47,H*.44), shellC=()=>({x:W/2,y:H/2-6});

// distribui os itens numa esfera (espiral de Fibonacci)
function fib(list){ const n=list.length, g=Math.PI*(3-Math.sqrt(5));
  list.forEach((it,k)=>{ const y=1-(k+.5)/n*2, r=Math.sqrt(1-y*y), t=k*g; it.p=[Math.cos(t)*r,y,Math.sin(t)*r]; }); }
// muitas sub-bolhas: dentro da bolha elas giram numa esfera, igual ao globo principal
const SPHERE_MIN=7;
const sphere=()=>!!state.focus && items.length>SPHERE_MIN;
/* ---------- visão espalhada ("explodida") ----------
   Mostra TODAS as bolhas, de todos os níveis, soltas na tela ao mesmo tempo, sem agrupar.
   As bolhas da mesma família ficam perto umas das outras (e têm a mesma cor).
   Arrastar move a tela; pinça ou rodinha dão zoom; toque estoura; segurar e arrastar remove das suas. */
const spread={on:false,k:1,px:0,py:0,tk:1,tpx:0,tpy:0,auto:true,mouse:null,poke:null};
const spreadR=it=>(it.type==="event" ? 20+evCount(it)*2 : 20+16*Math.sqrt(count(it)/peak(applyF(INTERESTS))))*BIG();
function layoutSpread(){
  const ar=Math.max(.6,Math.min(1.8,W/Math.max(1,H)));
  items.forEach((it,k)=>{
    if(!it.sp){ // bolha nova: nasce perto da bolha-mãe (ou do centro)
      const par=it.parent?byId(it.parent):null, c=par&&par.sp?par.sp:{tx:0,ty:0}, a=k*2.399963, rr=26+Math.sqrt(k)*30;
      it.sp={x:c.tx,y:c.ty,r:0,tx:c.tx+Math.cos(a)*rr*ar,ty:c.ty+Math.sin(a)*rr,tr:0,
        ox:0,oy:0,vx:0,vy:0,ph:Math.random()*6.283,hs:1}; // ox/oy: balanço natural + empurrões; hs: crescer sob o mouse
    }
    it.sp.tr=spreadR(it);
  });
  const P=items.map(it=>it.sp);
  for(let iter=0;iter<240;iter++){
    for(let i=0;i<P.length;i++){ const a=P[i];
      for(let j=i+1;j<P.length;j++){ const b=P[j];
        let dx=b.tx-a.tx, dy=b.ty-a.ty; const d=Math.hypot(dx,dy)||.01, min=a.tr+b.tr+12;
        if(d<min){ const push=(min-d)*.25; dx/=d; dy/=d; a.tx-=dx*push; a.ty-=dy*push; b.tx+=dx*push; b.ty+=dy*push; } } }
    items.forEach(it=>{ const s=it.sp;
      s.tx*= ar>=1?.9985:.9945; s.ty*= ar>=1?.9945:.9985; // puxa de leve pro centro, mais na menor dimensão da tela
      const par=it.parent?byId(it.parent):null;
      if(par&&par.sp){ const dx=par.sp.tx-s.tx, dy=par.sp.ty-s.ty, d=Math.hypot(dx,dy)||.01, rest=s.tr+par.sp.tr+16;
        if(d>rest){ const f=(d-rest)*.015; s.tx+=dx/d*f; s.ty+=dy/d*f; } } // a família fica junta
    });
  }
  // passada final só de afastamento, pra nenhuma bolha ficar em cima da outra
  for(let iter=0;iter<120;iter++){ let hit=false;
    for(let i=0;i<P.length;i++) for(let j=i+1;j<P.length;j++){ const a=P[i], b=P[j];
      let dx=b.tx-a.tx, dy=b.ty-a.ty; const d=Math.hypot(dx,dy)||.01, min=a.tr+b.tr+10;
      if(d<min){ hit=true; const push=(min-d)*.5; dx/=d; dy/=d; a.tx-=dx*push; a.ty-=dy*push; b.tx+=dx*push; b.ty+=dy*push; } }
    if(!hit) break; }
}
function fitSpread(){ // enquadra todas as bolhas na tela
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  items.forEach(it=>{ const s=it.sp; x0=Math.min(x0,s.tx-s.tr); x1=Math.max(x1,s.tx+s.tr); y0=Math.min(y0,s.ty-s.tr); y1=Math.max(y1,s.ty+s.tr); });
  const bw=Math.max(1,x1-x0), bh=Math.max(1,y1-y0);
  spread.tk=Math.max(.2,Math.min(1.5,Math.min((W-28)/bw,(H-28)/bh)));
  spread.tpx=W/2-(x0+x1)/2*spread.tk; spread.tpy=H/2-(y0+y1)/2*spread.tk;
}
function initSpread(){ // explode a partir de onde as bolhas estão no globo agora
  const from=new Map(pts.map(p=>[p.it.id,p]));
  items=[...applyF(INTERESTS),...evF()];
  items.forEach(it=>{ it.sp=null; });
  layoutSpread();
  items.forEach(it=>{
    let p=from.get(it.id), a=it;
    while(!p && a.parent){ a=byId(a.parent); p=a&&from.get(a.id); } // sub-bolha nasce de dentro da bolha-mãe
    it.sp.x=p?p.sx-W/2:0; it.sp.y=p?p.sy-H/2:0; it.sp.r=p&&it===a?p.r:0;
  });
  spread.k=1; spread.px=W/2; spread.py=H/2; spread.auto=true; fitSpread();
}
function stepSpread(){
  const e=reduce?1:.16;
  items.forEach(it=>{ const s=it.sp; if(!s) return; s.x+=(s.tx-s.x)*e; s.y+=(s.ty-s.y)*e; s.r+=(s.tr-s.r)*e; });
  spread.k+=(spread.tk-spread.k)*e; spread.px+=(spread.tpx-spread.px)*e; spread.py+=(spread.tpy-spread.py)*e;
  if(reduce) return; // quem pediu menos movimento no sistema fica com as bolhas paradas

  // bolhas "vivas": balançam sozinhas, desviam do mouse, empurram umas às outras
  const k=spread.k, t=now, m=spread.mouse, poke=spread.poke; spread.poke=null;
  const mw=m?{x:(m.x-spread.px)/k,y:(m.y-spread.py)/k}:null, pw=poke?{x:(poke.x-spread.px)/k,y:(poke.y-spread.py)/k}:null;
  const reach=110/k, pokeReach=170/k; // alcance do mouse e do toque, em unidades do mundo (≈ pixels da tela)
  items.forEach(it=>{
    const s=it.sp; if(!s) return;
    // balanço natural: cada bolha tem o seu ritmo
    const dx=Math.sin(t/1700+s.ph)*4+Math.sin(t/731+s.ph*2.1)*1.2, dy=Math.cos(t/2100+s.ph*1.3)*4+Math.cos(t/907+s.ph*.7)*1.2;
    s.vx+=(dx-s.ox)*.035; s.vy+=(dy-s.oy)*.035; // mola: volta pro balanço
    let grow=1;
    if(mw){ const ax=s.tx+s.ox-mw.x, ay=s.ty+s.oy-mw.y, d=Math.hypot(ax,ay)||.01;
      if(d<reach+s.tr){ // as vizinhas desviam; a bolha apontada fica no lugar (senão fugiria do clique)
        const yielding=Math.max(0,Math.min(1,(d-s.tr*.6)/(s.tr*.8)));
        const f=Math.pow(1-Math.min(1,d/(reach+s.tr)),2)*1.5*yielding; s.vx+=ax/d*f; s.vy+=ay/d*f; }
      if(d<s.tr) grow=1.1; } // a bolha sob o mouse cresce um pouco
    if(pw){ const ax=s.tx+s.ox-pw.x, ay=s.ty+s.oy-pw.y, d=Math.hypot(ax,ay)||.01;
      if(d<pokeReach && d>s.tr*.5){ const f=(1-d/pokeReach)*9; s.vx+=ax/d*f; s.vy+=ay/d*f; } } // toque = onda que empurra quem está perto
    s.vx*=.86; s.vy*=.86; s.ox+=s.vx; s.oy+=s.vy;
    s.hs+=(grow-s.hs)*.18;
  });
  // quem foi empurrado encosta nas vizinhas e empurra de volta (sem ficar uma em cima da outra)
  for(let i=0;i<items.length;i++){ const a=items[i].sp; if(!a) continue;
    for(let j=i+1;j<items.length;j++){ const b=items[j].sp; if(!b) continue;
      let dx=(b.tx+b.ox)-(a.tx+a.ox), dy=(b.ty+b.oy)-(a.ty+a.oy); const d=Math.hypot(dx,dy)||.01, min=a.r+b.r+3;
      if(d<min){ const push=(min-d)*.5; dx/=d; dy/=d; a.ox-=dx*push; a.oy-=dy*push; b.ox+=dx*push; b.oy+=dy*push; a.vx-=dx*push*.2; a.vy-=dy*push*.2; b.vx+=dx*push*.2; b.vy+=dy*push*.2; } } }
}
function setSpread(on){
  if(anim || on===spread.on) return;
  if(on){ state.focus=null; initSpread(); spread.on=true; }
  else { spread.on=false; items.forEach(it=>{ it.sp=null; }); rebuild(true); }
  renderFocus(); renderTrend();
}

const HEART='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.400-7-10a4 4 0 0 1 7-2.600A4 4 0 0 1 19 10c0 5.600-7 10-7 10z"';
const FILTERS=[
  {k:"all",t:"Ver tudo",ic:HEART+' stroke-dasharray="2.500 2.500"/></svg>'},
  {k:"liked",t:"Só as que curti",ic:HEART+' fill="currentColor"/></svg>'},
  {k:"unliked",t:"Só as que não curti",ic:HEART+'/></svg>'}];
let bubbleFilter="all";
const applyF=list=>bubbleFilter==="all"?list:list.filter(it=>(bubbleFilter==="liked")===state.lv.has(it.id));
const evF=()=>bubbleFilter==="all"?visibleEvents().filter(e=>!floatIds.has(e.id) && !(typeof floatPrefs!=="undefined" && floatPrefs.hidden.includes(e.id))):[]; // os flutuantes e os que você excluiu ficam fora do globo
function setFilter(k,quiet){
  bubbleFilter=k; const f=FILTERS.find(x=>x.k===k), b=document.getElementById("filter-toggle");
  b.innerHTML=f.ic; b.title=f.t; b.setAttribute("aria-label","Filtro: "+f.t); b.classList.toggle("on",k!=="all");
  if(spread.on){ // reagrupa só as bolhas exibidas: refaz o arranjo a partir de onde elas estão agora
    const old=new Map(items.filter(i=>i.sp).map(i=>[i.id,{x:i.sp.x,y:i.sp.y,r:i.sp.r}])); items.forEach(i=>{ i.sp=null; });
    spread.auto=true; rebuild(true);
    items.forEach(i=>{ const o=old.get(i.id); if(o&&i.sp){ i.sp.x=o.x; i.sp.y=o.y; i.sp.r=o.r; } });
  } else rebuild(true);
  if(!quiet) toast(f.t);
  try{ localStorage.setItem("estoura-filter",k); }catch(_){}
}
/* ---------- rodízio: o globo mostra um número limitado de bolhas e vai trocando ----------
   Só as em alta, as em destaque e as que você acabou de curtir ficam fixas. Todas as outras, curtidas ou não, são sorteadas
   (as curtidas e as populares têm mais chance) e, de tempos em tempos, uma sai e outra entra no lugar dela.
   Uma parte das vagas é sempre das que você ainda não curtiu, pra novidade nunca ficar de fora quando você curte muitas.
   A visão espalhada mostra todas. */
const MAXG=()=>W&&W<640?22:30;
const NEWSHARE=.4; // fatia mínima das vagas reservada pra bolhas que você ainda não curtiu
const newMin=()=>Math.ceil(MAXG()*NEWSHARE);
let shown=new Set(); // bolhas sorteadas que estão no globo agora
const liked=it=>state.lv.has(it.id);
const pinned=it=>TREND.has(it.id)||(it.hl||0)>performance.now()||(it.lk||0)>performance.now(); // lk: curtiu agora há pouco
function pickWeighted(list){
  const w=list.map(i=>(1+Math.sqrt(count(i)))*(liked(i)?2:1)); let r=Math.random()*w.reduce((a,b)=>a+b,0);
  for(let k=0;k<list.length;k++){ r-=w[k]; if(r<=0) return list[k]; }
  return list[list.length-1];
}
function sample(pool){
  const max=MAXG();
  if(pool.length<=max){ shown=new Set(pool.map(i=>i.id)); return pool; }
  const out=pool.filter(pinned).slice(0,max), rest=pool.filter(i=>!out.includes(i));
  const take=i=>{ out.push(rest.splice(rest.indexOf(i),1)[0]); };
  // 1º: as vagas reservadas pra novidade (as que já estavam no globo continuam, depois sorteia)
  let need=Math.min(newMin(),pool.filter(i=>!liked(i)).length)-out.filter(i=>!liked(i)).length;
  for(const i of rest.slice()) if(need>0 && out.length<max && !liked(i) && shown.has(i.id)){ take(i); need--; }
  while(need>0 && out.length<max){ const c=rest.filter(i=>!liked(i)); if(!c.length) break; take(pickWeighted(c)); need--; }
  // 2º: o resto das vagas
  for(const i of rest.slice()) if(out.length<max && shown.has(i.id)) take(i);
  while(out.length<max && rest.length) take(pickWeighted(rest));
  shown=new Set(out.map(i=>i.id));
  return out;
}
const rootPool=()=>applyF(INTERESTS.filter(i=>!i.parent));
const rotating=()=>!state.focus && !spread.on;
// troca uma bolha do globo por outra que ainda não apareceu: a de saída encolhe e a nova cresce no lugar dela
function rotateOne(){
  if(!rotating() || anim || drag || hoverPause || grab || held() || document.hidden) return;
  const pool=rootPool(), out=pool.filter(i=>!shown.has(i.id));
  let leave=items.filter(i=>!i.type && !pinned(i) && !i.out && !i.next);
  if(!out.length || !leave.length) return;
  // no limite das vagas de novidade: quem sai das novas só é trocada por outra nova; senão sai uma das curtidas
  const newOn=items.filter(i=>!i.type && !i.out && !liked(i)).length, tight=newOn<=newMin();
  if(tight && !out.some(i=>!liked(i))) leave=leave.filter(i=>liked(i));
  if(!leave.length) return;
  const v=leave[Math.floor(Math.random()*leave.length)];
  const n=pickWeighted(tight && !liked(v) ? out.filter(i=>!liked(i)) : out);
  v.out=true; v.next=n; v.outL=state.lv.get(v.id)||0; shown.add(n.id);
}
setInterval(rotateOne, 4500);
// a bolha de saída já sumiu: a nova entra no mesmo lugar
function swapOut(){
  for(let k=items.length-1;k>=0;k--){ const v=items[k];
    if(!v.out) continue;
    if(pinned(v) || (state.lv.get(v.id)||0)!==v.outL || !rotating()){ v.out=false; if(v.next){ shown.delete(v.next.id); v.next=null; } continue; } // curtiu enquanto saía: fica
    if(v.dr>1) continue;
    const n=v.next; v.out=false; v.next=null; shown.delete(v.id);
    if(!n || items.includes(n) || n.parent || !byId(n.id)){ items.splice(k,1); continue; } // a nova sumiu nesse meio-tempo
    n.p=v.p; n.dr=0; n.out=false; items[k]=n;
  }
}
// bolha principal que você acabou de estourar e não estava no globo: entra no lugar de uma sorteada
function bringIn(it){
  if(!rotating() || it.parent || items.includes(it)) return;
  let leave=items.filter(i=>!i.type && !pinned(i));
  if(items.filter(i=>!i.type && !liked(i)).length<=newMin() && leave.some(liked)) leave=leave.filter(liked); // não tira vaga de novidade
  if(!leave.length){ rebuild(); return; }
  const v=leave[Math.floor(Math.random()*leave.length)], k=items.indexOf(v);
  shown.delete(v.id); shown.add(it.id); it.p=v.p; it.dr=0; it.out=false; items[k]=it;
}
function rebuild(fresh){
  items.forEach(i=>{ i.out=false; i.next=null; });
  if(spread.on){ items=[...applyF(INTERESTS),...evF()]; layoutSpread(); if(spread.auto) fitSpread(); return; }
  if(state.focus){ items=[...applyF(kids(state.focus)),ADD]; if(items.length>SPHERE_MIN) fib(items); }
  else { items=[...sample(rootPool()),...evF()]; fib(items); }
  items.forEach(it=>{ if(fresh||it.dr==null) it.dr=reduce?targetR(it):0; });
}
function resize(){
  const box=cv.parentElement.getBoundingClientRect(); if(!box.width) return;
  DPR=Math.min(2,window.devicePixelRatio||1); W=box.width; H=box.height;
  cv.width=W*DPR; cv.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0);
  R=Math.min(W,H)*(W<640?0.46:0.36); // celular: mais perto (zoom)
}
new ResizeObserver(resize).observe(cv.parentElement);
// Tamanho relativo: um piso confortável (toda bolha dá pra tocar) que cresce em proporção
// à bolha mais popular do grupo. Com poucas pessoas as bolhas continuam grandes.
const peak = list => Math.max(1,...list.map(count));
const BIG=()=>bubbleFilter==="unliked"?1.25:1; // só as que não curti: um pouco maiores
const targetR=it=>it.out?0:baseR(it)*(it.type==="add"?1:BIG());
function baseR(it){
  if(state.focus){ const S=shellR(), sp=sphere();
    if(it.type==="add") return Math.max(S*.14,sp?22:26);
    const rel=Math.sqrt(count(it)/peak(applyF(kids(state.focus))));
    const fit=sp?Math.max(.42,Math.sqrt((SPHERE_MIN-1)/(items.length-1))):1; // quanto mais sub-bolhas, menores
    return Math.min(S*.3,(S/115)*(19+15*rel))*fit; }
  // quanto mais bolhas no globo, um pouco menores (senão se amontoam quando várias já têm gente)
  const k=R/150*Math.sqrt(16/Math.max(16,items.length));
  if(it.type==="event") return k*(13+evCount(it)*3.2);
  const rel=Math.sqrt(count(it)/peak(applyF(INTERESTS.filter(i=>!i.parent))));
  return k*(23+17*rel);
}

function project(){
  if(state.focus && sphere()){ // esfera dentro da bolha: mesma animação do globo principal
    const S=shellR(), c=shellC(), Rin=S*.64, D=Rin*3.2;
    const cy=Math.cos(fY),sy=Math.sin(fY),cx=Math.cos(fX),sx=Math.sin(fX);
    pts=items.map(it=>{
      const [x,y,z]=it.p, x1=x*cy+z*sy, z1=-x*sy+z*cy, y2=y*cx-z1*sx, z2=y*sx+z1*cx, s=D/(D-z2*Rin);
      it.dr+=(targetR(it)-it.dr)*0.12;
      return {it,sx:c.x+x1*Rin*s,sy:c.y+y2*Rin*s,r:Math.max(0,it.dr*s),z:z2};
    }).sort((a,b)=>a.z-b.z);
    return;
  }
  if(state.focus){
    const S=shellR(), c=shellC(), n=items.length, ring=S*.62;
    pts=items.map((it,k)=>{ const a=orbit+k/n*Math.PI*2-Math.PI/2; it.dr+=(targetR(it)-it.dr)*.12;
      return {it,sx:c.x+Math.cos(a)*ring,sy:c.y+Math.sin(a)*ring*.92,r:Math.max(0,it.dr),z:1}; });
    return;
  }
  swapOut();
  // poucas bolhas (filtro): o globo encolhe junto, pra elas não ficarem espaçadas demais
  const gT=Math.max(.42,Math.min(1,Math.sqrt(items.length/16))); gS+=(gT-gS)*.12; const RG=R*SPH*gS;
  const cy=Math.cos(rotY),sy=Math.sin(rotY),cx=Math.cos(rotX),sx=Math.sin(rotX), D=RG*3.2;
  pts=items.map(it=>{
    const [x,y,z]=it.p, x1=x*cy+z*sy, z1=-x*sy+z*cy, y2=y*cx-z1*sx, z2=y*sx+z1*cx, s=D/(D-z2*RG);
    it.dr+=(targetR(it)-it.dr)*0.12;
    return {it,sx:W/2+x1*RG*s,sy:H/2+y2*RG*s,r:Math.max(0,it.dr*s),z:z2};
  }).sort((a,b)=>a.z-b.z);
  // bolha com outra na frente cobrindo o meio dela: não mostra o nome (senão os dois nomes se misturam)
  pts.forEach((p,i)=>{ p.cov=false; for(let j=i+1;j<pts.length;j++){ const q=pts[j]; if(Math.hypot(q.sx-p.sx,q.sy-p.sy)<q.r*.8){ p.cov=true; break; } } });
}

function label(lines,sx,sy,fs,color,extra){
  ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillStyle=color;
  const ty=sy-(lines.length-1)*fs*.55-(extra?fs*.35:0);
  lines.forEach((l,k)=>ctx.fillText(l,sx,ty+k*fs*1.1));
  if(extra){ ctx.font=`500 ${fs*.74}px Figtree, system-ui, sans-serif`; ctx.globalAlpha*=.85; ctx.fillText(extra,sx,ty+lines.length*fs*1.1); }
}
// quebra o nome em linhas que cabem dentro da bolha: junta palavras até encher a linha e passa o resto pra baixo.
// Palavra maior que a bolha: diminui um pouco a letra e, se ainda não couber, parte a palavra com hífen.
// Usa a fonte atual do canvas (peso e família); devolve {lines, fs} com o tamanho de letra que coube.
function fitText(name,r,fs0,weight=700){
  const maxW=r*1.68, fam="Figtree, system-ui, sans-serif", minFs=Math.max(8,fs0*.66);
  const wrap=()=>{ const out=[]; let cur="";
    for(const w of name.split(" ")){ const t=cur?cur+" "+w:w;
      if(!cur||ctx.measureText(t).width<=maxW) cur=t; else { out.push(cur); cur=w; } }
    if(cur) out.push(cur); return out; };
  for(let fs=fs0;fs>=minFs-.01;fs-=.5){
    ctx.font=weight+" "+fs+"px "+fam;
    const lines=wrap();
    if(lines.length<=3 && lines.every(l=>ctx.measureText(l).width<=maxW)) return {lines,fs};
  }
  // ainda não coube: parte as palavras compridas com hífen, na letra mínima
  ctx.font=weight+" "+minFs+"px "+fam;
  const lines=[];
  wrap().forEach(l=>{
    while(ctx.measureText(l).width>maxW && l.length>3){ let n=l.length-1; while(n>2 && ctx.measureText(l.slice(0,n)+"-").width>maxW) n--; lines.push(l.slice(0,n)+"-"); l=l.slice(n); }
    lines.push(l); });
  return {lines,fs:minFs};
}
function split(name,r){ return fitText(name,r,12).lines; }

function drawBubble({it,sx,sy,r,z,cov}){
  if(r<1) return;
  const d=(z+1)/2, showLabel=((state.focus&&!sphere())||z>-.35)&&!cov;
  ctx.globalAlpha=(.28+.72*d)*fade;
  if(it.type==="add"){
    ctx.setLineDash([4,4]); ctx.lineWidth=1.5; ctx.strokeStyle="rgba(236,241,255,.6)";
    ctx.beginPath(); ctx.arc(sx,sy,r,0,7); ctx.stroke(); ctx.setLineDash([]);
    ctx.font=`600 ${Math.max(10,r*.32)}px Figtree, system-ui, sans-serif`;
    label(["+","criar"],sx,sy,Math.max(11,r*.34),"rgba(236,241,255,.85)");
    ctx.globalAlpha=1; return;
  }
  const h=it.hue ?? byId(it.interest).hue;
  if(it.type==="event"){
    const me=state.going.has(it.id);
    ctx.fillStyle=`hsla(${h} 80% 60% / ${me?.35:.14})`; ctx.beginPath(); ctx.arc(sx,sy,r,0,7); ctx.fill();
    ctx.setLineDash([5,4]); ctx.lineDashOffset=-now/60; ctx.lineWidth=1.8; ctx.strokeStyle=`hsl(${h} 95% 80%)`; ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle="#ffd28a"; ctx.beginPath(); ctx.arc(sx+r*.68,sy-r*.68,Math.max(3,r*.13),0,7); ctx.fill();
    if(r>14 && showLabel){ const fs=Math.max(9,Math.min(13,r*.27)); ctx.font=`700 ${fs}px Figtree, system-ui, sans-serif`;
      const fe=fitText(it.short,r,fs); label(fe.lines,sx,sy,fe.fs,"#f1f5ff",r>22?evShortDay(it):null); }
    ctx.globalAlpha=1; return;
  }
  const L=state.lv.get(it.id)||0;
  if((it.hl||0)>now){ // em destaque (buscada ou criada): brilho em volta
    const gl=ctx.createRadialGradient(sx,sy,r*.9,sx,sy,r*1.7); gl.addColorStop(0,`hsla(${h} 100% 75% / .4)`); gl.addColorStop(1,`hsla(${h} 100% 75% / 0)`);
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(sx,sy,r*1.7,0,7); ctx.fill();
  }
  if((TREND.has(it.id) && !state.focus) || (it.hl||0)>performance.now()){
    const pulse=(Math.sin(now/380+h)+1)/2;
    ctx.strokeStyle=`hsla(${h} 100% 80% / ${.15+.4*pulse})`; ctx.lineWidth=2+3*pulse;
    ctx.beginPath(); ctx.arc(sx,sy,r*(1.1+.12*pulse),0,7); ctx.stroke();
  }
  if(L){
    const g=ctx.createRadialGradient(sx-r*.35,sy-r*.4,r*.1,sx,sy,r);
    g.addColorStop(0,`hsl(${h} 95% ${L===2?84:78}%)`); g.addColorStop(1,`hsl(${h} 75% ${L===2?52:44}%)`);
    if(L===2){ ctx.shadowColor=`hsl(${h} 100% 70%)`; ctx.shadowBlur=r*.6; }
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(sx,sy,r,0,7); ctx.fill(); ctx.shadowBlur=0;
    ctx.strokeStyle=`hsl(${h} 100% 90%)`; ctx.lineWidth=2; ctx.stroke();
    if(L===2){ ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(sx,sy,r+5,0,7); ctx.stroke(); }
  } else {
    const g=ctx.createRadialGradient(sx,sy,r*.2,sx,sy,r);
    g.addColorStop(0,`hsla(${h} 90% 70% / .04)`); g.addColorStop(.8,`hsla(${h} 90% 70% / .16)`); g.addColorStop(1,`hsla(${h} 95% 75% / .42)`);
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(sx,sy,r,0,7); ctx.fill();
    ctx.lineWidth=1.3; ctx.strokeStyle=`hsla(${h} 95% 78% / .75)`; ctx.stroke();
    ctx.strokeStyle=`hsla(${(h+70)%360} 95% 78% / .55)`; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.arc(sx,sy,r*.9,Math.PI*.15,Math.PI*.75); ctx.stroke();
  }
  // tem sub-bolhas: anel de pontinhos
  const kn=KIDN.get(it.id)||0;
  if(kn && r>10){ // pontinhos = tem sub-bolhas (em qualquer nível)
    const n=Math.min(kn,9), off=r*.76, st=Math.min(.36,2.2/Math.max(1,n-1)), dr=Math.max(2.4,r*.05); // dentro da bolha, embaixo do nome
    ctx.fillStyle="rgba(255,255,255,.7)";
    for(let k=0;k<n;k++){ const t=Math.PI/2+(k-(n-1)/2)*st; ctx.beginPath(); ctx.arc(sx+Math.cos(t)*off,sy+Math.sin(t)*off,dr,0,7); ctx.fill(); }
  }
  ctx.fillStyle="rgba(255,255,255,.75)"; ctx.beginPath(); ctx.ellipse(sx-r*.4,sy-r*.45,r*.18,r*.1,-.7,0,7); ctx.fill();
  if(r>15 && showLabel){
    const fit=fitText(it.name,r,Math.max(9,Math.min(state.focus?14:15,r*.3))), lines=fit.lines, fs=fit.fs;
    const extra=r>24&&count(it)>0?count(it).toLocaleString("pt-BR"):null; // sem ninguém, não mostra o 0
    const hc=HEARTN.get(it.id)||0; // sub-bolhas com coração
    if(L===2||hc){ // já deu coração: coraçãozinho preto centralizado acima do nome, do tamanho da fonte; com a quantidade das sub-bolhas ao lado
      const top=sy-(lines.length-1)*fs*.55-(extra?fs*.35:0)-fs*1.1, hs=fs*.34;
      let hx=sx, tw=0; if(hc){ ctx.font=`700 ${fs*.68}px Figtree, system-ui, sans-serif`; tw=ctx.measureText(hc).width+hs*1.25+fs*.08; hx=sx-tw/2; }
      ctx.fillStyle="#10172a"; heartPath(hx,top,hs); ctx.fill();
      if(hc){ ctx.textAlign="left"; ctx.textBaseline="middle"; ctx.fillText(hc,hx+hs*1.25+fs*.08,top); }
      ctx.font=`700 ${fs}px Figtree, system-ui, sans-serif`; }
    label(lines,sx,sy,fs,L?"#10172a":"#f1f5ff",extra);
  }
  if(L && showLabel && heartable({it,r,z})){ // só o coração, dentro da bolha, no topo à direita
    const k=heartSpot({sx,sy,r}), on=L===2; ctx.globalAlpha*=Math.max(0,Math.min(1,(it.hu-performance.now())/400));
    heartPath(k.x,k.y,k.hr*.85); ctx.lineJoin="round";
    if(on){ ctx.lineWidth=1.2; ctx.strokeStyle="#fff"; ctx.stroke(); } // sem preenchimento rosa: contorno branco liso
    else { ctx.lineWidth=1.2; ctx.strokeStyle="#fff"; ctx.lineDashOffset=0; ctx.setLineDash([k.hr*.3,k.hr*.3]); ctx.stroke(); ctx.setLineDash([]); } // tracejado = ainda não é favorita
  }
  ctx.globalAlpha=1;
}

function drawShell(x,y,r,h,alpha,solid){
  if(r<1) return;
  ctx.globalAlpha=alpha;
  if(solid>0){ ctx.fillStyle=`hsla(${h} 80% 62% / ${solid})`; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill(); }
  const g=ctx.createRadialGradient(x-r*.3,y-r*.35,r*.1,x,y,r);
  g.addColorStop(0,`hsla(${h} 90% 70% / .03)`); g.addColorStop(.85,`hsla(${h} 90% 65% / .09)`); g.addColorStop(1,`hsla(${h} 95% 75% / .3)`);
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
  ctx.strokeStyle=`hsla(${h} 95% 80% / .6)`; ctx.lineWidth=1.6; ctx.stroke();
  ctx.fillStyle="rgba(255,255,255,.35)"; ctx.beginPath(); ctx.ellipse(x-r*.45,y-r*.55,r*.16,r*.06,-.6,0,7); ctx.fill();
  ctx.globalAlpha=1;
}
function drawCenter(){
  const it=byId(state.focus), c=shellC(), S=shellR(), ks=kids(it.id), on=ks.filter(k=>state.lv.has(k.id)).length, L=state.lv.get(it.id)||0;
  const fs=Math.max(18,Math.min(30,S*.15));
  ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillStyle="#f1f5ff"; ctx.font=`800 ${fs}px "Bricolage Grotesque", "Trebuchet MS", sans-serif`;
  ctx.fillText(it.name,c.x,c.y-fs*.45);
  ctx.font=`600 12.5px Figtree, system-ui, sans-serif`; ctx.fillStyle=`hsl(${it.hue} 90% 80%)`;
  ctx.fillText(`${on} de ${ks.length} estouradas${L===2?" · ♥":""}`,c.x,c.y+fs*.5);
  // outros lugares onde as pessoas guardam esta bolha (o mapa de todo mundo)
  const alt=(it.places||[]).filter(x=>(x.p||null)!==(it.parent||null)&&(!x.p||byId(x.p))).slice(0,2).map(x=>x.p?byId(x.p).name:"bolhas principais");
  if(alt.length){ ctx.fillStyle="#94a1c3"; ctx.font=`500 12px Figtree, system-ui, sans-serif`;
    ctx.fillText(`também guardada em ${alt.join(" e ")}`,c.x,c.y+fs*.5+18); }
  ctx.fillStyle="#94a1c3"; ctx.font=`500 12px Figtree, system-ui, sans-serif`;
  ctx.fillText("toque fora da bolha pra voltar",c.x,Math.min(H-10,c.y+S+16));
}

function heartPath(x,y,hs){
  ctx.beginPath(); ctx.moveTo(x,y+hs*.9); ctx.bezierCurveTo(x-hs*1.6,y-hs*.1,x-hs*.8,y-hs*1.3,x,y-hs*.45);
  ctx.bezierCurveTo(x+hs*.8,y-hs*1.3,x+hs*1.6,y-hs*.1,x,y+hs*.9);
}
function starPath(x,y,rr){
  ctx.beginPath(); for(let k=0;k<10;k++){ const a=-Math.PI/2+k*Math.PI/5, d=k%2?rr*.45:rr; ctx.lineTo(x+Math.cos(a)*d,y+Math.sin(a)*d); } ctx.closePath();
}
// coraçãozinho no topo à direita de uma bolha marcada: toque pra virar "eu amo!"
const heartSpot=p=>({x:p.sx+p.r*.42,y:p.sy-p.r*.56,hr:Math.max(11,p.r*.26)});
const heartable=p=>!p.it.type&&p.r>18&&p.z>-.35&&state.lv.get(p.it.id)===1&&(p.it.hu||0)>performance.now(); // o coração aparece ao marcar e some; volta ao encostar na bolha
const showHeart=it=>{ if(!it.type) it.hu=performance.now()+1800; };
function heartHit(x,y){ for(const p of pts){ if(!heartable(p)) continue; const h=heartSpot(p); if(Math.hypot(x-h.x,y-h.y)<h.hr+6) return p; } return null; }
function heartTap(p){
  const it=p.it, L=state.lv.get(it.id)||0;
  if(L===2){ setLevel(it,1,true); return; }
  setLevel(it,2,true);
  if(reduce) return;
  const h=heartSpot(p);
  for(let k=0;k<16;k++){ const a=-Math.PI/2+(Math.random()-.5)*3.6, v=1.6+Math.random()*3.2;
    fx.push({k:k%3?"heart":"star",x:h.x,y:h.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-1,t:0,h:k%2?345:48,s:5+Math.random()*6,g:.07}); }
}
// curtiu (big): estouro discreto. Clarão rápido, gotinhas saindo da borda e uma vibração curtinha no celular
function burst(it,big){
  const p=pts.find(q=>q.it===it); if(!p||reduce) return;
  if(big){ fx.push({flash:true,x:p.sx,y:p.sy,r:p.r,t:0,h:it.hue}); }
  fx.push({ring:true,x:p.sx,y:p.sy,r:p.r,t:0,h:it.hue});
  for(let k=0;k<(big?12:6);k++){ const a=Math.random()*7,v=1.2+Math.random()*2.4;
    fx.push({x:p.sx+Math.cos(a)*p.r*.95,y:p.sy+Math.sin(a)*p.r*.95,vx:Math.cos(a)*v,vy:Math.sin(a)*v,t:0,h:it.hue}); }
}
function drawFx(){
  fx=fx.filter(f=>f.t<1);
  fx.forEach(f=>{ f.t+=0.035;
    if(f.flash){ f.t+=.05; ctx.fillStyle=`hsla(${f.h} 100% 94% / ${.5*Math.max(0,1-f.t)})`; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(1+.22*f.t),0,7); ctx.fill(); }
    else if(f.ring){ ctx.strokeStyle=`hsla(${f.h} 95% 80% / ${1-f.t})`; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(1+f.t*.9),0,7); ctx.stroke(); }
    else if(f.k){ f.x+=f.vx; f.y+=f.vy; f.vy+=f.g; ctx.fillStyle=`hsla(${f.h} 95% ${f.k==="heart"?68:62}% / ${1-f.t})`; if(f.k==="heart") heartPath(f.x,f.y,f.s*(1+f.t*.4)); else starPath(f.x,f.y,f.s*(1+f.t*.4)); ctx.fill(); }
    else { f.x+=f.vx; f.y+=f.vy; f.vy+=.08; ctx.fillStyle=`hsla(${f.h} 95% 82% / ${1-f.t})`; ctx.beginPath(); ctx.arc(f.x,f.y,2.2,0,7); ctx.fill(); } });
}

const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
// holofote: bolha buscada ou criada fica em destaque e o globo para de girar (e de trocar bolhas) por uns segundos
let holdUntil=0;
const held=()=>performance.now()<holdUntil;
function spotlight(it,ms=4000){ const t=performance.now(); it.hl=t+8000; holdUntil=t+ms; }
function spinTo(id,quiet){
  if(state.focus){ state.focus=null; anim=null; rebuild(); renderFocus(); renderTrend(); }
  const it=items.find(i=>i.id===id); if(!it) return;
  if(spread.on){ // visão espalhada: centraliza e aproxima a bolha
    spread.tk=Math.max(spread.k,1.1); spread.tpx=W/2-it.sp.tx*spread.tk; spread.tpy=H/2-it.sp.ty*spread.tk; spread.auto=false;
    if(!quiet) toast(`${it.name}: +${it.week} pessoas esta semana`); return; }
  const [x,y,z]=it.p; target={y:Math.atan2(-x,z), x:Math.atan2(y,Math.hypot(x,z))};
  vY=0; vX=0; if(!quiet) toast(`${it.name}: +${it.week} pessoas esta semana`);
}

/* ---------- entrar e sair da bolha ---------- */
function enter(id){
  if(anim||state.focus===id) return;
  const p=pts.find(q=>q.it.id===id);
  if(reduce||!p) return doEnter(id);
  target=null; anim={dir:"in",t:0,id,h:byId(id).hue,from:{x:p.sx,y:p.sy,r:p.r}};
}
function doEnter(id){ state.focus=id; orbit=0; vO=AUTO_O; rebuild(true); renderFocus(); renderTrend(); }
function leave(){
  if(anim||!state.focus) return;
  const id=state.focus; state.focus=(byId(id)||{}).parent||null; // sobe um nível: volta pra bolha de fora (ou pro globo)
  rebuild(); items.forEach(it=>it.dr=targetR(it));
  renderFocus(); renderTrend();
  if(!reduce) anim={dir:"out",t:0,id,h:byId(id).hue};
}
// início: sai de qualquer bolha aberta e volta pro globo
function goHome(){
  if(!state.focus) return;
  state.focus=null; anim=null; rebuild(); items.forEach(it=>it.dr=targetR(it));
  renderFocus(); renderTrend();
}
document.getElementById("focus-back").onclick=leave;
document.getElementById("focus-add").onclick=openNewSub;
document.getElementById("focus-del").onclick=()=>askDelete(byId(state.focus));
document.getElementById("focus-move").onclick=openMove;
document.getElementById("focus-out").onclick=()=>{ const it=byId(state.focus); setLevel(it,0); leave(); };
document.getElementById("focus-seg").onclick=e=>{ const b=e.target.closest("[data-l]"); if(!b) return; const it=byId(state.focus), l=+b.dataset.l, cur=state.lv.get(it.id)||0;
  setLevel(it, l!==cur ? l : l===2 ? 1 : 0); }; // tocar de novo no botão aceso desfaz: "Eu amo!" volta pra Curto, "Curto" desmarca

// contagens usadas no desenho, calculadas uma vez por quadro (e não por bolha)
let KIDN=new Map(), HEARTN=new Map();
function countsForFrame(){
  KIDN=new Map(); HEARTN=new Map();
  INTERESTS.forEach(i=>{ if(i.parent) KIDN.set(i.parent,(KIDN.get(i.parent)||0)+1); });
  state.lv.forEach((l,id)=>{ if(l===2) ancestors(id).forEach(a=>HEARTN.set(a,(HEARTN.get(a)||0)+1)); });
}
function frame(t){
  if(typeof floatLayer!=="undefined" && floatLayer && floatLayer.hidden===floatsOn()) floatLayer.hidden=!floatsOn(); // some dentro de uma bolha, na visão de pessoas e com filtro
  now=t||0; countsForFrame();
  if(W && !(pm&&pm.on)){ // na visão de pessoas o globo fica parado
    ctx.clearRect(0,0,W,H);
    if(anim){
      anim.t=Math.min(1,anim.t+0.045); const e=ease(anim.t), S=shellR(), c=shellC();
      if(anim.dir==="in"){
        rotY+=vY*.3; fade=1-e; project(); drawAll(); fade=1;
        const f=anim.from; drawShell(lerp(f.x,c.x,e),lerp(f.y,c.y,e),lerp(f.r,S,e),anim.h,1,(1-e)*.85);
        if(anim.t>=1){ const id=anim.id; anim=null; doEnter(id); }
      } else {
        fade=e; project(); drawAll(); fade=1;
        const p=pts.find(q=>q.it.id===anim.id), to=p?{x:p.sx,y:p.sy,r:p.r}:{x:c.x,y:c.y,r:0};
        drawShell(lerp(c.x,to.x,e),lerp(c.y,to.y,e),lerp(S,to.r,e),anim.h,1-e*.6,e*.6);
        if(anim.t>=1) anim=null;
      }
    } else if(spread.on){
      stepSpread();
      pts=items.map(it=>{ const s=it.sp; return {it,sx:(s.x+s.ox)*spread.k+spread.px,sy:(s.y+s.oy)*spread.k+spread.py,r:Math.max(0,s.r*s.hs*spread.k),z:1}; }).sort((a,b)=>b.r-a.r); // menores por cima
      drawAll();
    } else if(state.focus){
      if(!drag && !hoverPause && !held()){
        if(sphere()){ fY+=fvY; fX+=fvX; fvX*=.95; fvY+=((reduce?0:AUTO*Math.sign(fvY||1))-fvY)*.02; fX=wrap(fX); }
        else { orbit+=vO; vO+=(AUTO_O-vO)*.03; }
      }
      const S=shellR(), c=shellC(); drawShell(c.x,c.y,S,byId(state.focus).hue,1,0); drawCenter();
      project(); drawAll();
    } else {
      if(target && !drag){
        const dy=wrap(target.y-rotY), dx=wrap(target.x-rotX); rotY+=dy*.08; rotX+=dx*.08;
        if(Math.abs(dy)<.002&&Math.abs(dx)<.002){ target=null; vY=held()?0:AUTO; }
      } else if(!drag && !hoverPause && !held()){ rotY+=vY; rotX+=vX; vX*=.95; vY+=((reduce?0:AUTO*Math.sign(vY||1))-vY)*.02; }
      rotX=wrap(rotX); // gira livre também de cima pra baixo
      const halo=ctx.createRadialGradient(W/2,H/2,R*SPH*gS*.2,W/2,H/2,R*SPH*gS*1.5);
      halo.addColorStop(0,"rgba(143,240,222,.07)"); halo.addColorStop(1,"rgba(143,240,222,0)"); ctx.fillStyle=halo; ctx.fillRect(0,0,W,H);
      project(); drawAll();
    }
    drawGrab(); drawFx();
  }
  requestAnimationFrame(frame);
}

/* ---------- interação ---------- */
// marcar uma sub-bolha marca também as bolhas acima dela (as que ainda não estavam marcadas ficam como "automáticas")
// (cada uma fica guardada onde estava na tela)
function markUp(id){ ancestors(id).forEach(a=>{ if(!state.lv.has(a)){ state.lv.set(a,1); state.auto.add(a); state.pp.set(a,byId(a).parent||null); } }); }
// bolha-mãe automática que ficou sem nenhuma sub-bolha marcada sai também. Devolve quantas saíram.
function pruneAuto(){
  let n=0, again=true;
  while(again){ again=false;
    for(const a of [...state.auto]){
      if(!byId(a) || !descendants(a).some(k=>state.lv.has(k.id))){ state.lv.delete(a); state.auto.delete(a); state.pp.delete(a); n++; again=true; }
    }
    if(again) reparent();
  }
  return n;
}
function setLevel(it,L,silent){
  if(!L){ const sel=descendants(it.id).filter(k=>state.lv.has(k.id)).length; // bolha pai só desmarca quando nenhuma sub-bolha está marcada
    if(sel){ toast(`Desmarque antes as ${sel} sub-bolha${sel>1?"s":""} marcada${sel>1?"s":""} de ${it.name}`); return; } }
  const gone=[], before=it.parent||null; let moved=false; // gone: bolhas-mãe que saem junto
  if(L){ showHeart(it); const was=state.lv.get(it.id)||0;
    if(!was && !state.pp.has(it.id)) state.pp.set(it.id,it.parent||null); // fica guardada onde está
    if(!was) nudgeLogin();
    state.lv.set(it.id,L); state.auto.delete(it.id); moved=reparent(); markUp(it.id); burst(it,!was); it.lk=performance.now()+10000;
    try{ navigator.vibrate && navigator.vibrate(L===2?[25,45,40]:28); }catch(e){} }
  else {
    [it,...descendants(it.id)].forEach(k=>{ state.lv.delete(k.id); state.auto.delete(k.id); state.pp.delete(k.id); });
    // a bolha-mãe que só estava marcada por causa dessa sub-bolha sai também (se nenhuma outra sub-bolha dela continua marcada)
    for(const a of ancestors(it.id)){
      if(!state.auto.has(a) || descendants(a).some(k=>state.lv.has(k.id))) break;
      state.lv.delete(a); state.auto.delete(a); state.pp.delete(a); gone.push(byId(a).name);
    }
  }
  // sem ser sua, a bolha volta pro lugar onde a maioria guarda
  if(reparent()||moved) rebuild();
  else if(L) bringIn(it); // bolha principal estourada pela busca que não estava no globo: aparece
  const back=!L && (it.parent||null)!==before ? ` (ela volta ${it.parent?"pra "+byId(it.parent).name:"pras bolhas principais"}, onde a maioria guarda)` : "";
  if(!silent || gone.length || back){
    const n=everyone().filter(p=>p.lv.has(it.id)).length;
    toast(L===1?`Estourou ${it.name}!${n?` +${n} ${n>1?"pessoas":"pessoa"} no seu radar`:""}`: L===2?`Você ama ${it.name}! ♥ peso maior no match`:`Você saiu de ${it.name}${gone.length?` e de ${gone.join(" e ")}`:""}${back}`);
  }
  renderAll();
  if(window.estouraSync) window.estouraSync(); // salva no Supabase quando há login
}

let lastTap={id:null,t:0};
function tap(it){
  if(it.type==="add") return openNewSub();
  if(it.type==="event") return openEvent(it);
  const L=state.lv.get(it.id)||0, t=performance.now();
  if(kids(it.id).length){ // tem sub-bolhas: 1 toque abre; só dá pra marcar a última bolha da fila (a pai fica marcada pelas filhas)
    lastTap={id:null,t:0};
    if(!spread.on) return enter(it.id);
    setSpread(false); setTimeout(()=>enter(it.id),reduce?0:80); return;
  }
  // 2 toques rápidos entram na bolha, mas só quando o 1º toque marcou ela; numa já marcada, o 2º toque é pra desmarcar
  if(!spread.on && lastTap.id===it.id && lastTap.marked && t-lastTap.t<380){
    lastTap={id:null,t:0};
    return enter(it.id);
  }
  lastTap={id:it.id,t,marked:!L};
  if(!L) return setLevel(it,1); // 1 toque marca; "eu amo!" fica só dentro da bolha
  if((it.hu||0)<t){ showHeart(it); toast(`Toque de novo pra desmarcar ${it.name}`); return; } // 1º toque numa marcada só mostra o coração
  lastTap={id:null,t:0};
  setLevel(it,0); // 2º toque (com o coração à mostra) desmarca
}

/* ---------- mover e remover bolhas ----------
   Segurar uma bolha (~0,5 s) "pega" ela:
   - solta no mesmo lugar  -> entra na bolha (jeito de criar sub-bolhas);
   - arrasta até "Remover" -> tira das suas bolhas (com confirmação).
   Mover e remover mexem só na sua árvore: cada pessoa organiza as próprias bolhas. */
const BODYFONT="Figtree, system-ui, sans-serif";
const trashZone=()=>({x:W/2,y:H-46,r:32});
const overTrash=g=>{ const z=trashZone(); return Math.hypot(g.x-z.x,g.y-z.y)<z.r+20; };
const drawAll=()=>pts.forEach(p=>{
  if(grab&&p.it===grab.it) return;
  if(grow&&p.it===grow.it){ const k=1+.4*Math.min(1,(performance.now()-grow.t0)/700); drawBubble({...p,r:p.r*k}); return; } // cresce pra mostrar que vai entrar
  drawBubble(p); }); // a bolha pega é desenhada à parte
function drawGrab(){
  if(!grab) return;
  const z=trashZone(), hot=overTrash(grab);
  ctx.globalAlpha=1; ctx.lineWidth=2; ctx.setLineDash([5,4]);
  ctx.fillStyle=hot?"rgba(255,90,90,.3)":"rgba(255,255,255,.06)"; ctx.strokeStyle=hot?"#ff7a7a":"rgba(255,158,196,.75)";
  ctx.beginPath(); ctx.arc(z.x,z.y,z.r+(hot?6:0),0,7); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
  ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillStyle=hot?"#ffd0d0":"#f1f5ff"; ctx.font=`700 12px ${BODYFONT}`;
  ctx.fillText("Remover",z.x,z.y);
  const base=pts.find(p=>p.it===grab.it);
  drawBubble({it:grab.it,sx:grab.x,sy:grab.y,r:(base?base.r:30)*1.12,z:1});
}
// bolha que você criou e que ninguém mais tem: ao sair dela, ela some do Estoura
const orphan=it=>!!it.custom && it.base<=0;
function askDelete(it){
  if(!state.lv.has(it.id)){
    if(!orphan(it)) return toast(`"${it.name}" não está nas suas bolhas. Ela continua pra quem curte.`);
    openSheet(`<h3 style="font-family:var(--display);font-size:22px;margin:0 0 4px">Apagar "${esc(it.name)}"?</h3>
      <p class="sub" style="margin-bottom:6px">Ninguém tem essa bolha, então ela sai do Estoura.</p>
      <div class="actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="del-ok" style="background:#ff7a7a;color:#2a0d0d">Apagar</button></div>`,{type:"delete"});
    document.getElementById("del-ok").onclick=()=>{ closeLayer(); doRemove(it); };
    return;
  }
  const ks=kids(it.id).filter(k=>state.lv.has(k.id)), to=it.parent?byId(it.parent).name:"suas bolhas principais";
  openSheet(`<h3 style="font-family:var(--display);font-size:22px;margin:0 0 4px">Remover "${esc(it.name)}" das suas bolhas?</h3>
    <p class="sub" style="margin-bottom:6px">${ks.length?`Suas ${ks.length} sub-bolha${ks.length>1?"s":""} de dentro dela (${ks.slice(0,5).map(k=>esc(k.name)).join(", ")}${ks.length>5?` e mais ${ks.length-5}`:""}) continuam suas e passam para ${esc(to)}. `:""}${orphan(it)?"Ninguém mais tem essa bolha, então ela sai do Estoura.":"A bolha continua no Estoura pra quem curte."}</p>
    <div class="actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="del-ok" style="background:#ff7a7a;color:#2a0d0d">Remover</button></div>`,{type:"delete"});
  document.getElementById("del-ok").onclick=()=>{ closeLayer(); doRemove(it); };
}
// tira a bolha das suas: as suas sub-bolhas de dentro dela sobem um nível (na sua árvore)
function doRemove(it){
  const up=it.parent||null, ks=kids(it.id).filter(k=>state.lv.has(k.id)), gone=orphan(it);
  ks.forEach(k=>state.pp.set(k.id,up));
  if(state.focus===it.id) state.focus=up; // estava dentro dela: sobe pra fora
  if(state.lv.has(it.id)){ reparent(); setLevel(it,0,true); }
  if(gone){ // ninguém mais tem: some daqui também (o banco apaga se foi você quem criou)
    INTERESTS.splice(INTERESTS.indexOf(it),1); state.pp.delete(it.id);
    if(window.estouraForget) window.estouraForget(it.id);
  }
  reparent(); rebuild(true); renderAll();
  toast(`"${it.name}" saiu das suas bolhas${ks.length?`; as sub-bolhas foram para ${up?byId(up).name:"as principais"}`:""}`);
}
function doMove(it,newParent){
  if(!placeMine(it,newParent)) return;
  toast(newParent?`"${it.name}" agora está dentro de ${byId(newParent).name} (nas suas bolhas)`:`"${it.name}" virou uma bolha principal (nas suas bolhas)`);
}

// Mover a bolha que está aberta, junto com tudo o que tem dentro, para outro lugar da árvore
function openMove(){
  const it=byId(state.focus); if(!it) return;
  const banned=new Set([it.id,...descendants(it.id).map(d=>d.id)]); // não dá pra guardar dentro de si mesma
  const rows=[], walk=(parent,dep)=>INTERESTS.filter(i=>(i.parent||null)===parent).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"))
    .forEach(i=>{ if(banned.has(i.id)) return; rows.push({i,dep}); walk(i.id,dep+1); });
  walk(null,0);
  const btn=(to,label,dep,cur)=>`<button class="btn" data-to="${esc(to)}" ${cur?"disabled":""} style="justify-content:flex-start;text-align:left;padding-left:${14+dep*18}px">${esc(label)}${cur?" (onde está agora)":""}</button>`;
  const n=descendants(it.id).length;
  openSheet(`<h3 style="font-family:var(--display);font-size:22px;margin:0 0 4px">Mover "${esc(it.name)}"</h3>
    <p class="sub" style="margin-bottom:8px">${n?`Leva a bolha e as ${n} sub-bolha${n>1?"s":""} que estão dentro dela. `:""}Muda só nas suas bolhas${state.lv.has(it.id)?"":" (e ela passa a ser sua)"}: os outros continuam vendo onde a maioria guarda. Escolha onde guardar:</p>
    <input type="text" id="mv-q" placeholder="Buscar bolha" autocomplete="off" style="width:100%;margin-bottom:8px">
    <div id="mv-list" style="display:grid;gap:6px">
      ${btn("","Bolha principal (fora de todas)",0,!it.parent)}
      ${rows.map(({i,dep})=>btn(i.id,i.name,dep+1,it.parent===i.id)).join("")}
    </div>
    <div class="actions"><button class="btn" data-close>Cancelar</button></div>`,{type:"move"});
  const q=document.getElementById("mv-q"), list=document.getElementById("mv-list");
  q.oninput=()=>{ const t=q.value.trim().toLowerCase(); list.querySelectorAll("button").forEach(b=>{ b.hidden=!!t && !b.textContent.toLowerCase().includes(t); }); };
  list.onclick=e=>{ const b=e.target.closest("[data-to]"); if(!b||b.disabled) return; closeLayer(); doMove(it,b.dataset.to||null); };
}

let drag=false, start=null, last=null, lp=null, lpG=null, lpE=null, lpDone=false, hoverPause=false, grab=null, grow=null;
const clearLP=()=>{ clearTimeout(lp); clearTimeout(lpG); clearTimeout(lpE); grow=null; };
const hitAt=e=>{ const b=cv.getBoundingClientRect(), x=e.clientX-b.left, y=e.clientY-b.top;
  const slop=e.pointerType==="touch"?12:4; // dedo é mais impreciso que o mouse
  return [...pts].reverse().find(p=>Math.hypot(p.sx-x,p.sy-y)<p.r+slop); };
const localXY=e=>{ const b=cv.getBoundingClientRect(); return {x:e.clientX-b.left,y:e.clientY-b.top}; };
// pinça (dois dedos) pra dar zoom na visão espalhada
const ptrs=new Map(); let pinch=null, pinchBusy=false;
const pinchGeom=()=>{ const [a,b]=[...ptrs.values()], r=cv.getBoundingClientRect();
  return {d:Math.hypot(a.x-b.x,a.y-b.y)||1, mx:(a.x+b.x)/2-r.left, my:(a.y+b.y)/2-r.top}; };
const zoomAt=(x,y,k)=>{ const k0=spread.k; k=Math.max(.15,Math.min(4,k));
  spread.px=x-(x-spread.px)*(k/k0); spread.py=y-(y-spread.py)*(k/k0); spread.k=k;
  spread.tk=k; spread.tpx=spread.px; spread.tpy=spread.py; spread.auto=false; };
cv.addEventListener("pointerdown",e=>{
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(spread.on && ptrs.size===2){ const g=pinchGeom(); pinch={d0:g.d,k0:spread.k}; pinchBusy=true; clearLP(); grab=null; return; }
  drag=true; target=null; hoverPause=false; spread.mouse=null; cv.classList.add("drag"); start=last={x:e.clientX,y:e.clientY};
  lpDone=false; clearLP();
  if(!anim){ const h=hitAt(e), p0=localXY(e);
    if(h && !h.it.type && !heartHit(p0.x,p0.y)){
      // parou um instante: a bolha começa a crescer (vai entrar). Segurou mais: pronta pra entrar. Segurou bem mais: modo remover.
      if(!spread.on){
        lpG=setTimeout(()=>{ if(drag) grow={it:h.it,t0:performance.now()}; },300);
        lpE=setTimeout(()=>{ if(!drag) return; lpDone=true; grow=null; try{ navigator.vibrate && navigator.vibrate(15); }catch(_){}
          if(!state.lv.has(h.it.id) && !kids(h.it.id).length) setLevel(h.it,1,true);
          enter(h.it.id); },1000); // segurou ~1 s: entra na bolha sem precisar soltar
      }
      lp=setTimeout(()=>{
        if(!drag) return;
        try{ navigator.vibrate && navigator.vibrate([20,40,20]); }catch(_){}
        lpDone=false; grow=null; grab={it:h.it,x:p0.x,y:p0.y,x0:p0.x,y0:p0.y,moved:false}; // segurou bastante: pega pra remover
      },5000);
    } } });
cv.addEventListener("contextmenu",e=>e.preventDefault());
// o mouse em qualquer ponto da massa de bolhas (inclusive entre elas) também segura o giro
const overMass=p=>{ if(spread.on) return false; const c=state.focus?shellC():{x:W/2,y:H/2}, rr=state.focus?shellR():R*SPH*gS*1.15+20; return Math.hypot(p.x-c.x,p.y-c.y)<rr; };
cv.addEventListener("pointerleave",()=>{ hoverPause=false; spread.mouse=null; cv.style.cursor=""; });
cv.addEventListener("pointermove",e=>{
  if(ptrs.has(e.pointerId)) ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch && ptrs.size>=2){ const g=pinchGeom(); zoomAt(g.mx,g.my,pinch.k0*g.d/pinch.d0); return; }
  if(pinchBusy) return;
  // mouse parado em cima de uma bolha: o globo para de girar
  if(!drag){ if(e.pointerType==="mouse"){ const h=hitAt(e), lp0=localXY(e), hh=heartHit(lp0.x,lp0.y); if(h) showHeart(h.it); if(hh) showHeart(hh.it); hoverPause=!!h||overMass(lp0); cv.style.cursor=h||hh?"pointer":""; if(spread.on) spread.mouse=localXY(e); } return; }
  if(grab){ const p=localXY(e); grab.x=p.x; grab.y=p.y; if(Math.hypot(p.x-grab.x0,p.y-grab.y0)>10) grab.moved=true; return; }
  if(start && Math.hypot(e.clientX-start.x,e.clientY-start.y)>=7){ clearLP(); lpDone=false; }
  const dx=e.clientX-last.x, dy=e.clientY-last.y; last={x:e.clientX,y:e.clientY};
  if(spread.on){ spread.px+=dx; spread.py+=dy; spread.tpx=spread.px; spread.tpy=spread.py; spread.auto=false; return; } // arrastar move a tela
  if(state.focus){
    if(sphere()){ const sg=Math.cos(fX)<0?-1:1; fY+=dx*.008*sg; fX-=dy*.008; fvY=dx*.008*sg; fvX=-dy*.008; } // esfera de dentro da bolha
    else { const c=shellC(), p=localXY(e), rx=p.x-c.x, ry=p.y-c.y, d=(rx*dy-ry*dx)/Math.max(rx*rx+ry*ry,3600); orbit+=d; vO=d; } // gira pro lado que o dedo vai, em qualquer ponto do anel
    return; }
  // arrastar o dedo pra baixo faz a frente do globo descer junto
  const sg=Math.cos(rotX)<0?-1:1; // de cabeça pra baixo o lado inverte, pra bolha seguir o dedo
  rotY+=dx*.008*sg; rotX-=dy*.008; vY=dx*.008*sg; vX=-dy*.008;
});
cv.addEventListener("wheel",e=>{ // rodinha do mouse = zoom na visão espalhada
  if(!spread.on) return; e.preventDefault();
  const r=cv.getBoundingClientRect(); zoomAt(e.clientX-r.left,e.clientY-r.top,spread.k*Math.exp(-e.deltaY*.0015));
},{passive:false});
cv.addEventListener("dblclick",()=>{ if(spread.on){ spread.auto=true; fitSpread(); } }); // duplo clique: enquadra tudo de novo
cv.addEventListener("pointerup",e=>{
  ptrs.delete(e.pointerId);
  if(pinch||pinchBusy){ pinch=null; pinchBusy=ptrs.size>0; drag=pinchBusy; if(!drag) cv.classList.remove("drag"); return; } // fim da pinça: sem toque fantasma
  drag=false; cv.classList.remove("drag"); clearLP();
  if(grab){ const g=grab; grab=null;
    if(!g.moved) return; // segurou pra remover e soltou no lugar: nada acontece
    if(overTrash(g)) return askDelete(g.it);
    return; }
  if(lpDone){ lpDone=false; return; } // o toque longo já entrou na bolha
  if(anim || Math.hypot(e.clientX-start.x,e.clientY-start.y)>=7) return;
  if(!state.focus){ vY=AUTO; vX=0; } else if(sphere()){ fvY=AUTO; fvX=0; }
  const b=cv.getBoundingClientRect(), x=e.clientX-b.left, y=e.clientY-b.top;
  if(spread.on) spread.poke={x,y}; // um toque faz uma onda que empurra as bolhas vizinhas
  const hh=heartHit(x,y); if(hh) return heartTap(hh);
  const hit=hitAt(e);
  if(hit) return tap(hit.it);
  if(state.focus){ const c=shellC(); if(Math.hypot(x-c.x,y-c.y)>shellR()) leave(); }
});
cv.addEventListener("pointercancel",e=>{ptrs.delete(e.pointerId);pinch=null;pinchBusy=ptrs.size>0;drag=pinchBusy;grab=null;clearLP();lpDone=false;if(!drag) cv.classList.remove("drag")});

/* ---------- puxar pra baixo pra atualizar (celular) ----------
   No app instalado o navegador não oferece esse gesto, então fazemos o nosso.
   Vale nas telas de lista (Matches, Eventos, Grupos) e na faixa de cima do globo
   (no globo, arrastar gira, por isso a área do globo em si fica de fora). */
(function(){
  const ind=document.createElement("div"); ind.id="ptr"; ind.setAttribute("aria-hidden","true"); ind.innerHTML="<i></i>"; document.body.appendChild(ind);
  const TH=64, LONG=96; let y0=null, pull=0, busy=false;
  const setInd=(px,snap)=>{ ind.classList.toggle("snap",!!snap); ind.style.opacity=Math.min(1,px/40); ind.style.transform=`translate(-50%,${px-46}px)`; ind.firstChild.style.transform=`rotate(${px*4}deg)`; };
  const zone=t=>t.closest(".view:not(#view-bolhas), header, #topbar, #crumb");
  document.addEventListener("touchstart",e=>{
    if(busy||e.touches.length!==1||layer.firstElementChild) return;
    const z=zone(e.target); if(!z) return;
    if(z.classList.contains("view") && z.scrollTop>0) return; // só puxa quando a lista está no topo
    y0=e.touches[0].clientY; pull=0;
  },{passive:true});
  document.addEventListener("touchmove",e=>{
    if(y0==null) return; const dy=e.touches[0].clientY-y0;
    if(dy<=0){ pull=0; setInd(0); return; }
    pull=Math.min(dy*.5,LONG+30); ind.classList.toggle("long",pull>=LONG); setInd(pull);
  },{passive:true});
  const end=async()=>{
    if(y0==null) return; const go=pull>=TH*.8; y0=null;
    ind.classList.remove("long");
    if(pull>=LONG){ busy=true; ind.classList.add("spin"); setInd(56,true); location.reload(); return; } // puxada longa: recarrega a página
    if(!go){ setInd(0,true); return; }
    busy=true; ind.classList.add("spin"); setInd(56,true);
    try{
      if(window.estouraRefreshAll) await window.estouraRefreshAll();
      else { location.reload(); return; } // sem login: recarrega a página também
      toast("Atualizado");
    }catch(_){ toast("Não consegui atualizar"); }
    ind.classList.remove("spin"); setInd(0,true); busy=false;
  };
  document.addEventListener("touchend",end); document.addEventListener("touchcancel",()=>{ y0=null; ind.classList.remove("long"); setInd(0,true); });
})();

// teclado virtual (iOS/Android): o chat encolhe junto com a área visível
if(window.visualViewport){
  const vv=visualViewport, fit=()=>{
    document.documentElement.style.setProperty("--vvh",vv.height+"px");
    document.documentElement.classList.toggle("kb",innerHeight-vv.height>150); // teclado aberto
    if(vv.offsetTop) scrollTo(0,0);
    resize(); // o globo se ajusta ao espaço que sobrou
  };
  vv.addEventListener("resize",fit); vv.addEventListener("scroll",fit); fit();
}
// Esc fecha folhas e chat; Enter/Espaço já funcionam nos botões
document.addEventListener("keydown",e=>{ if(e.key==="Escape" && layer.firstElementChild){ if(state.focus && !sheet && !current) return; closeLayer(); } });
// girar a tela / redimensionar a janela: refaz o canvas
addEventListener("orientationchange",()=>setTimeout(resize,250));
