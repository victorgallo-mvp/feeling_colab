# App de Reconhecimento (white-label)

> **Modo simples (nov/2026):** a interface foi reduzida a uma tela: clique na pessoa, dê uma moeda, texto opcional.
> Sem motivos pré-definidos, sem saldo, sem limite por pessoa (só não vale para si mesmo), sem missões, ranking, roleta
> na tela. Ficaram, a pedido do CEO, a página **Ranking** (moedas recebidas na temporada, visível a todos) e a **Roleta da semana**
> (quem mais recebeu moedas na semana anterior gira; prêmios em Admin → Roleta). O motor completo continua na API e no banco (tag git `v0-completo`).
> No banco, `coins_per_cycle = 0` e `max_per_receiver_per_cycle = 0` significam "sem limite"; `chip_id` virou opcional.
> Admin (`/admin`, só para role admin): Pessoas, Roleta e Marca & acesso.


Gamificação interna para PMEs de 10–50 pessoas. Nasce no piloto **Feeling**, mas nada de marca
é hardcoded: nome, logo, cores e regras vêm do tenant.

**Stack:** Node 20+ · Express 5 · PostgreSQL · zod · JWT (magic link, sem senha) · React 19 · Vite · Tailwind 4 · PWA + Web Push.

## Rodando local

```bash
# 1. banco
createdb feeling_gamificacao
createdb feeling_gamificacao_test        # só pra testes

# 2. env
cp server/.env.example server/.env       # ajuste DATABASE_URL se precisar

# 3. deps + migrations + seed
npm install
npm run migrate
npm run seed                              # SEED_RESET=true npm run seed -w server recria

# 4. sobe tudo (API :3001 + web :5190)
npm run dev
```

Abra http://localhost:5190. O tenant Feeling está em **modo de acesso por clique** (piloto): a tela de entrada lista as
pessoas e você entra clicando na sua. Para voltar ao magic link por e-mail, Admin → Regras & marca → Modo de acesso
(sem `RESEND_API_KEY` o link é mostrado na tela e no console da API).

| Papel | E-mail |
|---|---|
| Admin/CEO | iran@feeling.com.br |
| Gestores | camila@feeling.com.br · diego@feeling.com.br |
| Colaboradores | ana@, bruno@, carla@, eduardo@, fernanda@, gabriel@, helena@, igor@, juliana@, lucas@, marina@, rafael@ (…@feeling.com.br) |

Docs da API: http://localhost:3001/api/docs (OpenAPI gerada dos schemas zod).

## Testes

```bash
npm test     # vitest + supertest contra feeling_gamificacao_test (roda migrations antes)
```

Cobertura dos fluxos críticos: dar reconhecimento (saldo, limite por pessoa, chip obrigatório,
concorrência), validação de missão (crédito só pós-aprovação, idempotência por período, escopo de área)
e fechamento de ciclo (snapshot, ranking com empate, meta coletiva, abertura da próxima temporada,
regras novas só valem no próximo ciclo).

## Estrutura

```
server/
  migrations/            SQL puro (node-pg-migrate)
  src/
    routes/              auth, me, recognitions, missions, cycles, admin, notifications, public
    services/
      recognition.ts     regra de saldo / limite / chip vigente (transação + lock por giver)
      missions.ts        period_key (semana ISO / mês / once), fila, validação
      cycles.ts          abrir/fechar temporada, snapshots, ranking, meta coletiva
      scoreboard.ts      payload único da home (GET /me/home)
      auth.ts            magic link (hash, 15 min) + access 1h + refresh 30d rotativo
      notifications/     módulo isolado: provider.ts (contrato) + webPush.ts + templates.ts
    jobs/                cron horário: lembrete de saldo (qua/sex 10h local), fim de ciclo (3 dias antes)
    seed.ts              tenant Feeling + 15 usuários + chips + missões + reconhecimentos
  tests/                 recognition / missions / cycleClose
web/
  src/
    features/            recognition (grade + chips), missions, cycle (barra), feed, manager (fila, nova missão)
    app/pages/           Home (tela única), Login/Callback, Seasons (histórico), Admin
    lib/                 auth (tokens + refresh), theme (CSS vars do tenant), push (VAPID)
  public/push-sw.js      handler de push/notificationclick importado pelo SW do workbox
```

## Regras de negócio (resumo)

- Moeda é pra **dar**: saldo mensal (default 20), cada reconhecimento custa 5, expira no fim da temporada.
- Receptor ganha pontos = moedas gastas. Postar/reagir não pontua.
- Chip obrigatório, texto opcional (pode ser adicionado depois, só pelo autor).
- Máx. 3 reconhecimentos para a mesma pessoa por temporada; nunca para si mesmo.
- Missão: gestor cria (templates), colaborador marca "Concluí", gestor criador (ou admin) aprova/recusa. Pontos só após aprovação.
- Temporada mensal. Fechamento manual pelo admin gera snapshots, calcula meta coletiva
  (default 80% do time com ≥3 reconhecimentos dados e ≥1 missão validada) e abre a próxima.
- Mudanças de regra no tenant valem a partir da próxima temporada (o ciclo copia as regras ao abrir).
- Nada é apagado: soft delete em tudo; chips têm vigência em vez de exclusão.

## Deploy (Railway + Vercel)

**Piloto Feeling em produção (2026-11-04):** front https://feeling-colab.vercel.app · API https://server-production-6939.up.railway.app
(projeto Railway `skillful-motivation`, serviços `server` + `Postgres`). O `web/vercel.json` faz proxy de `/api/*` para a API, então
a Vercel não precisa de `VITE_API_URL`. O start do serviço roda migrations + seed idempotente + API.

Armadilha: com `NODE_ENV=production` o Railway usa `npm ci` sem devDependencies e o `tsc` some do build (exit 127).
Solução aplicada: variável `NPM_CONFIG_INCLUDE=dev` no serviço.

Pré-requisitos uma vez: `railway login` e `npm i -g vercel && vercel login`.

**1. API no Railway** (na raiz do repo)
```bash
railway init                      # cria o projeto (ou railway link num existente)
railway add --database postgres   # Postgres gerenciado; DATABASE_URL é injetada no serviço
railway variables set JWT_SECRET="$(openssl rand -hex 32)" NODE_ENV=production \
  API_URL=https://<servico>.up.railway.app FRONTEND_URL=https://<app>.vercel.app \
  VAPID_SUBJECT=mailto:voce@empresa.com VAPID_PUBLIC_KEY=<pub> VAPID_PRIVATE_KEY=<priv> \
  RESEND_API_KEY=<opcional> MAIL_FROM="Reconhecimento <no-reply@seudominio>"
railway up                        # build: npm run build -w server · start: migrations + node dist/index.js
railway run npm run seed -w server   # uma vez: tenant Feeling, usuários, chips, missões, prêmios
```
Depois ajuste `API_URL` com o domínio gerado (Settings → Networking → Generate Domain) e faça `railway up` de novo:
as URLs das fotos são montadas com `API_URL`.

**2. Web na Vercel** (pasta `web/`)
```bash
cd web && vercel link
vercel env add VITE_API_URL production   # https://<servico>.up.railway.app
vercel --prod
```
Build `npm run build`, output `dist/`. O `vercel.json` já faz o rewrite da SPA. Volte ao Railway e confirme `FRONTEND_URL`
com a URL final da Vercel (CORS aceita também qualquer `*.vercel.app` para previews).

**3. Checklist pós-deploy**
- Abrir `https://<api>/health` e `https://<api>/api/docs`.
- Entrar por clique (piloto) e colocar a foto; conferir que a foto carrega da URL da API.
- Admin → Regras & marca: revisar modo de acesso antes de divulgar fora da agência.
- VAPID: `npx web-push generate-vapid-keys`. Sem as chaves o app funciona, só não envia push.

## Gamificação além dos pontos

- **Classificação ao vivo** na home, visível para todos, com a própria posição destacada (empate = mesma posição).
- **Perfil público** de cada pessoa (clique no ranking, no feed ou no próprio avatar): histórico de temporadas, chips recebidos,
  últimos reconhecimentos, conquistas e sequência semanal. No próprio perfil, upload de foto (recorte quadrado, 256px WebP no Postgres).
- **Conquistas** (sem ponto, só visibilidade): catálogo em `server/src/services/achievements.ts`, avaliadas após reconhecimento,
  missão aprovada e fechamento de ciclo. Notificam quem desbloqueou.
- **Sequência** (🔥): semanas ISO consecutivas em que a pessoa deu ao menos 1 reconhecimento.
- **Catálogo de prêmios** do CEO (Admin → Prêmios & roleta): individual (ranking), time (meta coletiva) e roleta. O app só registra e exibe.
- **Roleta da semana**: quem mais recebeu pontos na semana ISO anterior gira uma vez na semana corrente. Sorteio no servidor,
  ponderado pelo peso; o front só anima até o resultado. Aviso na segunda às 9h (fuso do tenant). Admin marca entrega.

## Marca por tenant (white-label)

Tudo vem de `tenants`: `theme` (claro/escuro), `primary_color`, `logo_url` (fundo claro), `logo_dark_url` (fundo escuro),
`symbol_url` (favicon + ícone PWA, quadrado 512px) e `font_display` (`default` ou `big-shoulders`). O front só usa
tokens semânticos (`bg-card`, `text-fg-muted`, `bg-brand`…) definidos em `web/src/index.css`; o manifest da PWA é
gerado em runtime a partir do tenant.

Piloto Feeling (manual de marca 2026): tema escuro, verde #04D81A só em destaque (botão principal, progresso,
sucesso), Big Shoulders Display nos títulos em caixa alta, Inter como substituta da Proxima Nova (sem licença),
logos oficiais em `web/public/brand/feeling/` (nunca reconstruir o lettering), chips sem cor própria e derivados dos
10 princípios da cultura. O manual não cobre web; as escolhas acima são interpretação dos princípios.

## Fase 2 (já modelado, não implementado)

- Síntese qualitativa mensal com IA sobre `recognitions`, `mission_completions`, `cycle_user_snapshots`, `audit_log`.
- WhatsApp (Evolution API) como novo `NotificationProvider` em `server/src/services/notifications/`.
