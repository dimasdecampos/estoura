# Estoura — do zero ao ar (Supabase + login com Google + Vercel)

Tempo estimado: 30 a 40 minutos. Faça na ordem.

```
Você ──► Estoura (Next.js) ──► Supabase Auth ──► Google
                 ▲                    │
                 └──── /auth/callback ◄┘   (sessão em cookie)
```

---

## 1. Criar o projeto no Supabase

1. Entre em <https://supabase.com> e faça login (pode ser com GitHub).
2. **New project**. Nome: `estoura`. Região: **South America (São Paulo)**. Guarde a senha do banco.
3. Espere ~2 minutos até o projeto ficar pronto.

## 2. Criar as tabelas

1. Menu **SQL Editor** → **New query**.
2. Cole o conteúdo de `supabase/migrations/0001_init.sql` → **Run**.
3. Nova query, cole `supabase/seed.sql` → **Run** (cria as 66 bolhas iniciais).
3b. Nova query, cole `supabase/migrations/0002_connections_chat.sql` → **Run** (convites, chat e redes sociais protegidas).
4. Confira em **Table Editor**: `profiles`, `interests`, `user_interests`.

> A segurança (RLS) já está no SQL: cada pessoa só lê e altera as próprias bolhas. Perfis de outras pessoas só aparecem pela função `my_matches()`, e sem e-mail nem redes sociais.

## 3. Pegar as chaves e ligar o projeto local

1. No Supabase: **Project Settings → API Keys** (ou o botão **Connect**).
2. Copie a **Project URL** e a **Publishable key** (`sb_publishable_...`).
3. Na pasta `estoura-web`, copie `.env.example` para `.env.local` e preencha:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

Nunca coloque a **secret / service_role key** neste projeto. A publishable é segura para ficar no navegador porque o RLS protege os dados.

## 4. Login com Google (o caminho completo)

### 4.1 No Google Cloud Console

1. Acesse <https://console.cloud.google.com> e crie um projeto novo (`Estoura`).
2. Menu **APIs e serviços → Tela de permissão OAuth** (ou **Google Auth Platform**):
   - Tipo de usuário: **Externo**.
   - Nome do app: `Estoura`. E-mail de suporte e de contato: o seu.
   - **Escopos**: deixe só `email`, `profile` e `openid` (são os padrões, não exigem verificação do Google).
   - Enquanto o app estiver em **Testando**, só entram os e-mails que você adicionar em **Usuários de teste**. Adicione o seu.
3. **Credenciais → Criar credenciais → ID do cliente OAuth** → tipo **Aplicativo da Web**:
   - **Origens JavaScript autorizadas**
     - `http://localhost:3000`
     - (depois) `https://SEU-APP.vercel.app` e o seu domínio, se tiver
   - **URIs de redirecionamento autorizados** (este é o mais importante):
     - `https://SEU-PROJETO.supabase.co/auth/v1/callback`
     - O endereço exato aparece no Supabase, em **Authentication → Sign In / Providers → Google → Callback URL**. Copie de lá.
4. Clique em **Criar** e copie o **ID do cliente** e a **Chave secreta**.

### 4.2 No Supabase

1. **Authentication → Sign In / Providers → Google** → ligue **Enable**.
2. Cole o **Client ID** e o **Client Secret** → **Save**.
3. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` (troque pela URL de produção quando publicar)
   - **Redirect URLs**: adicione `http://localhost:3000/**`

### 4.3 Testar

```bash
cd estoura-web
npm run dev
```

Abra <http://localhost:3000>, clique em **Entrar → Continuar com o Google**. Você deve cair em `/app` com sua foto no canto. Estoure uma bolha e confira em **Table Editor → user_interests** que a linha apareceu.

Para ter matches, entre com uma segunda conta Google (adicione-a como usuário de teste) e estoure as mesmas bolhas.

## 5. Publicar na web (Vercel)

1. Suba o projeto para o GitHub (`.env.local` não vai: já está no `.gitignore`).
   ```bash
   cd estoura-web
   git init && git add . && git commit -m "Estoura"
   # crie um repositório vazio no GitHub e siga as instruções de push
   ```
2. Em <https://vercel.com> → **Add New → Project** → importe o repositório. O Next.js é detectado sozinho.
3. Em **Environment Variables**, adicione as mesmas duas variáveis do `.env.local`.
4. **Deploy**. Anote a URL (`https://estoura-xxx.vercel.app`).
5. Volte e atualize **três lugares** com a URL de produção:
   - Supabase → **Authentication → URL Configuration**
     - **Site URL**: `https://estoura-xxx.vercel.app`
     - **Redirect URLs**: `https://estoura-xxx.vercel.app/**` (e `https://*-SEU-TIME.vercel.app/**` para previews)
   - Google Cloud → **Origens JavaScript autorizadas**: `https://estoura-xxx.vercel.app`
   - (O redirect URI do Google continua sendo o do Supabase, não muda.)
6. Para qualquer pessoa conseguir entrar (não só usuários de teste): Google Cloud → **Tela de permissão OAuth → Publicar app**. Com apenas `email`, `profile` e `openid`, não precisa de revisão.

### Domínio próprio (opcional)

Vercel → **Settings → Domains** → adicione `estoura.com.br` (ou o seu). Depois repita o passo 5 com o domínio novo.

---

## Problemas comuns

| Sintoma | Causa e solução |
| --- | --- |
| `redirect_uri_mismatch` no Google | O redirect URI no Google Cloud não é **exatamente** o `https://<ref>.supabase.co/auth/v1/callback` do Supabase. |
| Em produção, o login volta para `localhost` | O **Site URL** do Supabase ainda é o de desenvolvimento. |
| `Unsupported provider: provider is not enabled` | Google não foi ligado em **Authentication → Providers**. |
| Google mostra "Acesso bloqueado" | App em modo teste e seu e-mail não está em **Usuários de teste** (ou publique o app). |
| `/login` mostra "Falta configurar o Supabase" | `.env.local` ausente ou servidor não foi reiniciado. |
| Matches carregam erro | O `0001_init.sql` não foi executado por completo (falta a função `my_matches`). |
| Globo vazio | O `seed.sql` não foi executado. |

## Para lançar de verdade

- Rode também `0003_pulse.sql`, `0004_events.sql` e `0005_real_numbers.sql` (números 100% reais: contagem, "Em alta" e peso da raridade).
- Rode `0006` a `0009`, nessa ordem. O `0009_bolhas_pessoais.sql` faz cada pessoa organizar as próprias bolhas:
  - mover e remover mudam só a árvore de quem mexeu;
  - o mapa de todo mundo mostra cada bolha onde a maioria guardou;
  - nomes repetidos (com acento ou maiúscula diferente) viram uma bolha só.
  **Rode o 0009 antes de publicar o `estoura.html` novo**: sem ele o app não consegue carregar as bolhas da conta.
- Ninguém mexe no mapa de todo mundo pelo app. Para fundir duas bolhas repetidas, use o comando do topo do `0009` no SQL Editor.
- Revise as políticas de privacidade e termos (você coleta nome, e-mail e foto — LGPD).
