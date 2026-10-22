# Estoura

Estoure as bolhas dos seus interesses e ache a sua turma.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth com Google, RLS) · Vercel.

**Comece por aqui:** [SETUP.md](SETUP.md) — Supabase, login com Google e deploy, passo a passo.

```bash
npm install
cp .env.example .env.local   # preencha as chaves do Supabase
npm run dev                  # http://localhost:3000
```

## Estrutura

```
src/
  proxy.ts                 renova a sessão e protege /app
  app/
    page.tsx               página inicial (estática, rápida)
    login/                 login com Google
    auth/callback|signout  retorno do OAuth e logout
    app/page.tsx           app logado (dados do Supabase)
  components/
    globe.tsx              globo 3D de bolhas (canvas)
    matches.tsx            matches por afinidade
    app-shell.tsx          layout responsivo + gravação no banco
  lib/
    supabase/              clientes browser/server/proxy
    matching.ts            cálculo de match (bolha rara pesa mais)
supabase/
  migrations/0001_init.sql tabelas, RLS e funções
  seed.sql                 bolhas iniciais
```

## Já funciona
Login Google · globo de bolhas com sub-bolhas · marcar "curto" / "é minha vida" (salvo no banco) · criar bolhas e sub-bolhas · "em alta" · matches entre usuários reais · layout para celular, tablet e desktop.

## Próximos passos
Eventos · grupos sugeridos · convite e chat (Supabase Realtime) · cidade e distância · redes sociais liberadas só após aceite · PWA instalável.
