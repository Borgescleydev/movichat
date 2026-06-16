# Auditoria Arquitetural — movichat

> App de automação WhatsApp (Next.js 16 / React 19 / Prisma 7 + libSQL/Turso).
> Objetivo: remover 100% os módulos de **Conversas** e **Pipeline**, manter apenas
> **Campanhas/Automação WhatsApp**, diagnosticar lentidão em campanhas e revisar
> gestão de usuários. Auditoria **read-only** — nenhum código foi alterado.

## Mapa de módulos

| Módulo | Páginas | APIs | Componentes | Models Prisma |
|---|---|---|---|---|
| **Conversas** (remover) | `app/conversations/*` | `app/api/conversations/*`, `app/api/messages/*` | — | `Message`; campos `Contact.lastReadAt`, `WhatsAppInstance.conversationsEnabled` |
| **Pipeline** (remover) | `app/pipeline/*` | `app/api/pipeline/*` | `components/kanban/KanbanBoard.tsx` | `PipelineColumn`; campo `Contact.columnId` |
| **Campanhas/Automação** (manter) | `app/campaigns`, `app/individual` | `app/api/campaigns/*`, `app/api/individual/*`, `app/api/cron/*`, `app/api/contact-groups/*` | `components/campaigns/*`, `components/individual/*` | `Campaign*`, `ContactCampaign*`, `MessageTemplate`, `DispatchGroup*`, `ContactGroup*`, `ManualDispatch*` |
| **Usuários/Auth** (revisar) | `app/login`, `app/settings` | `app/api/auth/*`, `app/api/users/*`, `app/api/sessions/*` | `components/settings/SessionsSettings.tsx` | `User`, `UserSession` |
| **Compartilhado** | `app/contacts`, `app/dashboard` | `app/api/contacts/*` | `components/layout/*` | `Contact`, `WhatsAppInstance`, `ApiProvider` |

---

# FASE 2 — Arquivos/pastas a remover (F-2XX)

## F-200 | categoria: funcional | severidade: alta | status: corrigido
- Pasta: `app/conversations/` (`page.tsx`, `ConversationsClient.tsx` — 1895 linhas)
- Motivo: UI do módulo de conversas em tempo real — deve ser removido 100%. A entrada de menu já foi retirada do `Sidebar.tsx`, mas a rota e o client continuam acessíveis.
- **Correção:** pasta `app/conversations/` removida. Commit `b5a3267` — "fix(F-200): remove UI do módulo de conversas — app/conversations".

## F-201 | categoria: funcional | severidade: alta | status: corrigido
- Pasta: `app/api/conversations/` (`route.ts`, `events/route.ts` (SSE), `sync/route.ts`, `[id]/read/route.ts`)
- Motivo: APIs de listagem/sync/SSE de conversas — remover 100%.
- **Correção:** pasta `app/api/conversations/` removida (4 rotas). Commit `2b34e90` — "fix(F-201): remove APIs de conversas — app/api/conversations (route, events SSE, sync, [id]/read)".

## F-202 | categoria: funcional | severidade: alta | status: corrigido
- Pasta: `app/api/messages/` (`route.ts`, `fetch/route.ts`, `[id]/media/route.ts`)
- Motivo: API de mensagens individuais (envio/recebimento/mídia do chat) — pertence a conversas.
- **Correção:** pasta `app/api/messages/` removida (3 rotas). Commit `43c2069` — "fix(F-202): remove API de mensagens do chat — app/api/messages (route, fetch, [id]/media)".

## F-203 | categoria: funcional | severidade: alta | status: corrigido
- Arquivo: `lib/sse-store.ts`
- Motivo: store singleton de clientes SSE usado **apenas** por `app/api/conversations/events` e pela notificação `notifySseClients()` no webhook. Sem conversas em tempo real, fica órfão. Consumidores: `app/api/conversations/events/route.ts`, `app/api/whatsapp/webhook/route.ts:152`.
- **Correção:** `lib/sse-store.ts` removido. Commit `95fd056` — "fix(F-203): remove store SSE órfão — lib/sse-store.ts".
- **IMPORT QUEBRADO RESTANTE (não corrigido — fora do meu cluster, pertence a F-212):** `app/api/whatsapp/webhook/route.ts:4` ainda importa `@/lib/sse-store` (`error TS2307: Cannot find module '@/lib/sse-store'`). Outro resolvedor deve remover esse import e a chamada `notifySseClients()`.

## F-204 | categoria: funcional | severidade: alta | status: aberto
- Arquivo: `prisma/schema.prisma` — model `Message` (linhas 68-80) e relação `Contact.messages` (linha 62)
- Motivo: tabela de mensagens do chat. Remover model + relação. **Atenção:** `onDelete: Cascade` em `Message.contact` some junto.

## F-205 | categoria: funcional | severidade: media | status: aberto
- Arquivo: `prisma/schema.prisma` — campos `Contact.lastReadAt` (l.55) e `WhatsAppInstance.conversationsEnabled` (l.117)
- Motivo: flags exclusivas de conversas (controle de não-lidas e habilitar chat por instância).

## F-206 | categoria: funcional | severidade: alta | status: aberto
- Arquivo: `app/pipeline/page.tsx`
- Motivo: página do funil/kanban — remover 100%. Item de menu "Pipeline" em `components/layout/Sidebar.tsx:20-23` também deve sair.

## F-207 | categoria: funcional | severidade: alta | status: aberto
- Arquivo: `components/kanban/KanbanBoard.tsx` (286 linhas; usa `@hello-pangea/dnd`)
- Motivo: board drag-and-drop do pipeline — único consumidor de `@hello-pangea/dnd`.

## F-208 | categoria: funcional | severidade: alta | status: aberto
- Pasta: `app/api/pipeline/` (`route.ts`, `[id]/route.ts`)
- Motivo: CRUD de colunas do pipeline — remover 100%.

## F-209 | categoria: funcional | severidade: alta | status: aberto
- Arquivo: `prisma/schema.prisma` — model `PipelineColumn` (l.34-44), relação `PipelineColumn.contacts` e campo obrigatório `Contact.columnId` + relação `Contact.column` (l.52, 59)
- Motivo: estrutura do funil. **BLOQUEADOR:** `Contact.columnId` é NOT NULL e referenciado na criação de contatos pelo webhook (`app/api/whatsapp/webhook/route.ts:113-127`) e provavelmente em `app/contacts` e `app/api/contacts`. Remover exige tornar a criação de contato independente de coluna.

## F-210 | categoria: dependência | severidade: media | status: aberto
- Arquivo: `package.json` — `@hello-pangea/dnd` (^18.0.1)
- Motivo: dependência usada exclusivamente pelo `KanbanBoard` (pipeline). Pode ser removida após F-207. `socket.io`/`socket.io-client` também merecem verificação — checar se algo além de conversas os usa antes de remover.

## F-211 | categoria: funcional | severidade: media | status: aberto
- Arquivo: `lib/auth.ts:15-23` — interface `UserPerms` campos `conversations` e `pipeline`
- Motivo: permissões dos módulos removidos. Limpar também os guards `hasPermission(user, "conversations"|"pipeline")` em `app/conversations/page.tsx:9` e `app/pipeline/page.tsx:9`, e a UI de permissões em `app/settings/SettingsClient.tsx`.

## F-212 | categoria: funcional | severidade: alta | status: aberto
- Arquivo: `app/api/whatsapp/webhook/route.ts` — função `handleIncomingMessage` (l.100-154)
- Motivo: acoplamento. O webhook (1) persiste `Message`, (2) cria `Contact` via `PipelineColumn` default, (3) chama `notifySseClients`. Ao remover conversas+pipeline, toda a lógica de mensagem/SSE sai e a criação de contato precisa parar de depender de `PipelineColumn`. Manter apenas o tratamento de `status`/`qrcode` (l.69-91), que é infra de WhatsApp.

## F-213 | categoria: funcional | severidade: alta | status: aberto
- Arquivo: `app/dashboard/page.tsx`
- Motivo: o dashboard depende de `prisma.message.count()` (l.12, card "Mensagens") e de `prisma.pipelineColumn.findMany` com `_count.contacts` (l.13 + bloco "Pipeline" l.45-59). Precisa ser reescrito para não referenciar os models removidos.

## F-214 | categoria: funcional | severidade: media | status: aberto
- Arquivo: `app/contacts/ContactsClient.tsx` e `app/api/contacts/route.ts` + `app/api/contacts/[id]/route.ts`
- Motivo: o módulo "Contatos" é mantido, mas usa `columnId`/colunas do pipeline (apareceu no grep de `columnId`). Requer adaptação para sobreviver sem `PipelineColumn`. Revisar antes de dropar o campo (ver F-209).

---

# FASE 3 — Diagnóstico de performance (campanhas) (F-3XX)

## F-300 | categoria: performance | severidade: alta | status: corrigido
- Arquivo: `app/api/campaigns/route.ts:22-32`
- Problema: **N+1 de queries**. Para cada campanha são feitas 3 `count` (`sent`/`failed`/`pending`) dentro de `Promise.all(campaigns.map(...))` → `3N + 1` queries por carregamento da lista. Com Turso (libSQL remoto), cada query tem latência de rede; a lista de campanhas fica lenta proporcionalmente ao número de campanhas.
- Esperado: 1–2 queries totais usando `prisma.campaignDispatch.groupBy({ by: ['campaignId','status'], where: { campaignId: { in } }, _count: true })` e agregação em memória.
- Observado: 3 counts por campanha em série de round-trips ao banco remoto.
- **Correção:** N+1 substituído por 1 `groupBy` de status sobre os IDs da página; adicionada paginação (`?page`/`?limit`, default 20, máx 100) com `skip`/`take` + `count`. Resposta agora `{ data, total, page, limit }`. Consumidores `CampaignsTab.tsx` e `ManualDispatch.tsx` ajustados para ler `json.data`.

## F-301 | categoria: performance | severidade: alta | status: aberto
- Arquivo: `app/api/individual/campaigns/route.ts:16,22-31`
- Problema: mesmo N+1 do F-300 (`3N+1` counts em `ContactCampaignDispatch`). **Pior:** o `include.contacts` (l.16) carrega TODAS as linhas de `ContactCampaignContact` + dados do `Contact` apenas para calcular `totalContacts: c.contacts.length` (l.29). Campanhas individuais costumam ter milhares de contatos → payload e memória enormes na tela de listagem.
- Esperado: usar `_count: { select: { contacts: true } }` em vez de carregar contatos; agregar dispatches via `groupBy`.
- Observado: carrega lista completa de contatos de cada campanha + 3 counts por campanha.

## F-302 | categoria: performance | severidade: alta | status: aberto
- Arquivo: `app/api/campaigns/[id]/analytics/route.ts:20-32` (consumido por `components/campaigns/CampaignDetail.tsx`)
- Problema: busca TODOS os `campaignDispatch` da campanha sem paginação (`findMany` sem `take`/`skip`) e calcula sent/failed/skipped/pending com `.filter().length` em JS. O `CampaignDetail` faz **polling a cada 8s** (`CampaignDetail.tsx:101`) enquanto a campanha está `running`/`scheduled`, refazendo esse fetch completo a cada ciclo. Campanhas com centenas/milhares de grupos transferem e renderizam tudo repetidamente.
- Esperado: contagens via `groupBy`/`count` no banco; lista de dispatches paginada.
- Observado: full scan dos dispatches + recomputo em JS a cada 8s.

## F-303 | categoria: performance | severidade: media | status: aberto
- Arquivo: `components/campaigns/ManualDispatch.tsx:165-174` e render em `:389`
- Problema: `filteredGroups` é uma IIFE (não memoizada) que **filtra + ordena (`localeCompare`) a cada render** — inclusive a cada tecla digitada no campo de busca (`groupSearch`) e a cada toggle de seleção. A lista é renderizada com `.map()` **sem virtualização** (l.389). Contas WhatsApp com centenas/milhares de grupos travam a digitação e a rolagem.
- Esperado: `useMemo` para `filteredGroups` (deps: `groups`, `groupSearch`, `groupSort`, `selectedGroups`) + lista virtualizada (ex.: react-window) ou paginação.
- Observado: re-sort O(n log n) em cada keystroke e render de todos os itens no DOM.

## F-304 | categoria: performance | severidade: media | status: aberto
- Arquivo: `components/campaigns/CampaignDetail.tsx:347-372`
- Problema: lista de envios (`filteredDispatches.map`) renderizada sem virtualização, alimentada pelo payload completo do F-302 e atualizada a cada 8s. DOM cresce com o nº de grupos.
- Esperado: virtualização + dados paginados vindos da API.
- Observado: render integral da lista de dispatches a cada poll.

## F-305 | categoria: performance | severidade: media | status: aberto
- Arquivo: `lib/auth.ts:81-86`
- Problema: o comentário diz "Touch lastActiveAt at most once per minute", mas o código dispara `prisma.userSession.update({ lastActiveAt: now })` (fire-and-forget) em **toda requisição autenticada** — não há throttle de 1 min. Como `getAuthUser` roda em praticamente todas as rotas/páginas (incl. polling de 8s do CampaignDetail e do dashboard), gera escrita no banco a cada hit, somando latência e carga no Turso.
- Esperado: só gravar se `lastActiveAt` for mais antigo que ~60s (condição `where` com cutoff) — como o comentário promete.
- Observado: 1 UPDATE por requisição autenticada, sem throttle.

## F-306 | categoria: performance | severidade: media | status: aberto
- Arquivo: `components/campaigns/ManualDispatch.tsx:148-156` (`handleFileSelect` → `readAsDataURL`)
- Problema: arquivos de mídia são lidos como **base64 data URL em memória** e enviados no corpo da requisição (e templates guardam `mediaUrl` como data URL — ver `MessageTemplate.mediaUrl`). Vídeos/documentos grandes inflam memória do navegador e payload do POST (base64 = +33%), podendo travar a aba e estourar limites de body.
- Esperado: upload para storage (ex.: Vercel Blob) e tráfego por URL/streaming.
- Observado: mídia inteira em base64 no cliente e no payload.

## F-307 | categoria: performance | severidade: baixa | status: aberto
- Arquivo: `components/campaigns/CampaignsTab.tsx:78-85,123-125`
- Problema: (1) filtragem dupla — a API já filtra por `?status=` (`loadCampaigns`) e o cliente refiltra (`filtered`), recarregando do servidor a cada troca de filtro em vez de filtrar em memória; (2) `setLoading(false)` fora de `try/finally` em `loadCampaigns` (l.78-83) → se o `fetch` lançar, o spinner fica preso. Mesmo padrão em `CampaignDetail.load` (l.87-91) e `ManualDispatch`.
- Esperado: filtrar no cliente sobre um único fetch, e `finally { setLoading(false) }`.
- Observado: refetch por filtro + risco de loading travado.

---

# FASE 4 — Gestão de usuários (F-4XX)

**Modelo:** JWT (`jsonwebtoken`, 7d) em cookie `auth-token`; sessões rastreadas em `UserSession` (revogáveis via `jti`). Papéis: `superadmin` > `admin` > `agent`. Permissões por usuário em `User.permissions` (JSON), opt-out por padrão exceto `individual` (opt-in). Visibilidade de dados: **só `superadmin` vê tudo**; admin e agente são escopados aos próprios ativos (`createdById` / `ownerId`).

## F-400 | categoria: segurança | severidade: alta | status: aberto
- Arquivo: `app/api/users/[id]/route.ts:65` e `app/api/users/route.ts:34-39`
- Problema: **escalonamento de privilégio.** No PATCH, `if (body.role !== undefined && isAdminOrAbove && !isSelf) data.role = body.role` permite que um **admin** atribua qualquer papel a outro usuário — inclusive `superadmin`. No POST, `role: role || "agent"` aceita `role: "superadmin"` sem restrição para admin. Um admin pode criar/promover um superadmin e assumir controle total.
- Esperado: só `superadmin` pode conceder/alterar o papel `superadmin` (e idealmente `admin`); admin limitado a gerenciar `agent`.
- Observado: admin define qualquer papel via POST e PATCH.

## F-401 | categoria: segurança | severidade: alta | status: aberto
- Arquivo: `app/api/users/[id]/route.ts:64-68`
- Problema: não há proteção do alvo. Um admin pode alterar `role`, `active`, `permissions` e `password` (via PATCH genérico) de **outros admins e do superadmin** (`isAdminOrAbove && !isSelf`). Admin pode **desativar o superadmin** (`active:false`, l.66) ou trocar sua senha.
- Esperado: admin não pode modificar contas de papel igual/superior; ações sobre `superadmin` restritas a `superadmin`.
- Observado: PATCH sem verificação do papel do alvo.

## F-402 | categoria: segurança | severidade: alta | status: aberto
- Arquivo: `lib/auth.ts:5`
- Problema: `const JWT_SECRET = process.env.JWT_SECRET || "movichat-secret-2024"`. Se a env não estiver definida em produção, o segredo é público/conhecido → qualquer um pode forjar tokens válidos para qualquer usuário/papel.
- Esperado: falhar o boot se `JWT_SECRET` ausente em produção; nunca usar fallback hardcoded.
- Observado: fallback estático embutido no código.

## F-403 | categoria: segurança | severidade: media | status: aberto
- Arquivo: `app/api/users/route.ts:28-33` e `app/api/users/[id]/route.ts:67`
- Problema: sem validação de força/comprimento de senha na criação e na troca (`hashPassword(password)` aceita qualquer string, incl. vazia no POST — só o PATCH checa `.trim()`). Também não há checagem de `password` obrigatório no POST.
- Esperado: validar comprimento mínimo e exigir senha no cadastro.
- Observado: senhas arbitrárias aceitas.

## F-404 | categoria: usabilidade | severidade: baixa | status: aberto
- Arquivo: `lib/auth.ts:40-43` (`isSuperAdmin`) aplicado em `app/api/campaigns/route.ts:10`, `app/api/individual/campaigns/route.ts:10`, etc.
- Problema/observação: a visibilidade escopa admin **e** agente por `createdById` próprio — apenas `superadmin` enxerga todas as campanhas/recursos. Isso significa que um admin **não** vê campanhas criadas por seus agentes, o que pode contradizer a expectativa de "administrador" gerenciar a equipe. Confirmar se é o comportamento desejado (o comentário em `auth.ts:40` afirma que sim).
- Esperado: definir explicitamente se admin deve ver os ativos de seus agentes.
- Observado: admin restrito aos próprios registros.

## F-405 | categoria: segurança | severidade: baixa | status: aberto
- Arquivo: `app/api/whatsapp/webhook/route.ts:11-18`
- Problema: cada webhook recebido grava o payload bruto (até 4000 chars) em `SystemSettings(id="webhook_debug")` a cada chamada. Em produção com tráfego real, é escrita constante no banco e pode reter dados sensíveis de mensagens. (Impacto também de performance.)
- Esperado: logging de debug desligável/limitado.
- Observado: upsert de debug em todo webhook.

---

# Resumo executivo

### Remoção (Conversas + Pipeline)
**Conversas:** `app/conversations/`, `app/api/conversations/`, `app/api/messages/`, `lib/sse-store.ts`, model `Message`, campos `Contact.lastReadAt` e `WhatsAppInstance.conversationsEnabled`, lógica de mensagem/SSE no webhook.
**Pipeline:** `app/pipeline/`, `components/kanban/KanbanBoard.tsx`, `app/api/pipeline/`, model `PipelineColumn`, campo `Contact.columnId`, item de menu Pipeline, dep `@hello-pangea/dnd`.
**Acoplamentos a tratar:** `Contact.columnId` é NOT NULL e usado na criação de contatos (webhook + contatos); `app/dashboard/page.tsx` depende de `Message.count` e `PipelineColumn`; permissões `conversations`/`pipeline` em `lib/auth.ts` e `SettingsClient`; verificar `socket.io` antes de remover.

### Top 3 problemas de performance
1. **N+1 nas listas de campanhas** (`/api/campaigns` e `/api/individual/campaigns`): `3N+1` counts por carregamento; a versão individual ainda carrega todos os contatos só pra contar (F-300, F-301).
2. **Analytics + polling 8s sem paginação/virtualização** (`/api/campaigns/[id]/analytics` + `CampaignDetail`): full scan de dispatches e re-render completo a cada 8s (F-302, F-304).
3. **Lista de grupos no Disparo Manual** (`ManualDispatch`): `filteredGroups` re-ordenada a cada keystroke sem `useMemo` e renderizada sem virtualização (F-303). Bônus crítico: `lib/auth.ts` grava `lastActiveAt` em TODA requisição apesar do comentário prometer throttle (F-305).

### Gestão de usuários
JWT 7d + sessões revogáveis; papéis superadmin/admin/agent com permissões JSON por usuário; dados escopados por dono (só superadmin vê tudo). **Riscos altos:** admin pode promover/criar `superadmin` e alterar/desativar contas de admins e do superadmin (escalonamento — F-400/F-401); `JWT_SECRET` com fallback hardcoded (F-402). **Médios/baixos:** sem validação de senha (F-403), visibilidade de admin restrita aos próprios ativos pode não atender a gestão de equipe (F-404), debug do webhook grava payloads continuamente (F-405).
