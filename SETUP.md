# Estoura — do zero ao ar (Supabase + login com Google + Vercel)

Tempo estimado: 30 a 40 minutos. Faça na ordem.

```
Você ──► Estoura (public/estoura.html) ──► Supabase Auth ──► Google
                 ▲                                 │
                 └──────────── volta pra / ◄───────┘   (sessão no navegador)
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

Abra <http://localhost:3000>, clique em **Entrar → Continuar com o Google**. Você deve voltar pra página inicial com sua foto no canto. Estoure uma bolha e confira em **Table Editor → user_interests** que a linha apareceu.

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
| Não aparece o botão **Entrar** | `.env.local` ausente ou servidor não foi reiniciado (o `/config.js` vem sem as chaves). |
| Matches carregam erro | O `0001_init.sql` não foi executado por completo (falta a função `my_matches`). |
| Globo vazio | O `seed.sql` não foi executado. |

## Para lançar de verdade

- Rode também `0003_pulse.sql`, `0004_events.sql` e `0005_real_numbers.sql` (números 100% reais: contagem, "Em alta" e peso da raridade).
- Rode `0006` a `0009`, nessa ordem. O `0009_bolhas_pessoais.sql` faz cada pessoa organizar as próprias bolhas:
  - mover e remover mudam só a árvore de quem mexeu;
  - o mapa de todo mundo mostra cada bolha onde a maioria guardou;
  - nomes repetidos (com acento ou maiúscula diferente) viram uma bolha só.
  **Rode o 0009 antes de publicar o `estoura.html` novo**: sem ele o app não consegue carregar as bolhas da conta.
- Rode o `0010_bolha_mae_automatica.sql`: ele salva quais bolhas-mãe foram marcadas só por causa de uma sub-bolha, pra elas saírem junto quando a última sub-bolha sai, mesmo depois de recarregar a página. O app funciona sem ele, só não lembra isso.
- **Notificações** (mensagens e convites avisam mesmo com o app fechado):
  1. Rode o `0011_notificacoes.sql` no SQL Editor.
  2. Na Vercel (Settings → Environment Variables), crie `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (um `mailto:` seu) e faça um novo deploy. Para gerar as chaves: `npx web-push generate-vapid-keys`. A privada nunca vai pro GitHub nem pro navegador.
  3. Sem essas variáveis o app continua funcionando: avisa com o app aberto (faixa no topo, som e selo de "novas"), só não avisa com o app fechado.
  4. No iPhone, as notificações só funcionam com o app instalado (Compartilhar → Adicionar à Tela de Início).
- Rode o `0012_bolhas_publicas.sql`: quem ainda não entrou passa a ver as bolhas reais, com a quantidade de pessoas e tamanho proporcional (só números, nenhum dado de pessoa). Sem ele, o visitante vê só as bolhas de exemplo.
- Rode o `0013_editar_evento.sql` e o `0014_admin.sql` (quem criou o evento pode editar; painel de administração).
- Rode o `0015_privacidade.sql`: quem ainda não aceitou conversar com você só recebe o seu **primeiro nome** (resto em asteriscos) e uma **miniatura embaçada** da sua foto, nunca a foto original. Rode **antes** de publicar o app novo. Cada pessoa gera a própria miniatura ao abrir o app; até lá, os outros veem só a inicial.
- Testes automáticos: `npm test` (tudo, ~2 min) ou `npm run test:fast` (sem a rota de push). Precisam do Chrome instalado (ou `CHROME_PATH`).
- Ninguém mexe no mapa de todo mundo pelo app. Para fundir duas bolhas repetidas, use o comando do topo do `0009` no SQL Editor.
- Revise as políticas de privacidade e termos (você coleta nome, e-mail e foto — LGPD).
