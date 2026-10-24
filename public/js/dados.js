// Bolhas e pessoas de exemplo (o que aparece sem login), cidades e distâncias.
/* ================= DADOS DE EXEMPLO ================= */
// [id, nome, matiz, pessoas no total, novas nesta semana]
const TOP = [
  ["viagens","Viagens",200,2380,60],["slackline","Slackline",165,310,96],["futebol","Futebol",130,2140,30],
  ["croche","Crochê",330,640,150],["escalada","Escalada",25,520,20],["fotografia","Fotografia",280,1460,25],
  ["cafe","Café especial",30,980,22],["trilhas","Trilhas",145,1210,70],["surf","Surf",190,870,12],
  ["tabuleiro","Jogos de tabuleiro",260,560,40],["cerveja","Cerveja artesanal",40,1130,15],["yoga","Yoga",300,940,18],
  ["corrida","Corrida",350,1580,45],["vegana","Cozinha vegana",110,690,10],["astronomia","Astronomia",235,410,118],
  ["skate","Skate",15,480,8],["jardinagem","Jardinagem",95,600,20],["cinema","Cinema",345,1820,30],
  ["programacao","Programação",210,1290,35],["samba","Samba",5,760,25],["rafting","Rafting",180,260,14],
  ["ciclismo","Ciclismo",60,1050,20],["leitura","Leitura",270,1690,28],["pintura","Pintura",320,450,9],
  ["pets","Pets",20,2010,40],["vinil","Discos de vinil",250,330,6]
];
const SUBS = {
  viagens:[["mochilao","Mochilão",420],["patagonia","Patagônia",150],["intercambio","Intercâmbio",310],["roadtrip","Road trip",260],["nomade","Nômade digital",190]],
  slackline:[["highline","Highline",70],["trickline","Trickline",55],["waterline","Waterline",40]],
  futebol:[["pelada","Pelada de fim de semana",640],["futsal","Futsal",380],["torcida","Ir ao estádio",520]],
  croche:[["amigurumi","Amigurumi",210],["roupas","Roupas de crochê",150],["tapecaria","Tapeçaria",60]],
  escalada:[["boulder","Boulder",190],["esportiva","Esportiva",160],["bigwall","Big wall",35]],
  fotografia:[["analogica","Analógica",170],["natureza","Natureza",380],["rua","Fotografia de rua",240]],
  trilhas:[["travessias","Travessias",180],["camping","Camping selvagem",230],["cachoeiras","Cachoeiras",410]],
  surf:[["longboard","Longboard",160],["bodyboard","Bodyboard",130]],
  rafting:[["corredeiras","Classe IV+",45],["canoagem","Canoagem",90],["boiacross","Boia-cross",70]],
  corrida:[["maratona","Maratona",260],["trailrun","Trail run",210],["rua","Corrida de rua",590]],
  tabuleiro:[["euro","Eurogames",140],["rpg","RPG de mesa",230],["party","Party games",150]],
  cinema:[["terror","Terror",420],["cult","Cinema cult",210],["nacional","Cinema nacional",280]],
  programacao:[["games","Game dev",230],["ia","IA",410],["opensource","Open source",190]]
};
const INTERESTS = [];
TOP.forEach(([id,name,hue,base,week])=>{
  // sem números de exemplo: as contagens vêm das pessoas reais (Supabase)
  INTERESTS.push({id,name,hue,base:0,week:0,parent:null,gp:null});
  (SUBS[id]||[]).forEach(([s,n,b],k)=>INTERESTS.push({id:id+"/"+s,name:n,hue:(hue+(k-1)*24+360)%360,base:0,week:0,parent:id,gp:id}));
});
/* Cada bolha tem dois lugares:
   - gp: onde a maioria das pessoas guardou (o mapa de todo mundo, vem do banco);
   - state.pp: onde VOCÊ guardou (só para as suas bolhas).
   it.parent é o lugar que aparece na tela: o seu, se a bolha é sua; senão, o da maioria. */
// mesmo cálculo da função slugify do banco: "Hip-Hop", "hip hop" e "Hiphop" viram "hiphop"
const slugify = s => String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const slugOf = i => i._s ?? (i._s = slugify(i.name));
const byId = id => INTERESTS.find(i=>i.id===id);
const kids = id => INTERESTS.filter(i=>i.parent===id);
// árvore sem limite de níveis: bolha > sub-bolha > sub-sub-bolha > ...
const ancestors = id => { const out=[]; let p=(byId(id)||{}).parent, n=0; while(p && n++<200){ out.push(p); p=(byId(p)||{}).parent; } return out; }; // ids, da mais próxima à raiz
const descendants = id => { const out=[]; const walk=x=>kids(x).forEach(k=>{ out.push(k); walk(k.id); }); walk(id); return out; };
const isDescendant = (id,ofId) => ancestors(id).includes(ofId);
const pathOf = id => [...ancestors(id).reverse().map(a=>byId(a).name), byId(id).name];
// recalcula onde cada bolha aparece (it.parent). Devolve true se alguma mudou de lugar.
function reparent(){
  const ids=new Set(INTERESTS.map(i=>i.id)); let changed=false;
  INTERESTS.forEach(it=>{
    let p=state.lv.has(it.id)&&state.pp.has(it.id)?state.pp.get(it.id):it.gp;
    if(!p||p===it.id||!ids.has(p)) p=null;
    if((it.parent||null)!==p){ it.parent=p; changed=true; }
  });
  // segurança: uma bolha nunca pode acabar dentro dela mesma (A em B e B em A)
  INTERESTS.forEach(it=>{ const seen=new Set([it.id]); let p=it.parent;
    while(p){ if(seen.has(p)){ it.parent=null; changed=true; break; } seen.add(p); p=(byId(p)||{}).parent; } });
  return changed;
}

const CITIES = {"São Paulo":[-23.55,-46.63],"Campinas":[-22.90,-47.06],"Santos":[-23.96,-46.33],"Rio de Janeiro":[-22.91,-43.17],
  "Curitiba":[-25.43,-49.27],"Florianópolis":[-27.59,-48.55],"Belo Horizonte":[-19.92,-43.94],"Porto Alegre":[-30.03,-51.23],
  "Brasília":[-15.79,-47.88],"Salvador":[-12.97,-38.50],"Recife":[-8.05,-34.88],
  "Fortaleza":[-3.73,-38.53],"Manaus":[-3.12,-60.02],"Belém":[-1.46,-48.50],"Goiânia":[-16.68,-49.25],"Vitória":[-20.32,-40.34],
  "São Luís":[-2.53,-44.30],"Natal":[-5.79,-35.21],"João Pessoa":[-7.12,-34.86],"Maceió":[-9.67,-35.74],"Aracaju":[-10.91,-37.07],
  "Teresina":[-5.09,-42.80],"Cuiabá":[-15.60,-56.10],"Campo Grande":[-20.46,-54.62],"Porto Velho":[-8.76,-63.90],"Rio Branco":[-9.97,-67.81],
  "Macapá":[0.03,-51.07],"Boa Vista":[2.82,-60.67],"Palmas":[-10.18,-48.33],
  "Guarulhos":[-23.46,-46.53],"Osasco":[-23.53,-46.79],"Santo André":[-23.66,-46.53],"São Bernardo do Campo":[-23.69,-46.56],
  "Sorocaba":[-23.50,-47.46],"Jundiaí":[-23.19,-46.88],"Ribeirão Preto":[-21.18,-47.81],"São José dos Campos":[-23.22,-45.90],
  "São José do Rio Preto":[-20.82,-49.38],"Bauru":[-22.31,-49.06],"Piracicaba":[-22.73,-47.65],"Ubatuba":[-23.43,-45.08],
  "Guarujá":[-23.99,-46.26],"Niterói":[-22.88,-43.10],"Petrópolis":[-22.51,-43.18],"Juiz de Fora":[-21.76,-43.35],
  "Uberlândia":[-18.92,-48.28],"Londrina":[-23.31,-51.16],"Maringá":[-23.42,-51.94],"Joinville":[-26.30,-48.85],
  "Blumenau":[-26.92,-49.07],"Balneário Camboriú":[-26.99,-48.63],"Caxias do Sul":[-29.17,-51.18],"Pelotas":[-31.77,-52.34],
  "Foz do Iguaçu":[-25.55,-54.59],"Ponta Grossa":[-25.09,-50.16],"Feira de Santana":[-12.27,-38.97],"Campina Grande":[-7.23,-35.88],
  "Caruaru":[-8.28,-35.97],"Petrolina":[-9.39,-40.50],"Anápolis":[-16.33,-48.95],"Imperatriz":[-5.52,-47.48]};

// o texto da cidade do perfil é livre: ignora acento, caixa e o que vem depois de vírgula, hífen ou barra ("Santos - SP")
const cityKey = t => String(t||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().split(/[,\/\-(]/)[0].replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
// cidades menores e grafias alternativas: só servem pra reconhecer o texto do perfil (não entram na lista do seletor)
const TOWNS = {"São Luiz do Paraitinga":[-23.22,-45.31],"São Luís do Paraitinga":[-23.22,-45.31],"São Luiz":[-2.53,-44.30],
  "Cunha":[-23.07,-44.96],"Lagoinha":[-23.09,-45.19],"Natividade da Serra":[-23.37,-45.46],"Redenção da Serra":[-23.26,-45.54],"Paraibuna":[-23.39,-45.66],
  "Taubaté":[-23.03,-45.56],"Tremembé":[-22.96,-45.55],"Pindamonhangaba":[-22.92,-45.46],"Guaratinguetá":[-22.82,-45.19],"Aparecida":[-22.85,-45.23],
  "Lorena":[-22.73,-45.12],"Cachoeira Paulista":[-22.67,-45.01],"Campos do Jordão":[-22.74,-45.59],"Caraguatatuba":[-23.62,-45.41],
  "São Sebastião":[-23.76,-45.41],"Ilhabela":[-23.78,-45.36],"Paraty":[-23.22,-44.71],"Angra dos Reis":[-23.01,-44.32],"Mogi das Cruzes":[-23.52,-46.19],
  "Jacareí":[-23.31,-45.97],"São Roque":[-23.53,-47.14],"Atibaia":[-23.12,-46.55],"Bragança Paulista":[-22.95,-46.54],"Itu":[-23.26,-47.30],
  "Americana":[-22.74,-47.33],"Limeira":[-22.56,-47.40],"Araraquara":[-21.79,-48.18],"São Carlos":[-22.02,-47.89],"Franca":[-20.54,-47.40],
  "Presidente Prudente":[-22.12,-51.39],"Marília":[-22.21,-49.95],"Araçatuba":[-21.21,-50.43],"Praia Grande":[-24.01,-46.41],"São Vicente":[-23.96,-46.39]};
const ALL_CITIES = {...CITIES,...TOWNS};
const CITY_KEYS = Object.keys(ALL_CITIES).map(n=>[cityKey(n),n]);
function cityName(t){
  const k=cityKey(t); if(!k) return null;
  const hit=CITY_KEYS.find(([c])=>c===k); if(hit) return hit[1];
  // "moro em santos": a maior cidade conhecida que aparece como palavra no texto
  const inside=CITY_KEYS.filter(([c])=>(" "+k+" ").includes(" "+c+" ")).sort((a,b)=>b[0].length-a[0].length)[0];
  return inside?inside[1]:null;
}
const coordsOf = t => { const n=cityName(t); return n?ALL_CITIES[n]:null; };

// pessoas reais vêm do Supabase (REAL, abaixo); não há perfis de exemplo
const PEOPLE = [];
// pessoas reais (vindas do Supabase, só com login)
const REAL = [];
const everyone = () => [...PEOPLE, ...REAL];
const authed = () => !!window.estouraAuthed;
// convites e conexões da conta (Supabase). Cada pessoa real recebe p.conn quando há convite entre vocês.
const CONNS = [];
const isLinked = p => (state.conn[p.id]==="accepted") || (p.conn && p.conn.status==="accepted");
// Redes que a pessoa pode colocar no perfil. A pessoa digita @usuário, número ou o link; o link é montado aqui.
const SOCIAL_NETS = [
  {key:"Instagram", ph:"@seu.usuario", hosts:["instagram.com"], re:/^[A-Za-z0-9._]{1,30}$/, url:h=>"https://instagram.com/"+h},
  {key:"Facebook", ph:"seu.nome ou link do perfil", hosts:["facebook.com","fb.com"], re:/^[A-Za-z0-9.]{3,60}$/, url:h=>"https://facebook.com/"+h},
  {key:"YouTube", ph:"@seucanal ou link do canal", hosts:["youtube.com"], re:/^[A-Za-z0-9._-]{1,60}$/, url:h=>"https://youtube.com/@"+h},
  {key:"LinkedIn", ph:"seu-usuario ou link do perfil", hosts:["linkedin.com"], re:/^[A-Za-z0-9-]{3,100}$/, url:h=>"https://linkedin.com/in/"+h},
  {key:"WhatsApp", ph:"5511999999999", hint:"Com código do país e DDD, só números. Ex.: 5511999999999", num:true}
];
// devolve o endereço seguro (só http/https, só o domínio da própria rede) ou null se o valor não for válido
function socialLink(key,value){
  const n=SOCIAL_NETS.find(x=>x.key===key); let v=String(value||"").trim();
  if(!n||!v) return null;
  if(n.num){ const d=v.replace(/\D/g,""); return d.length>=10&&d.length<=15 ? "https://wa.me/"+d : null; }
  if(!/^https?:\/\//i.test(v) && n.hosts.some(h=>{ const l=v.toLowerCase(); return l.startsWith(h+"/")||l.startsWith("www."+h+"/"); })) v="https://"+v;
  if(/^https?:\/\//i.test(v)){
    try{ const u=new URL(v), host=u.hostname.replace(/^(www|m|mobile)\./,"");
      return n.hosts.some(h=>host===h||host.endsWith("."+h)) ? u.href : null; }catch(e){ return null; }
  }
  v=v.replace(/^@/,"").replace(/\/+$/,"");
  return n.re.test(v) ? n.url(v) : null;
}
// ícones das redes (desenhos simples, na cor de cada rede)
const SOCIAL_ICONS = {
  Instagram:{c:"#f06a9d", svg:'<rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.2" cy="6.8" r="1.2" fill="currentColor"/>'},
  Facebook:{c:"#5b9bff", svg:'<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13.2 20v-6.2h2.1l.4-2.6h-2.5V9.6c0-.8.3-1.3 1.4-1.3h1.2V6c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.200-3.2 3.300v1.800H8.600v2.600h2.100V20z" fill="currentColor"/>'},
  YouTube:{c:"#ff5a5a", svg:'<rect x="2.8" y="5.8" width="18.4" height="12.4" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.200 9.300v5.400l4.700-2.700z" fill="currentColor"/>'},
  LinkedIn:{c:"#4aa8ee", svg:'<rect x="4.500" y="9.500" width="3" height="10" fill="currentColor"/><circle cx="6" cy="5.800" r="1.800" fill="currentColor"/><path d="M10.500 9.500h2.800v1.400c.5-.9 1.600-1.600 3.100-1.600 2.800 0 3.100 1.900 3.100 4.200v6h-3v-5.300c0-1.200-.1-2.200-1.400-2.200s-1.600 1.100-1.600 2.200v5.300h-3z" fill="currentColor"/>'},
  WhatsApp:{c:"#3ddc84", svg:'<path d="M12 3.200a8.800 8.800 0 0 0-7.500 13.400L3.200 20.800l4.300-1.200A8.800 8.800 0 1 0 12 3.200z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9.200 8.600c-.3.700-.1 1.800.9 3.200 1 1.400 2.200 2.300 3.500 2.700.9.200 1.500-.2 1.800-.8l.2-.5-1.700-.9-.8.800c-.9-.4-1.800-1.200-2.300-2.200l.7-.8-.8-1.800z" fill="currentColor"/>'}
};
function realSocials(p){
  const c=p.conn, nm=esc(p.name.split(" ")[0]);
  if(c && c.status==="accepted"){
    const order=k=>{ const i=SOCIAL_NETS.findIndex(n=>n.key===k); return i<0?99:i; };
    const e=Object.entries(c.socials||{}).filter(([,v])=>v).sort((a,b)=>order(a[0])-order(b[0]));
    // só os ícones, cada um é um link pro perfil (valores que não viram link são ignorados)
    const links=e.map(([k])=>({k,href:socialLink(k,c.socials[k])})).filter(x=>x.href&&SOCIAL_ICONS[x.k]);
    return links.length ? `<div class="socials">${links.map(({k,href})=>
        `<a class="soc-ic" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="${esc(k)}" aria-label="${esc(k)} de ${nm}" style="--c:${SOCIAL_ICONS[k].c}"><svg viewBox="0 0 24 24" aria-hidden="true">${SOCIAL_ICONS[k].svg}</svg></a>`).join("")}</div>`
      : `<div class="locked">${LOCK}<div><b>Sem redes por enquanto</b><span>${nm} ainda não adicionou as redes sociais.</span></div></div>`;
  }
  return `<div class="locked">${LOCK}<div><b>Redes sociais protegidas</b><span>Aparecem quando vocês dois aceitarem conversar.</span></div></div>`;
}
function realActions(p){
  const c=p.conn, nm=esc(p.name.split(" ")[0]);
  if(!c) return `<button class="btn primary" id="real-invite">Convidar pra conversar</button>`;
  if(c.status==="accepted") return `<button class="btn primary" id="real-chat">Abrir chat</button>`;
  if(c.status==="declined") return `<button class="btn" disabled>${c.mine?"Convite não aceito":"Você recusou"}</button>`;
  return c.mine ? `<button class="btn" disabled>Aguardando ${nm}</button>`
    : `<button class="btn" id="real-decline">Recusar</button><button class="btn primary" id="real-accept">Aceitar</button>`;
}
function inviteBlock(){
  const inc=CONNS.filter(c=>c.status==="pending" && !c.mine);
  if(!inc.length) return "";
  return `<div class="tag" style="margin:2px 0 -2px">Convites pra você (${inc.length})</div>` + inc.map(c=>`
    <div class="group" style="--h:330">
      <div class="row"><div style="display:flex;align-items:center;gap:12px;min-width:0">
        <span class="av" style="--h:330">${c.photo?`<img class="blur" src="${esc(c.photo)}" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`:esc(initials(firstName(c.name)))}</span>
        <span class="who"><span class="name">${esc(maskName(c.name))}</span> convidou você pra conversar${c.city?`<span class="meta" style="display:block">${esc(c.city)}</span>`:""}</span></div>
        <div class="row" style="gap:8px"><button class="btn sm" data-inv="${c.id}" data-act="decline">Recusar</button><button class="btn sm primary" data-inv="${c.id}" data-act="accept">Aceitar</button></div></div>
    </div>`).join("");
}
const exTag = p => p.example && authed() ? '<span class="ex">exemplo</span>' : "";
const metaLine = (p,d,anos) => [p.age ? (anos ? p.age+" anos" : p.age) : null, p.city || null, d!=null ? fmtDist(d) : null].filter(Boolean).join(" · ") || "Membro do Estoura";

// eventos reais vêm do Supabase (nenhum evento de exemplo)
const EVENTS = [];

const ICE = {
  viagens:"Qual viagem mudou sua cabeça?", "viagens/patagonia":"Torres del Paine ou El Chaltén?", "viagens/mochilao":"Qual o mochilão mais roots que você já fez?",
  slackline:"Bora montar um slack no parque esse fim de semana?", "slackline/highline":"Qual foi seu highline mais alto?",
  futebol:"Pra que time você torce?", croche:"Qual foi a última peça que você fez?", escalada:"Indoor ou rocha?",
  trilhas:"Qual a melhor trilha que você já fez?", "trilhas/camping":"Barraca ou rede?", surf:"Qual seu pico favorito?",
  rafting:"Qual o rio mais insano que você já desceu?", tabuleiro:"Qual jogo você sempre leva pra mesa?", cafe:"Qual método de preparo você prefere?",
  cinema:"Último filme que te pegou?", astronomia:"Já viu a Via Láctea a olho nu?", corrida:"Tá treinando pra alguma prova?"
};
const REPLIES = [
  i=>`Demais! ${i} é das coisas que mais curto.`, i=>`Haha sim! Faz tempo que procuro gente pra ${i.toLowerCase()} aqui.`,
  ()=>`Topo! Qual dia funciona pra você?`, i=>`Conta mais, como você começou com ${i.toLowerCase()}?`,
  ()=>`Que bom que a bolha juntou a gente 😄`
];

