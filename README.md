# Estoura

Estoure as bolhas dos seus interesses e ache a sua turma.

**Stack:** HTML/CSS/JS puro no navegador (public/) · Next.js 16 só para servir o site e as rotas /config.js e /api/push · Supabase (Postgres, Auth com Google, RLS, Realtime) · Vercel.

**Comece por aqui:** [SETUP.md](SETUP.md) — Supabase, login com Google e deploy, passo a passo.

```bash
npm install
cp .env.example .env.local   # preencha as chaves do Supabase
npm run dev                  # http://localhost:3000
```

## Estrutura

```
public/
  estoura.html             o app (só o HTML das telas)
  estoura.css              estilos
  js/dados.js              bolhas e pessoas de exemplo, cidades
  js/estado.js             estado do app e cálculo de match (bolha rara pesa mais)
  js/ui.js                 abas, matches, chat, eventos, grupos, janelas, boas-vindas
  js/globo.js              globo 3D de bolhas (canvas)
  js/pessoas.js            visão de pessoas e rede; inicia o app
  js/conta.js              login com Google e tudo que vai pro Supabase
  sw.js                    service worker (offline e notificações)
src/app/
  config.js/route.ts       entrega as chaves públicas do Supabase pro app
  api/push/route.ts        envia as notificações push
supabase/
  migrations/              tabelas, RLS e funções (rode na ordem, 0001 a 0015)
  seed.sql                 bolhas iniciais
tests/                     npm test (banco PGlite + Chrome)
```

Os arquivos em `public/js` são scripts comuns (não módulos), carregados em ordem: o que um declara, os seguintes enxergam. Só o `conta.js` é módulo.

## Já funciona
Login Google · globo de bolhas com bolha dentro de bolha · "curto" / "eu amo!" · criar, mover e remover bolhas · "em alta" · matches por afinidade · convites e chat 1:1 · eventos com chat · grupos sugeridos · notificações push · cidade e raio de distância · privacidade (primeiro nome e foto embaçada até os dois aceitarem; redes sociais só depois) · painel de administração · PWA instalável · celular, tablet e desktop.
