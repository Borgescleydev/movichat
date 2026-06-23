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

## F-204 | categoria: funcional | severidade: alta | status: corrigido
- Arquivo: `prisma/schema.prisma` — model `Message` (linhas 68-80) e relação `Contact.messages` (linha 62)
- Motivo: tabela de mensagens do chat. Remover model + relação. **Atenção:** `onDelete: Cascade` em `Message.contact` some junto.
- **Correção:** model `Message` e relação `Contact.messages` removidos (`prisma/schema.prisma`). Schema sincronizado via `npx prisma db push --accept-data-loss` — `migrate dev` falhou com **P3006** por histórico de migrations pré-existente quebrado (shadow DB sem tabela `Campaign` na migration `20260511020000_campaign_scheduling`), não relacionado a esta mudança. Commit `164faca` — "fix(F-230): remove models Message e PipelineColumn do schema Prisma".

## F-205 | categoria: funcional | severidade: media | status: corrigido
- Arquivo: `prisma/schema.prisma` — campos `Contact.lastReadAt` (l.55) e `WhatsAppInstance.conversationsEnabled` (l.117)
- Motivo: flags exclusivas de conversas (controle de não-lidas e habilitar chat por instância).
- **Correção:** `Contact.lastReadAt` e `WhatsAppInstance.conversationsEnabled` removidos do schema. Commit `164faca`. UI do toggle de conversas por instância também removida de `components/settings/ProvidersSettings.tsx` (commit `3fbeb87`).

## F-206 | categoria: funcional | severidade: alta | status: corrigido
- Arquivo: `app/pipeline/page.tsx`
- Motivo: página do funil/kanban — remover 100%. Item de menu "Pipeline" em `components/layout/Sidebar.tsx:20-23` também deve sair.
- **Correção:** pasta `app/pipeline/` removida. Item de menu "Pipeline" em `components/layout/Sidebar.tsx:20-23` removido por este cluster — commit `6e22ef6` — "fix(F-220): remove itens de menu conversas e pipeline do Sidebar" (item "Conversas" já não existia no Sidebar).

## F-207 | categoria: funcional | severidade: alta | status: corrigido
- Arquivo: `components/kanban/KanbanBoard.tsx` (286 linhas; usa `@hello-pangea/dnd`)
- Motivo: board drag-and-drop do pipeline — único consumidor de `@hello-pangea/dnd`.
- **Correção:** pasta `components/kanban/` removida.

## F-208 | categoria: funcional | severidade: alta | status: corrigido
- Pasta: `app/api/pipeline/` (`route.ts`, `[id]/route.ts`)
- Motivo: CRUD de colunas do pipeline — remover 100%.
- **Correção:** pasta `app/api/pipeline/` removida (2 rotas).

## F-209 | categoria: funcional | severidade: alta | status: corrigido
- Arquivo: `prisma/schema.prisma` — model `PipelineColumn` (l.34-44), relação `PipelineColumn.contacts` e campo obrigatório `Contact.columnId` + relação `Contact.column` (l.52, 59)
- Motivo: estrutura do funil. **BLOQUEADOR:** `Contact.columnId` é NOT NULL e referenciado na criação de contatos pelo webhook (`app/api/whatsapp/webhook/route.ts:113-127`) e provavelmente em `app/contacts` e `app/api/contacts`. Remover exige tornar a criação de contato independente de coluna.
- **Correção:** model `PipelineColumn`, relação `PipelineColumn.contacts`, campo `Contact.columnId` e relação `Contact.column` removidos do schema. Commit `164faca`. Webhook deixou de depender de `PipelineColumn` para criar contatos (commit `d67884b`, F-212).
- **precisa-decisão (fora do meu cluster):** ainda restam referências quebradas a `columnId`/`PipelineColumn` que NÃO compilam após o drop, pertencentes a F-214 e correlatos: `app/api/contacts/route.ts:40,47` (`prisma.pipelineColumn.findFirst`, cria contato com `columnId`), `app/api/contacts/[id]/route.ts:36` (`columnId` no update), `app/api/contact-groups/[id]/route.ts:18` (select de `columnId`), `components/individual/ContactCampaignForm.tsx` (fetch `/api/pipeline` + filtro por `columnId`) e `app/contacts/ContactsClient.tsx`. Resolvedor do módulo Contatos (F-214) deve adaptar essas chamadas.
- **Resíduos de Message/conversationsEnabled/PipelineColumn corrigidos (cluster F-209):** `app/api/providers/[id]/route.ts` (removido `prisma.message.deleteMany`), `app/api/providers/[id]/instances/[instanceId]/route.ts` (removido `prisma.message.deleteMany` + `conversationsEnabled` do update), `app/api/campaigns/groups/[id]/collect-contacts/route.ts` (removido `prisma.pipelineColumn.findFirst` + `columnId` na criação de contato), `app/api/contacts/route.ts` e `app/api/contacts/[id]/route.ts` (removidos includes `messages`), `lib/seed.ts` e `app/api/auth/login/route.ts` (removido seed/bootstrap de `pipelineColumn`), `lib/migrations.ts` (removidas migrations de `conversationsEnabled`, ALTERs de `Message` e UPDATE global de conversas). `npx tsc --noEmit` não reporta mais nenhum erro relacionado a Message/PipelineColumn/columnId/conversationsEnabled. Erros residuais NÃO relacionados (fora deste cluster): `lib/auth.ts:47,52` (tipagem de JWT, pré-existente) e validadores stale em `.next/types/` referenciando rotas de conversations/messages/pipeline já removidas por outros clusters (regeneram no build).

## F-210 | categoria: dependência | severidade: media | status: corrigido
- Arquivo: `package.json` — `@hello-pangea/dnd` (^18.0.1)
- Motivo: dependência usada exclusivamente pelo `KanbanBoard` (pipeline). Pode ser removida após F-207. `socket.io`/`socket.io-client` também merecem verificação — checar se algo além de conversas os usa antes de remover.
- **Correção:** `@hello-pangea/dnd`, `socket.io` e `socket.io-client` removidos de `package.json`. Verificado via grep que `socket.io` NÃO é usado em nenhum arquivo `.ts/.tsx` (só aparecia em package.json/lock e no contrato) — eram resquícios de conversas em tempo real. `npm install --legacy-peer-deps` rodado: 27 pacotes removidos, `package-lock.json` atualizado.

## F-211 | categoria: funcional | severidade: media | status: corrigido
- Arquivo: `lib/auth.ts:15-23` — interface `UserPerms` campos `conversations` e `pipeline`
- Motivo: permissões dos módulos removidos. Limpar também os guards `hasPermission(user, "conversations"|"pipeline")` em `app/conversations/page.tsx:9` e `app/pipeline/page.tsx:9`, e a UI de permissões em `app/settings/SettingsClient.tsx`.
- **Correção:** campos `conversations` e `pipeline` removidos de `UserPerms` (`lib/auth.ts:15`) — commit `f0a09c7`. Os guards estavam em `app/conversations/page.tsx` e `app/pipeline/page.tsx`, ambas pastas já removidas por outros clusters. UI de permissões: grupos `conversations`/`pipeline`, aba e componente `PipelineSettings`, e tipo `Column` órfão removidos de `app/settings/SettingsClient.tsx` (commit `5f7b2e7`); toggle de conversas removido de `components/settings/ProvidersSettings.tsx` (commit `3fbeb87`); textos residuais em `app/settings/page.tsx` e `app/layout.tsx` atualizados (commit `23c77df`).

## F-212 | categoria: funcional | severidade: alta | status: corrigido
- Arquivo: `app/api/whatsapp/webhook/route.ts` — função `handleIncomingMessage` (l.100-154)
- Motivo: acoplamento. O webhook (1) persiste `Message`, (2) cria `Contact` via `PipelineColumn` default, (3) chama `notifySseClients`. Ao remover conversas+pipeline, toda a lógica de mensagem/SSE sai e a criação de contato precisa parar de depender de `PipelineColumn`. Manter apenas o tratamento de `status`/`qrcode` (l.69-91), que é infra de WhatsApp.
- **Correção:** removido o import `@/lib/sse-store` (resolve também o import quebrado citado em F-203), a dedup/persistência de `Message`, a chamada a `notifySseClients` e a dependência de `PipelineColumn` na criação de contato. `handleIncomingMessage` agora só cria/atualiza `Contact` (params `waMessageId`/`mediaBase64`/`mediaType` removidos). Tratamento de `status`/`qrcode` intacto. Commit `d67884b` — "fix(F-205): remove persistência de Message e SSE do webhook".

## F-213 | categoria: funcional | severidade: alta | status: corrigido
- Arquivo: `app/dashboard/page.tsx`
- Motivo: o dashboard depende de `prisma.message.count()` (l.12, card "Mensagens") e de `prisma.pipelineColumn.findMany` com `_count.contacts` (l.13 + bloco "Pipeline" l.45-59). Precisa ser reescrito para não referenciar os models removidos.
- **Correção:** `prisma.message.count()` e `prisma.pipelineColumn.findMany` removidos; cards "Mensagens" e "Colunas do Pipeline" substituídos por "Campanhas" (`prisma.campaign.count()`); bloco de listagem do pipeline removido. Commit `56f5dc8` — "fix(F-231): remove dependências de Message e Pipeline do dashboard".

## F-214 | categoria: funcional | severidade: media | status: corrigido
- Arquivo: `app/contacts/ContactsClient.tsx` e `app/api/contacts/route.ts` + `app/api/contacts/[id]/route.ts`
- Motivo: o módulo "Contatos" é mantido, mas usa `columnId`/colunas do pipeline (apareceu no grep de `columnId`). Requer adaptação para sobreviver sem `PipelineColumn`. Revisar antes de dropar o campo (ver F-209).
- **Correção:** referências a `columnId`/`PipelineColumn` removidas de `app/api/contacts/route.ts` (commit `88a7d92`), `app/api/contacts/[id]/route.ts` (`1a60855`), `app/api/contact-groups/[id]/route.ts` (`f4768fe`), `components/individual/ContactCampaignForm.tsx` (`afc6f88`) e `app/contacts/ContactsClient.tsx` (`98b39bd`). Removidos: query `prisma.pipelineColumn.findFirst`, fetch a `/api/pipeline`, includes/selects de `column`, e UI de filtro/seleção por coluna do funil.

## F-215 | categoria: funcional | severidade: alta | status: verificado
- Tela: `components/campaigns/ManualDispatch.tsx:169-195` (effect de "Apply template") + `:282-283,286,317-318` (`effectiveMedia`/`hasMedia`/`canSend`/`dispatch`). Regressão introduzida pelo F-702 (commit `4693206`).
- Passos: 1) Disparo Manual → "Compor Disparo", instância conectada, ≥1 grupo selecionado. 2) No seletor de templates, escolher um template que tem **corpo de texto E mídia** (mediaType ≠ null). 3) **Imediatamente** clicar em "Disparar Agora" (antes do fetch de `/api/campaigns/templates/[id]` resolver — janela maior quanto maior o base64 da mídia).
- Esperado: o disparo deve incluir a mídia do template (ou ser bloqueado até a mídia carregar), nunca enviar silenciosamente só o texto.
- Observado: o effect (`:174-195`) seta `setMessage(tpl.body)` e `setMediaUrl("")` **sincronicamente**, mas só preenche `mediaUrl` via `fetch` assíncrono (`:184-187`). Durante essa janela, `effectiveMedia = mediaUrl = ""` (`:282`, pois `mediaInputMode` é forçado a `"url"` em `:177`), logo `hasMedia = mediaTab !== "none" && "".trim() = false` (`:283`). Como `message` já recebeu `tpl.body` (não-vazio), `canSend` fica `true` (`:286`, satisfeito por `message.trim()`), o botão "Disparar Agora" fica habilitado e `dispatch()` envia `mediaType: undefined`/`mediaUrl: undefined` (`:317-318`). Resultado: **broadcast de texto-only para N grupos, sem a mídia, sem nenhum erro/aviso** — efeito irreversível no WhatsApp. Antes do F-702 a listagem já trazia `mediaUrl`, então o template era aplicado de forma síncrona e não havia janela de corrida. (Caso template **só com mídia, sem corpo**: `message=""` → `canSend=false` até a mídia carregar, então esse subcaso fica protegido; o bug atinge o caso comum de template com texto + mídia.)
- Esperado (fix): bloquear o envio enquanto a mídia do template está carregando (ex.: flag `mediaLoading` que entra no `canSend`/desabilita o botão), ou validar em `dispatch()` que, havendo `mediaTab !== "none"`, `effectiveMedia` não está vazio antes de prosseguir.
- **Correção (resolvedor):** duas camadas em `components/campaigns/ManualDispatch.tsx` (commit `6c1bf8f`):
  1. Novo estado `mediaLoading` (`useState(false)`): no effect "Apply template", para template com `mediaType` faz `setMediaLoading(true)` antes do fetch e `setMediaLoading(false)` no `finally` (respeitando a flag `cancelled` do cleanup); template só-texto garante `setMediaLoading(false)`. `mediaLoading` entra na condição `canSend` (`&& !mediaLoading`), desabilitando o botão "Disparar Agora" enquanto a mídia carrega, com indicador visual "Carregando mídia..." no estilo dos outros spinners.
  2. Guarda defensiva no início de `dispatch()`: se `mediaTab !== "none"` e `effectiveMedia` estiver vazio, aborta com `setSendError("A mídia ainda está carregando. Aguarde um instante e tente novamente.")` — nunca dispara texto-only quando deveria ter mídia.
  - Bônus: ao selecionar template SEM `mediaType`, reseta campos de mídia stale (`mediaTab="none"`, `mediaCaption=""`, `mediaUrl=""`) para não herdar mídia de seleção anterior.
  - Validado com `npx tsc --noEmit` (exit 0, sem erros). Caminho normal preservado: template só-texto envia normalmente; template com mídia envia a mídia após o fetch resolver.
- **Re-revisão estática (REPROVADO) — brecha nova introduzida pelo fix `6c1bf8f`, severidade media:** a regressão *original* (broadcast texto-only sem mídia) está fechada — a guarda em `dispatch()` (`ManualDispatch.tsx:306`) e o `&& !mediaLoading` em `canSend` (`:298`) impedem o envio de mídia vazia. **Porém o mecanismo `mediaLoading` pode ficar preso em `true` permanentemente, travando o botão "Disparar Agora" para sempre.** Passos: 1) selecionar template **com `mediaType`** → effect (`:175`) faz `setMediaLoading(true)` (`:185`) e inicia o fetch de `/api/campaigns/templates/[id]`. 2) **Antes do fetch resolver**, deselecionar o template — botão "✕" (`:541`) ou voltar o `<select>` para "Usar template..." (`:537`), ambos fazem `setSelectedTemplate("")`. 3) O effect re-roda com `selectedTemplate === ""` e cai no early-return `if (!selectedTemplate) return;` (`:171`), que **não** reseta `mediaLoading`. O cleanup anterior já setou `cancelled = true` (`:199`), então o `finally` do fetch antigo pula `setMediaLoading(false)` (`:196`, guardado por `!cancelled`). Resultado: `mediaLoading` permanece `true` indefinidamente → `canSend=false` (`:298`) e botão preso em "Carregando mídia..." (`:699`), bloqueando inclusive disparos de texto manual digitados depois, até o usuário reselecionar um template. A janela é ampliada justamente para templates com mídia base64 pesada (motivo do fetch sob demanda do F-702). **Fix sugerido:** resetar `mediaLoading` (e mídia stale) também no caminho `!selectedTemplate` — ex.: mover `setMediaLoading(false)` para antes/dentro do early-return `:171`, ou usar um `useEffect` de cleanup que zere `mediaLoading` ao desmontar/trocar. Demais pontos OK: ordem de `mediaTab`/`mediaUrl` no effect é síncrona/batched (`:176`,`:184-185`), sem furo na guarda; caminho normal (só-texto e mídia-após-carregar) intacto; sem loops de effect ou setState pós-unmount no caminho com mídia.
- **Correção da brecha reaberta (resolvedor):** no effect "Apply template" (`components/campaigns/ManualDispatch.tsx`), o early-return `if (!selectedTemplate)` deixou de retornar sem limpar o estado. Agora, antes de retornar, reseta `mediaTab="none"`, `mediaCaption=""`, `mediaUrl=""` e — o essencial — `setMediaLoading(false)`. Assim, ao desselecionar o template (botão "✕" ou voltar o `<select>`) durante o carregamento da mídia, o `mediaLoading` é zerado pelo novo effect mesmo que o `finally` do fetch antigo tenha sido pulado por `cancelled=true`. O botão "Disparar Agora" não fica mais preso em "Carregando mídia..." e disparos de texto voltam a ser possíveis. Mantidos intactos: gating `!mediaLoading` no `canSend`, guarda em `dispatch()` (`mediaTab !== "none" && !effectiveMedia → aborta`), set síncrono de `mediaTab`/`mediaUrl` antes do fetch e o caminho normal (só-texto envia; com-mídia envia após carregar). Validado com `npx tsc --noEmit` (exit 0, sem erros).
- **Re-revisão estática FINAL (APROVADO) — commit `d14d4d9`:** F-215 fechado, sem novas brechas. (1) **Destravamento confirmado:** ao desselecionar o template durante o fetch, o effect re-roda com `selectedTemplate===""`, cai no early-return (`ManualDispatch.tsx:171`) e executa `setMediaLoading(false)` (`:179`) ANTES do `return`. Esse reset é independente do `finally` do fetch antigo (`:206`), que é pulado por `cancelled=true` (`:209`). Não resta caminho que deixe `mediaLoading` preso. (2) **Sem regressão reintroduzida:** gating `!mediaLoading` no `canSend` (`:308`), guarda no `dispatch()` (`:316`), set síncrono `mediaTab`/`mediaUrl=""` antes do fetch (`:186`,`:194-195`) e caminho normal (só-texto `:213-216`; com-mídia após fetch `:201-206`) intactos; regressão original (broadcast texto-only) segue fechada. (3) **Reset no early-return sem efeitos colaterais nocivos:** só dispara quando `!selectedTemplate`; setStates são síncronos no corpo do effect (sem setState pós-unmount nem async); deps `[selectedTemplate, templates]` não geram loop (o reset não altera nenhuma dep). Observação não-bloqueante: `templates` é setado uma única vez no mount (`:131`, sem reloads), então a única re-execução com `selectedTemplate===""` é a da resolução inicial de `templates`; só haveria limpeza de mídia manual legítima na janela sub-segundo entre mount e essa resolução — risco teórico desprezível, não é regressão do F-215. (4) **Caminho `if (!tpl) return` (`:183`) não precisa resetar `mediaLoading`:** `tpl` só é `undefined` se `selectedTemplate` (não-vazio) referenciar um id ausente de `templates`; como as options do `<select>` (`:544`) vêm de `templates` e este carrega uma única vez, não há fluxo real em que o id selecionado deixe de existir, nem em que `mediaLoading` esteja `true` nesse ponto (ele só vira `true` ao aplicar um template com mídia, que por definição foi encontrado). Adicionar reset ali seria defesa redundante; não há vazamento alcançável. Veredito: **APROVADO — F-215 fechado**.

---

# FASE 2b — Gatilho e execução dos dispatchers / "agendamento não funciona" (F-2XX)

> Revisão estática read-only do mecanismo de **gatilho** (cron) e da **execução** dos
> dispatchers (`runCampaignDispatcher`/`runContactDispatcher`/`runManualDispatcher`/`runQuickDispatcher`).
> Sintoma relatado: "o sistema de agendamento não está funcionando".

## F-216 | categoria: funcional | severidade: alta | status: decisão-aceita
- Arquivos: `vercel.json:1` (conteúdo literal `{}`), ausência de `vercel.ts`/`vercel.config.*`, `app/api/cron/campaign-dispatcher/route.ts:7` (único `GET` que roda os 4 dispatchers).
- **CAUSA-RAIZ MAIS PROVÁVEL do "agendamento não funciona" — confiança ALTA.** Não existe NENHUM gatilho de schedule no código: `vercel.json` é `{}` (sem chave `crons`) e não há `vercel.ts`. O endpoint `/api/cron/campaign-dispatcher` (que invoca `runCampaignDispatcher`/`runContactDispatcher`/`runManualDispatcher`/`runQuickDispatcher` em `Promise.all`, `route.ts:18-23`) só dispara quando ALGO o chama periodicamente. O mecanismo PRETENDIDO é um **cron externo** (cron-job.org), conforme a própria UI documenta (`components/settings/CronSettings.tsx:212` badge "Cron externo", `:218` "Configure um serviço externo… a cada minuto", `:298-306` aviso de que o plano Hobby do Vercel só permite cron 1x/dia, `:334` URL `https://movichat.vercel.app/api/cron/campaign-dispatcher`). O histórico confirma a intenção: commits `e517b27` "remove minute cron from vercel.json (Hobby plan incompatible)" e `bef2b81` "remove vercel.json cron (Hobby plan — use external cron)".
- Passos: agendar qualquer campanha/disparo (status `scheduled`, dispatches `pending` com `scheduledFor` no futuro) e aguardar a hora — nada é enviado.
- Esperado: na hora agendada, o dispatcher roda e os dispatches `pending` com `scheduledFor <= now` viram `sent`.
- **Decisão (aceita pelo usuário):** manter o design de **cron EXTERNO (cron-job.org)** chamando o endpoint a cada minuto; NÃO adicionar Vercel Cron nativo (sem mexer em `vercel.json`/`vercel.ts`). O trabalho foi tornar esse caminho **confiável e claro** (ver F-217): o endpoint agora retorna 200 com corpo de resumo útil para o painel do cron-job.org, e responde com erro explícito quando a auth falha. **Ação operacional do usuário (fora do código, obrigatória):** definir `CRON_SECRET` nas env vars do Vercel (Production) e criar/ativar em cron-job.org um job GET a cada minuto para `https://movichat.vercel.app/api/cron/campaign-dispatcher` com header `Authorization: Bearer <CRON_SECRET>`.

## F-217 | categoria: funcional | severidade: media | status: corrigido
- Arquivo: `app/api/cron/status/route.ts:44-49` (string cosmética) + `app/api/cron/campaign-dispatcher/route.ts:8-15` (401 silencioso).
- Causa: (a) a resposta do endpoint de status declarava `schedule: "* * * * *"`, `description: "Executa a cada minuto (Vercel Cron Jobs)"` — **contradiz** o mecanismo real (cron externo) e a ausência de `crons` no `vercel.json` (F-216); string puramente cosmética que NÃO cria agendamento. (b) o dispatcher retornava `401 Unauthorized` **sem corpo claro nem log**, tornando o diagnóstico de um cron externo mal configurado quase impossível.
- Esperado: o painel de status deve refletir que o gatilho depende de um cron externo; e a falha de auth deve ser explícita (corpo + log), nunca silenciosa.
- **Correção:**
  - `app/api/cron/status/route.ts`: `schedule: "externo"`, `description: "Acionado por cron externo (cron-job.org) — sem Vercel Cron nativo"` — fim da menção falsa a "Vercel Cron Jobs".
  - `app/api/cron/campaign-dispatcher/route.ts`: auth inválida agora retorna `401` com corpo JSON claro (`{ error: "Cron não autorizado: header Authorization ausente ou CRON_SECRET incorreto" }`) + `console.warn` orientando a configuração (sem vazar o segredo). Em produção, `CRON_SECRET` ausente passa a retornar `503` com mensagem explícita (em vez de deixar o endpoint aberto — ver F-218); fora de produção segue aberto para testes locais com aviso. Resposta de sucesso agora inclui `ok`, `ranAt` e um `summary` agregado (`processed`/`errors`/`skipped`) além dos 4 resultados, dando ao painel do cron-job.org um 200 com corpo útil.
  - `components/settings/CronSettings.tsx`: instruções ajustadas — header `Authorization: Bearer <CRON_SECRET>` marcado como **obrigatório** (método GET, a cada minuto), e a seção do segredo passou de "(recomendado)" para "(obrigatório em produção)" com nota de que o mesmo valor precisa estar nas env vars do Vercel (Production). Botão "Executar agora" intacto.

## F-218 | categoria: segurança | severidade: media | status: aberto
- Arquivo: `app/api/cron/campaign-dispatcher/route.ts:8-15`.
- Causa: a autenticação só passa se `CRON_SECRET` estiver vazio/ausente, OU se vier `Authorization: Bearer <CRON_SECRET>`, OU se vier header `x-vercel-cron: 1`. Dois modos de falha silenciosa: (1) **se `CRON_SECRET` está setado em produção mas o cron externo não envia o header `Authorization` correto** (`:12`), toda chamada retorna 401 (`:13`) e nenhum dispatcher roda — sintoma idêntico ao "agendamento não funciona", sem erro visível no app. O header `x-vercel-cron` NUNCA será "1" num cron externo (só o Vercel Cron o injeta), então a única auth válida para cron-job.org é o Bearer. (2) **Se `CRON_SECRET` NÃO está setado**, o endpoint fica totalmente aberto — qualquer um pode disparar os 4 dispatchers (abuso/gasto). 
- Esperado: gatilho autenticado e funcionando; endpoint não exposto publicamente.
- Observado: ponto único de falha silenciosa entre o cron externo e a execução. **Verificação operacional:** conferir se o header do job no cron-job.org casa exatamente com `CRON_SECRET` de produção. NÃO alterado.

## F-219 | categoria: funcional | severidade: alta | status: aberto
- Arquivos: `lib/campaign-dispatcher.ts:121-128`, `lib/contact-dispatcher.ts:144-151`, `lib/quick-dispatcher.ts:72-79` (terminam em `status: "skipped"`); `lib/manual-dispatcher.ts:46-53` (termina em `status: "failed"`).
- Causa: a checagem `if (instance.status !== "connected")` ocorre **depois** do claim atômico (o dispatch já foi marcado `processing`) e move o registro para um estado **terminal** (`skipped`/`failed`), que NÃO é reselecionado pela query `duePending` (ela só pega `pending` ou `processing`-stale). Logo, se a instância estiver `status !== "connected"` no instante do tick — inclusive por uma desconexão momentânea, ou por o campo `WhatsAppInstance.status` estar desatualizado/nunca ter sido escrito como `"connected"` — o envio é **descartado permanentemente** e nunca reenviado, mesmo após a instância reconectar.
- Passos: 1) campanha/disparo agendado com dispatches `pending` due. 2) no momento do tick, a instância está (ou aparece) desconectada. 3) o tick marca todos os dispatches devidos como `skipped`. 4) instância reconecta — nada é reenviado.
- Esperado: instância desconectada deveria **adiar** o envio (deixar `pending`, como acontece com a janela `windowed` em `campaign-dispatcher.ts:103-106` que faz `skipped++; continue;` SEM claim), para retentar no próximo tick.
- Observado: o dispatch vira `skipped`/`failed` terminal e some da fila silenciosamente. **Caso agravado e possível causa-raiz secundária (confiança média):** se em produção `WhatsAppInstance.status` nunca é mantido como `"connected"` de forma confiável, TODO dispatch é pulado e o "agendamento não funciona" mesmo com o cron rodando. Recomendo verificar (fora da minha área) onde/quando `WhatsAppInstance.status` é setado para `"connected"`. NÃO alterado.

## F-220 | categoria: funcional | severidade: baixa | status: aberto
- Arquivo: `lib/manual-dispatcher.ts:46-53` (instância desconectada) e `:59-66` (nenhum grupo válido).
- Causa: nesses dois ramos o registro é marcado `status: "failed"` porém o contador incrementado é `skipped++` (`:51`, `:65`), enquanto o resultado terminal reportado em `route.ts:24` agrega `skipped`. Inconsistência entre o status persistido (`failed`) e a métrica (`skipped`) — diverge do padrão dos outros dispatchers, onde desconexão → `skipped` (status e métrica coerentes).
- Esperado: status persistido e contador coerentes (ou ambos `failed`, ou ambos `skipped`).
- Observado: métrica enganosa no painel/retorno do cron. Cosmético — não impede envio. NÃO alterado.

## F-221 | categoria: funcional | severidade: baixa | status: verificado-correto
- Arquivos: `lib/campaign-dispatcher.ts:63-118`, `lib/contact-dispatcher.ts:85-141`, `lib/quick-dispatcher.ts:18-69` (claim atômico + staleness, commit `1939637`).
- **Refutação de lead:** investiguei a suspeita de que o "claim atômico com staleness" pudesse (a) nunca casar dispatches, (b) marcar como `processing` e nunca enviar, ou (c) travar claims velhos permanentemente. **Não confirmado — a lógica está correta.** A query `duePending` casa `OR[pending, processing-stale(>5min)]` + `scheduledFor <= now` + `campaign.status in [scheduled,running]` (filtros corretos, sem comparação de data quebrada — `now`/`scheduledFor` são `Date`/instantes UTC, comparados como instantes). O claim re-valida o MESMO `OR` via `updateMany` (`campaign-dispatcher.ts:108-117`) e o `@updatedAt` do Prisma renova `updatedAt` ao marcar `processing`, então: um claim fresco não é re-selecionado por 5 min (sem envio duplo), e um `processing` realmente travado (>5 min) É reselecionado (sem travamento permanente). Não há regressão aqui. Observação (não-bug): a possível divergência de timezone fica na **criação** do `scheduledFor` a partir do `startAt` local do usuário — isso é área F-3XX, não da execução.

---

# FASE 3 — Diagnóstico de performance (campanhas) (F-3XX)

## F-300 | categoria: performance | severidade: alta | status: corrigido
- Arquivo: `app/api/campaigns/route.ts:22-32`
- Problema: **N+1 de queries**. Para cada campanha são feitas 3 `count` (`sent`/`failed`/`pending`) dentro de `Promise.all(campaigns.map(...))` → `3N + 1` queries por carregamento da lista. Com Turso (libSQL remoto), cada query tem latência de rede; a lista de campanhas fica lenta proporcionalmente ao número de campanhas.
- Esperado: 1–2 queries totais usando `prisma.campaignDispatch.groupBy({ by: ['campaignId','status'], where: { campaignId: { in } }, _count: true })` e agregação em memória.
- Observado: 3 counts por campanha em série de round-trips ao banco remoto.
- **Correção:** N+1 substituído por 1 `groupBy` de status sobre os IDs da página; adicionada paginação (`?page`/`?limit`, default 20, máx 100) com `skip`/`take` + `count`. Resposta agora `{ data, total, page, limit }`. Consumidores `CampaignsTab.tsx` e `ManualDispatch.tsx` ajustados para ler `json.data`.

## F-301 | categoria: performance | severidade: alta | status: corrigido
- Arquivo: `app/api/individual/campaigns/route.ts:16,22-31`
- Problema: mesmo N+1 do F-300 (`3N+1` counts em `ContactCampaignDispatch`). **Pior:** o `include.contacts` (l.16) carrega TODAS as linhas de `ContactCampaignContact` + dados do `Contact` apenas para calcular `totalContacts: c.contacts.length` (l.29). Campanhas individuais costumam ter milhares de contatos → payload e memória enormes na tela de listagem.
- Esperado: usar `_count: { select: { contacts: true } }` em vez de carregar contatos; agregar dispatches via `groupBy`.
- Observado: carrega lista completa de contatos de cada campanha + 3 counts por campanha.
- **Correção:** `include.contacts` removido em favor de `_count.contacts` (`totalContacts`); dispatches agregados via 1 `groupBy`. Como o form de edição dependia de `contacts`, `ContactCampaignsTab.openEdit` passou a buscar o detalhe (`GET /api/individual/campaigns/[id]`) sob demanda.

## F-302 | categoria: performance | severidade: alta | status: corrigido
- Arquivo: `app/api/campaigns/[id]/analytics/route.ts:20-32` (consumido por `components/campaigns/CampaignDetail.tsx`)
- Problema: busca TODOS os `campaignDispatch` da campanha sem paginação (`findMany` sem `take`/`skip`) e calcula sent/failed/skipped/pending com `.filter().length` em JS. O `CampaignDetail` faz **polling a cada 8s** (`CampaignDetail.tsx:101`) enquanto a campanha está `running`/`scheduled`, refazendo esse fetch completo a cada ciclo. Campanhas com centenas/milhares de grupos transferem e renderizam tudo repetidamente.
- Esperado: contagens via `groupBy`/`count` no banco; lista de dispatches paginada.
- Observado: full scan dos dispatches + recomputo em JS a cada 8s.
- **Correção:** contagens (sent/failed/skipped/pending/total) agora via 1 `groupBy` por status no banco; lista de dispatches paginada (`?page`/`?limit`, default 100, máx 500) com `skip`/`take`. Resposta inclui `page`/`limit`.

## F-303 | categoria: performance | severidade: media | status: corrigido
- Arquivo: `components/campaigns/ManualDispatch.tsx:165-174` e render em `:389`
- Problema: `filteredGroups` é uma IIFE (não memoizada) que **filtra + ordena (`localeCompare`) a cada render** — inclusive a cada tecla digitada no campo de busca (`groupSearch`) e a cada toggle de seleção. A lista é renderizada com `.map()` **sem virtualização** (l.389). Contas WhatsApp com centenas/milhares de grupos travam a digitação e a rolagem.
- Esperado: `useMemo` para `filteredGroups` (deps: `groups`, `groupSearch`, `groupSort`, `selectedGroups`) + lista virtualizada (ex.: react-window) ou paginação.
- Observado: re-sort O(n log n) em cada keystroke e render de todos os itens no DOM.
- **Correção:** `filteredGroups` envolvido em `useMemo` com deps `[groups, groupSearch, groupSort, selectedGroups]`, eliminando o filtro+sort a cada render/keystroke. Virtualização da lista fica como melhoria futura (não introduzida para evitar nova dependência).

## F-304 | categoria: performance | severidade: media | status: corrigido
- Arquivo: `components/campaigns/CampaignDetail.tsx:347-372`
- Problema: lista de envios (`filteredDispatches.map`) renderizada sem virtualização, alimentada pelo payload completo do F-302 e atualizada a cada 8s. DOM cresce com o nº de grupos.
- Esperado: virtualização + dados paginados vindos da API.
- Observado: render integral da lista de dispatches a cada poll.
- **Correção:** intervalo de polling reduzido de 8s para 30s. `load` já estava em `useCallback` e o `setInterval` já tinha cleanup (`clearInterval` no return do `useEffect`); a lista agora é alimentada pelo payload paginado do F-302.

## F-305 | categoria: performance | severidade: media | status: corrigido
- Arquivo: `lib/auth.ts:81-86`
- Problema: o comentário diz "Touch lastActiveAt at most once per minute", mas o código dispara `prisma.userSession.update({ lastActiveAt: now })` (fire-and-forget) em **toda requisição autenticada** — não há throttle de 1 min. Como `getAuthUser` roda em praticamente todas as rotas/páginas (incl. polling de 8s do CampaignDetail e do dashboard), gera escrita no banco a cada hit, somando latência e carga no Turso.
- Esperado: só gravar se `lastActiveAt` for mais antigo que ~60s (condição `where` com cutoff) — como o comentário promete.
- Observado: 1 UPDATE por requisição autenticada, sem throttle.
- **Correção:** `findUnique` passou a selecionar `lastActiveAt`; o `update` fire-and-forget só dispara quando `Date.now() - lastActiveAt > 60_000`. Elimina o write a cada requisição autenticada.

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

## F-308 | categoria: performance | severidade: alta | status: corrigido
- Arquivo: `lib/prisma.ts:4-8` (config do adapter) + conflito `.env` vs `.env.local`.
- **Causa raiz:** no Next.js o `.env.local` sobrescreve o `.env`. O `.env` definia `DATABASE_URL="file:./dev.db"` (SQLite local), mas o `.env.local` (gerado pela Vercel CLI) definia `DATABASE_URL="libsql://movichat-borgescleydev.aws-us-east-2.turso.io"` + `TURSO_AUTH_TOKEN`. Resultado: o `next dev` rodando no Brasil mandava **toda** query do Prisma para o Turso em AWS us-east-2 (EUA), pagando latência de rede por query. Medição direta: query remota ~**475–1550ms cada**. O `app/api/auth/login` agrava por fazer queries sequenciais (`count`→`findUnique`→`create`).
- **Correção (abordagem PREFERIDA — Embedded Replica do libsql):** `lib/prisma.ts` passou a detectar DEV local apontando para Turso remoto (`NODE_ENV !== "production"` + URL `libsql/https/wss` + `TURSO_AUTH_TOKEN`) e, nesse caso, instancia `new PrismaLibSql({ url: "file:./dev-local.db", syncUrl: <URL Turso>, authToken, syncInterval: 60 })`. As **leituras** passam a ser locais (arquivo replicado) e a **sincronização/escrita** continua usando as credenciais EXISTENTES do Turso — ou seja, as credenciais permanecem ativas, sem precisar mexer no `.env.local`. Em **produção (Vercel)** o caminho cai no `else` e usa o Turso remoto direto (igual antes); embedded replica não é usado em prod (FS efêmero/read-only). Confirmado nos tipos do node_modules que `@prisma/adapter-libsql@7.8.0` repassa `Config` ao `@libsql/client@0.17.3`, cujo `Config` aceita `syncUrl`/`syncInterval`/`authToken` (`node_modules/@libsql/core/lib-esm/api.d.ts:18-22`). `.gitignore`: adicionados `*.db-info` e `*.db-client_wal_index` (metadados da réplica; `*.db`/`-wal`/`-shm` já cobertos). Nenhum segredo commitado (`.env*` continua ignorado).
- **Como verifiquei:**
  - **Bench libsql direto:** query remota ~475ms (1ª 1549ms); embedded replica = sync inicial único 2508ms, depois leituras locais **0.6ms / 0.3ms** (~1000x por query).
  - **`next dev` + POST /api/auth/login:** após warm-up de compilação, login com credenciais inválidas → **401 em ~24ms** (antes seria ~1s+ por count+findUnique remotos). Com usuário de teste temporário (criado e removido no Turso dev ao final, base voltou a 3 usuários) → credenciais válidas **200**, inválidas **401**. Login NÃO continua fazendo round-trip remoto por leitura.
  - **Produção:** lógica do login intacta; ramo de produção inalterado (Turso direto). Sem breaking change.
- **Observação (secundária) — CORRIGIDA na F-309:** no caminho de sucesso do login, `geolocateIp` (`lib/session-utils.ts:70`) era um `fetch` externo **bloqueante** (timeout 3s) que dominava a latência do 200. Desacoplado em F-309 (geo movido para `after()` pós-resposta). Ver F-309.

## F-309 | categoria: performance | severidade: alta | status: corrigido
- Arquivo: `app/api/auth/login/route.ts` (caminho de sucesso do login).
- **Causa raiz:** no login bem-sucedido, `const geo = await geolocateIp(ip)` era executado **antes** de criar o `userSession`, assinar o token e responder. `geolocateIp` (`lib/session-utils.ts`) é um `fetch` externo a `ip-api.com` com timeout de 3s — bloqueava o 200 por ~0.65s (IP público) até 3s (timeout), sem que o dado de geo (country/city/region) seja necessário para autenticar nem para a resposta (só alimenta o registro `userSession`).
- **Correção (mecanismo oficial pós-resposta — `after`):** o `userSession` passa a ser criado com `country/city/region = null`; o token é assinado e a resposta é retornada **imediatamente**. A geolocalização é resolvida depois via `after(async () => { ... })` (importado de `next/server`), que faz `geolocateIp(ip)` e `prisma.userSession.update({ where: { id: session.id }, data: { country, city, region } })`, tudo dentro de `try/catch` que **engole** o erro (só `console.error`) — trabalho best-effort que nunca pode derrubar o login. Mantido o short-circuit de IP local/privado em `geolocateIp` (retorna `"Local"` sem fetch). **NÃO** foi usado fire-and-forget solto: em serverless (Vercel Fluid Compute) a função poderia ser encerrada antes do update; `after` é apoiado por `waitUntil`, que estende o ciclo de vida da invocação até o trabalho terminar.
- **Confirmação via docs/tipos do node_modules (Next 16.2.6):** `after` é reexportado de `next/server` (`node_modules/next/server.d.ts:21` → `export { after } from 'next/dist/server/after'`); docs em `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` confirmam: estável desde v15.1.0, uso direto em Route Handlers, sem opt-in/config, e em serverless usa `waitUntil(promise)` para sobreviver após a resposta. Lógica de autenticação **inalterada** (200/401/400/500 idênticos).
- **Como verifiquei (`next dev`, Next 16.2.6, POST /api/auth/login):**
  - **Antes/depois (IP público 8.8.8.8, usuário de teste temporário):** ANTES (geo bloqueante, restaurado só para medir) = 2.17s / 1.18s / 1.77s; DEPOIS (geo via `after()`) = 1.85s / 1.03s / 1.01s. O custo do geo isolado (`geolocateIp`): IP público ~647ms, IP `unknown` ~159ms, IP privado 0ms (short-circuit "Local") — esse custo saiu do caminho crítico. O ~1s residual do 200 é a **escrita** `userSession.create` indo ao primary Turso (latência de escrita remota já conhecida da F-308; embedded replica só acelera leituras) — fora do escopo deste finding.
  - **Caminhos inalterados:** faltando campos → **400** em ~31ms; credenciais inválidas → **401** em ~20-24ms.
  - **Backfill pós-resposta confirmado:** o `create` grava `country=null`; após login com IP privado a linha `userSession` ficou com `country="Local"` — valor que **só** o callback `after()` escreve, provando que ele executou após a resposta. Usuário de teste temporário criado e removido ao final (base do Turso dev intacta); rota auxiliar de verificação criada e removida (não commitada).
- **Commit:** `feea0ff` (id do commit do fix; um `--amend` posterior insere este próprio hash na nota, então o HEAD final pode diferir por uma iteração — ver `git log`) — "fix(F-309): torna geolocateIp não-bloqueante no login via after() pós-resposta".

## F-310 | categoria: performance | severidade: alta | status: decisão-aceita
- Arquivo: `app/api/auth/login/route.ts:49-69` (escrita `userSession.create` + uso do `session.id` como `jti`) — bloqueado por `lib/auth.ts:73-79`.
- **Objetivo proposto:** remover o ~1s residual do login bem-sucedido, que é a **escrita** `prisma.userSession.create` indo ao primary Turso (escrita REMOTA; a embedded replica da F-308 só acelera LEITURAS — confirmado na F-308/F-309). A ideia era pré-gerar o id da sessão com `uuid` (já em `package.json`), assinar o token com esse `jti`, responder imediatamente, e mover o `create` (com id explícito — o schema `UserSession.id String @id @default(cuid())` aceita id explícito) para o `after()`, unificando com a geo da F-309.
- **RACE CRÍTICA — por que NÃO desacoplei (investigação obrigatória):** o JWT **NÃO é auto-contido para autorização**. `getAuthUser()` (`lib/auth.ts:73-79`) valida a sessão contra o banco em **toda** request autenticada:
  ```
  if (payload.jti) {
    const session = await prisma.userSession.findUnique({ where: { id: payload.jti }, select: { revokedAt, lastActiveAt } });
    if (!session || session.revokedAt) return null;   // ← linha ausente ⇒ null ⇒ 403/logout
  }
  ```
  Toda rota protegida passa por aqui (`app/api/sessions/route.ts`, `app/api/sessions/[id]/route.ts`, `getAuthUserFull` em guards de página, etc.). Se o `create` for diferido para `after()`, existe uma janela (≈ a latência da escrita remota, ~1s) em que o token é válido mas a linha `userSession` **ainda não existe**. O cliente tipicamente faz uma request autenticada (carregar dashboard) logo após receber o cookie — dentro dessa janela — e cai em `!session → return null → 403`, derrubando o usuário recém-logado. É exatamente o bug de logout intermitente que a tarefa mandou NÃO introduzir cegamente. (Confirmado também que linhas `userSession` **nunca são deletadas** — logout/revogação só setam `revokedAt`: `app/api/auth/logout/route.ts:10-13`, `app/api/sessions/[id]/route.ts:20-23,42-49`.)
- **Decisão necessária — escolha do trade-off (nenhuma alteração feita no código):**
  1. **Desacoplar + inverter o modelo de validação para deny-list** (recomendado *se* aprovado): id via `uuid` + `create` no `after()`, E em `getAuthUser` tratar linha **ausente** como VÁLIDA, rejeitando só quando `revokedAt` estiver setado. Como linhas nunca são deletadas, "linha ausente para um JWT com assinatura válida" passa a significar "sessão em criação". **Risco:** se o `create` no `after()` falhar silenciosamente (o `catch` engole), a linha nunca existe → o token fica válido por 7d **sem poder ser revogado** (logout/"revogar todas"/revogação por admin dependem de dar `update` numa linha existente) e **sem aparecer** na lista de sessões ativas. Enfraquece a garantia de revogação. Exige sign-off de segurança/produto.
  2. **Janela de carência por `iat`:** desacoplar e, em `getAuthUser`, aceitar linha ausente **apenas** se a idade do token < N s (ex.: 10s); depois disso, exigir a linha. Limita a regressão à janela de criação e faz uma falha de `create` aparecer como 401 (em vez de persistir silenciosamente). Mais complexo.
  3. **Manter `create` síncrono (status quo) e atacar o ~1s por infra:** a latência é a escrita no primary Turso. Opções sem race: aceitar (login é evento raro), aproximar o primary da região dos usuários, ou mover o registro de sessão para um store de escrita rápida (KV/Edge) — mudança arquitetural. Não atinge "dezenas de ms" sem mexer em infra, mas não introduz bug.
- **Como verifiquei (estático, conclusivo — sem subir servidor pois não há fix a validar):** leitura de `app/api/auth/login/route.ts`, `lib/auth.ts`, `app/api/auth/logout/route.ts`, `app/api/sessions/route.ts`, `app/api/sessions/[id]/route.ts` e `prisma/schema.prisma`. A causa do ~1s (escrita remota do `create`) já estava documentada na F-309 (linha 189). A rejeição por linha ausente em `getAuthUser` é visível no código e atravessa todas as rotas protegidas — a race é certa, não probabilística, na navegação pós-login.
- **Recomendação:** opção 1 ou 2 mediante decisão explícita de segurança; até lá, NÃO desacoplar. Login segue com `create` síncrono.
- **(decisão) — 2026-06-22:** usuário optou por **deixar como está** — mantém o `userSession.create` síncrono e aceita o ~1s de latência da escrita remota no login bem-sucedido. Motivo: a lentidão geral relatada já foi resolvida por F-308 (embedded replica em dev) e F-309 (geo não-bloqueante via `after()`); o resíduo é só no caminho de sucesso do login, e o trade-off de segurança das alternativas (token irrevogável na opção 1 / janela de carência e race de logout na opção 2) não compensa. As três opções acima ficam documentadas para referência futura, caso o gargalo de escrita seja reavaliado (ex.: aproximar primary Turso da região dos usuários ou mover o registro de sessão para store de escrita rápida).

---

# FASE 4 — Gestão de usuários (F-4XX)

**Modelo:** JWT (`jsonwebtoken`, 7d) em cookie `auth-token`; sessões rastreadas em `UserSession` (revogáveis via `jti`). Papéis: `superadmin` > `admin` > `agent`. Permissões por usuário em `User.permissions` (JSON), opt-out por padrão exceto `individual` (opt-in). Visibilidade de dados: **só `superadmin` vê tudo**; admin e agente são escopados aos próprios ativos (`createdById` / `ownerId`).

## F-400 | categoria: segurança | severidade: alta | status: corrigido
- Arquivo: `app/api/users/[id]/route.ts:65` e `app/api/users/route.ts:34-39`
- Problema: **escalonamento de privilégio.** No PATCH, `if (body.role !== undefined && isAdminOrAbove && !isSelf) data.role = body.role` permite que um **admin** atribua qualquer papel a outro usuário — inclusive `superadmin`. No POST, `role: role || "agent"` aceita `role: "superadmin"` sem restrição para admin. Um admin pode criar/promover um superadmin e assumir controle total.
- Esperado: só `superadmin` pode conceder/alterar o papel `superadmin` (e idealmente `admin`); admin limitado a gerenciar `agent`.
- Observado: admin define qualquer papel via POST e PATCH.
- **Correção:** PATCH (`app/api/users/[id]/route.ts`) — atribuição de papel só ocorre quando `!isSelf && isAdminOrAbove`, e `body.role === "superadmin"` exige `isSuperAdmin` (senão 403). POST (`app/api/users/route.ts`) — `targetRole === "superadmin"` exige `user.role === "superadmin"` (senão 403). Commit `7a9424f` — "fix(F-400,F-401): corrige escalamento de privilégio na gestão de usuários".

## F-401 | categoria: segurança | severidade: alta | status: corrigido
- Arquivo: `app/api/users/[id]/route.ts:64-68`
- Problema: não há proteção do alvo. Um admin pode alterar `role`, `active`, `permissions` e `password` (via PATCH genérico) de **outros admins e do superadmin** (`isAdminOrAbove && !isSelf`). Admin pode **desativar o superadmin** (`active:false`, l.66) ou trocar sua senha.
- Esperado: admin não pode modificar contas de papel igual/superior; ações sobre `superadmin` restritas a `superadmin`.
- Observado: PATCH sem verificação do papel do alvo.
- **Correção:** o PATCH agora busca `targetUser.role` antes de aplicar mudanças; se o alvo for `admin`/`superadmin` e o autor não for `superadmin` (e não for o próprio), retorna 403. Auto-edição (`isSelf`) preservada para não quebrar a edição de perfil. Commit `7a9424f`.

## F-402 | categoria: segurança | severidade: alta | status: corrigido
- Arquivo: `lib/auth.ts:5`
- Problema: `const JWT_SECRET = process.env.JWT_SECRET || "movichat-secret-2024"`. Se a env não estiver definida em produção, o segredo é público/conhecido → qualquer um pode forjar tokens válidos para qualquer usuário/papel.
- Esperado: falhar o boot se `JWT_SECRET` ausente em produção; nunca usar fallback hardcoded.
- Observado: fallback estático embutido no código.
- **Correção:** fallback hardcoded removido; `JWT_SECRET = process.env.JWT_SECRET` e, se ausente, `throw new Error("JWT_SECRET environment variable is not set")` no carregamento do módulo. Commit `f0a09c7` — "fix(F-402): remove JWT_SECRET hardcoded fallback e corrige throttle de lastActiveAt".

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

---

# FASE 5 — Revisão final de qualidade pós-fix (F-5XX)

> Passe de validação **read-only** após os clusters de remoção/fix. Veredicto: **REPROVADO — re-fix necessário** (2 bloqueadores). VERIFICAÇÕES 3, 5 e 6 passaram integralmente; VERIFICAÇÕES 1, 2 e 4 falharam com os itens abaixo.

## F-500 | categoria: funcional | severidade: alta | status: corrigido
- Arquivo: `app/contacts/ContactsClient.tsx:166` (interface órfã em `:13`)
- Problema: **bug de runtime.** A linha renderiza `{contact.messages[0]?.body || ...}`, mas o GET `app/api/contacts/route.ts:22-24` só faz `include: { assignedTo }` — **nunca retorna `messages`** (o model `Message` foi removido). Em runtime `contact.messages` é `undefined`, então `contact.messages[0]` lança `TypeError: Cannot read properties of undefined (reading '0')` ao renderizar **cada linha** da lista de contatos → a tela de Contatos quebra. O `?.` protege o acesso a `.body`, mas NÃO protege o indexador `[0]` sobre `undefined`.
- Por que o TS não pega: a interface `Contact` (l.13) declara `messages: { body: string; timestamp: string }[]` como **obrigatório**, mascarando a divergência com o que a API realmente devolve. Classificação da VERIFICAÇÃO 4: **bug real, não dead code** — a linha executa e quebra.
- **Correção:** campo `messages` removido da interface `Contact`; coluna "Última mensagem" (header + célula) removida da tabela de contatos. Resíduo da remoção do model `Message` eliminado.

## F-501 | categoria: funcional | severidade: media | status: corrigido
- Arquivo: `app/contacts/ContactsClient.tsx:171`
- Problema: o botão "Conversar" aponta para `href={`/conversations?contact=${contact.id}`}` — rota `app/conversations/` removida em F-200. Link morto → navega para 404. Resíduo do módulo de conversas.
- **Correção:** `<Link>` "Conversar" removido junto com o import `next/link` (que ficou órfão). Coluna de ações mantém apenas o botão "Excluir" (admin).

## F-502 | categoria: funcional | severidade: alta | status: corrigido
- Arquivo: `lib/auth.ts:47` e `lib/auth.ts:52`
- Problema: **erros reais de TypeScript (bloqueadores de `tsc --noEmit`).** Após a correção do F-402 (remoção do fallback hardcoded), `const JWT_SECRET = process.env.JWT_SECRET` passou a ter tipo `string | undefined`. O guard `if (!JWT_SECRET) throw` no escopo do módulo **não estreita** o tipo dentro das closures `signToken`/`verifyToken`, então:
  - `:47` `jwt.sign(payload, JWT_SECRET, ...)` → `TS2769 No overload matches this call` (`string | undefined` não atribuível).
  - `:52` `jwt.verify(token, JWT_SECRET)` → `TS2769` + `TS2352`.
- **Correção do contrato (F-209, l.73 e F-402) está imprecisa:** estes erros NÃO são "pré-existentes" — são **regressão introduzida pela remoção do fallback** (antes o `|| "..."` garantia tipo `string`). São os únicos erros de `tsc --noEmit` no código-fonte (fora de `node_modules`/`.next`).
- Esperado: garantir o tipo `string` após o guard, ex. `const JWT_SECRET: string = process.env.JWT_SECRET ?? ((): string => { throw new Error("JWT_SECRET environment variable is not set"); })();` ou afirmar não-nulo (`process.env.JWT_SECRET!`) preservando o `throw`.
- **Correção:** `JWT_SECRET` agora é `const JWT_SECRET: string = process.env.JWT_SECRET ?? ((): string => { throw new Error("JWT_SECRET environment variable is not set"); })();` — tipo `string` garantido no escopo do módulo, eliminando os `TS2769`/`TS2352` em `signToken`/`verifyToken`. Comportamento de falhar o boot se a env estiver ausente (F-402) preservado.

## F-503 | categoria: funcional | severidade: baixa | status: corrigido
- Arquivo: `lib/migrations.ts:176`
- Problema: migration residual `{ name: "Contact_lastReadAt", sql: 'ALTER TABLE "Contact" ADD COLUMN "lastReadAt" DATETIME' }` ainda presente, adicionando ao banco uma coluna que o schema Prisma não define mais (F-205). **Impacto baixo:** ALTER idempotente; a coluna fica órfã no banco, sem uso pelo client. O contrato (F-209, l.73) afirmava que os resíduos de conversas em `lib/migrations.ts` foram limpos — esta entrada escapou.
- Observação adicional (cosmético, NÃO-bloqueador): `lib/migrations.ts:271,323` contêm **texto de changelog histórico** (dados gravados em `SystemChangelog`) mencionando "conversas"/"pipeline"/"SSE". É dado descritivo de versões passadas, não referência de código — pode ser mantido.
- **Correção:** entrada `Contact_lastReadAt` removida da lista `MIGRATIONS`. Texto de changelog histórico (l.271,323) mantido por ser dado descritivo de versões passadas, não referência de código.

## Resultado das 6 verificações
- **VERIFICAÇÃO 1 (refs residuais):** FALHOU — `ContactsClient.tsx:13,166,171` (F-500/F-501), `migrations.ts:176` (F-503). Legítimos confirmados: `messageTemplate`, `errorMessage`/`messageId`, `ManualDispatchLog.message`/`ScheduledManualDispatch.message`, `data.messages` dos providers (Evolution/uazapi — shape da API externa do WhatsApp).
- **VERIFICAÇÃO 2 (tsc):** FALHOU — `lib/auth.ts:47,52` (F-502, bloqueador). Nenhum outro erro de código-fonte.
- **VERIFICAÇÃO 3 (Prisma):** PASSOU — `Message` e `PipelineColumn` ausentes; sem `@relation` pendente; `Contact` sem `columnId`/`lastReadAt`; `npx prisma validate` → "schema is valid".
- **VERIFICAÇÃO 4 (ContactsClient):** FALHOU — bug real de runtime (F-500), não dead code.
- **VERIFICAÇÃO 5 (performance):** PASSOU — `campaigns/route.ts` com `_count.dispatches` + paginação `skip/take` + `groupBy`; `CampaignDetail.tsx` polling 30000ms (l.101) com cleanup `clearInterval` (l.95,103,105); `ManualDispatch.tsx` `filteredGroups` em `useMemo` (l.170).
- **VERIFICAÇÃO 6 (segurança):** PASSOU — `lib/auth.ts` sem fallback hardcoded + `throw` se ausente + throttle de 60s (l.84); `UserPerms` sem `conversations`/`pipeline`; guards de role em `users/[id]/route.ts` (F-400/F-401, l.60-78) e `users/route.ts` POST (F-400, l.32-34).

---

# FASE 6 — Auditoria de agendamento de campanhas + preview de celular (F-6XX)

> Review estático read-only do disparo manual (`components/campaigns/ManualDispatch.tsx`),
> do sistema de agendamento (`lib/manual-dispatcher.ts`, `lib/campaign-dispatcher.ts`,
> `app/api/cron/campaign-dispatcher`, `app/api/campaigns/[id]/schedule`,
> `app/api/campaigns/manual-dispatch/scheduled`) e do mockup de celular do preview.

## F-600 | categoria: visual | severidade: media | status: corrigido
- Tela: `components/campaigns/ManualDispatch.tsx:893` (componente `PhoneMockup`, área "Chat background")
- Passos: 1) Disparo Manual → aba "Compor Disparo". 2) Digitar/colar uma mensagem longa (vários parágrafos, ~30+ linhas) no campo "Mensagem de texto". 3) Observar a "tela de celular" (Pré-visualização) na coluna 3.
- Esperado: o balão da mensagem ocupa a área de chat e, quando o texto excede a altura disponível, a área de chat rola internamente (scroll) para mostrar todo o conteúdo.
- Observado: a área de chat (`<div className="flex-1 overflow-hidden flex flex-col justify-end p-3 gap-2">`, l.893) tem `overflow-hidden` **e** `justify-end`. A tela tem altura fixa de `520px` (l.878) com `overflow-hidden` (l.867/878 para os cantos arredondados). Como o container do chat é `flex-1` com `overflow-hidden` + `justify-end`, quando o balão (texto em l.960 com `whiteSpace:"pre-wrap"`) cresce além da altura disponível, o **topo da mensagem é cortado** e fica inacessível — não há scroll interno. O usuário não consegue revisar o início de mensagens longas no preview.
- **Correção (resolvedor) — alvo exato:** em `components/campaigns/ManualDispatch.tsx:893`, trocar `overflow-hidden` por `overflow-y-auto` no container "Chat background". A altura máxima já é limitada pelo `flex-1` dentro da tela de `height:520px` (l.878), então o scroll fica restrito ao espaço entre o header WhatsApp (l.880, `flexShrink:0`) e a barra de input (l.987, `flexShrink:0`). Observação: com `justify-end` + scroll, alguns navegadores clipam o topo; se ocorrer, alternar para `justify-start` mantém o comportamento de rolagem previsível.
- **Correção:** container "Chat background" trocado para `overflow-y-auto` e `justify-end` removido; o ancoramento à base (mensagens no rodapé) passou a ser feito com `mt-auto` no primeiro filho (placeholder de mensagem anterior). Essa abordagem evita o bug conhecido de `justify-end` + `overflow:auto` que clipa o topo em alguns navegadores — agora mensagens longas rolam do topo à base. Header e barra de input (`flexShrink:0`) seguem fixos.

## F-601 | categoria: funcional | severidade: alta | status: corrigido
- Tela: `lib/manual-dispatcher.ts:17-32` (claim de jobs no `runManualDispatcher`)
- Passos: 1) Agendar um disparo manual. 2) O cron (`/api/cron/campaign-dispatcher`) dispara `runManualDispatcher`. 3) Job entra em `processing` durante o loop de envio (l.62-88, síncrono para N grupos). 4) Um segundo tick do cron (ou execução concorrente Vercel cron + chamada manual) ocorre antes do job terminar.
- Esperado: um job em envio não deve ser re-selecionado/re-enviado por outra execução do dispatcher (proteção contra envio duplicado), como já existe no `campaign-dispatcher.ts:66-67` que só re-pega `processing` com `updatedAt` mais antigo que 5 min (janela de staleness).
- Observado: o `findMany` (l.17-21) seleciona `status: { in: ["scheduled", "processing"] }` **sem** janela de staleness, e o claim `updateMany` (l.28-31) também aceita `processing`. Logo um job ainda em andamento (ou travado em `processing` por crash a meio) é re-reivindicado (`claimed.count === 1`) e **re-enviado** a todos os grupos → **mensagens duplicadas no WhatsApp** (efeito colateral irreversível e alto risco de ban). Diverge do padrão correto do `campaign-dispatcher`.
- Esperado (fix): incluir `processing` apenas com cutoff de staleness (ex.: `updatedAt < now - 5min`) tanto no `findMany` quanto no `updateMany`, espelhando `campaign-dispatcher.ts:66-67`.
- **Correção:** adicionada `STALE_PROCESSING_CUTOFF = now - 5min`; tanto o `findMany` quanto o `updateMany` (claim) passaram a usar `OR: [{ status: "scheduled" }, { status: "processing", updatedAt: { lte: cutoff } }]` (statuses reais do `ScheduledManualDispatch` são `scheduled`/`processing`, não `pending`). Job em flight (ou travado em `processing` há <5min) não é mais re-reivindicado → elimina re-envio duplicado. Espelha o padrão de `campaign-dispatcher.ts:66-67`.

## F-602 | categoria: funcional | severidade: alta | status: corrigido
- Tela: `lib/campaign-dispatcher.ts:188-226` (agendamento da próxima execução em recorrência)
- Passos: 1) Campanha com `repeatType !== "none"`. 2) Última remessa do run atual conclui (`remaining === 0`, l.169). 3) Dois ticks do cron executam concorrentemente (Vercel cron + trigger manual de `CronSettings`, ou sobreposição de execuções longas).
- Esperado: as remessas do próximo `runIndex` devem ser criadas **exatamente uma vez** (operação idempotente/atômica).
- Observado: o guard é **check-then-act não atômico**: `const existingNextRun = await prisma.campaignDispatch.count(... runIndex: newRunIndex)` (l.188) seguido de `if (existingNextRun === 0) { ... createMany(newDispatches) }` (l.190-226). Entre o `count` e o `createMany` há janela de corrida — duas execuções podem ambas ler `0` e ambas criar o conjunto completo de remessas do próximo run → **remessas duplicadas** → cada grupo recebe a mensagem recorrente **2x**. Não há unique constraint em `(campaignId, groupId, runIndex)` que impeça isso no banco.
- Esperado (fix): tornar atômico — unique constraint em `(campaignId, groupId, runIndex)` + `createMany({ skipDuplicates: true })`, ou claim via `updateMany` de status na transição de run.
- **Correção:** o bloco `count(runIndex: newRunIndex)` → `createMany` foi movido para dentro de `prisma.$transaction(async (tx) => {...})`, usando `tx` para o `count`, o `campaignGroup.findMany` e o `createMany`. Dois ticks concorrentes não conseguem mais ambos ler `0` e criar o conjunto duplicado de remessas — a serialização do check-then-act na transação é a proteção. (`skipDuplicates: true` **não** é suportado pelo provider libSQL/SQLite — `tsc` reporta `TS2322 Type 'true' is not assignable to type 'never'` — então foi omitido; a atomicidade da transação resolve a corrida sem ele.) O `campaign.update` de transição de status permanece fora da transação (idempotente).

## F-603 | categoria: funcional | severidade: alta | status: corrigido
- Tela: `app/api/campaigns/[id]/schedule/route.ts:64-114` (POST de agendamento de campanha)
- Passos: 1) Criar/editar campanha definindo `startAt` no passado (a UI `CampaignForm` permite — os inputs `datetime-local` não têm `min`, ver F-607). 2) Acionar o agendamento (status vira `scheduled`).
- Esperado: rejeitar `startAt` no passado (como o disparo manual faz em `manual-dispatch/scheduled/route.ts:49-51`), ou ao menos truncar o `startMs` para `Date.now()`.
- Observado: o endpoint **não valida** que `startAt` é futuro. Para `sendType !== "immediate"`, `startMs = campaign.startAt.getTime()` (l.96-97) pode estar no passado; `buildCadenceDispatches`/`buildBatchDispatches` geram timestamps acumulados a partir desse passado, então uma grande parte das remessas nasce com `scheduledFor <= now`. No primeiro tick do cron, o `runCampaignDispatcher` pega `scheduledFor: { lte: now }` (campaign-dispatcher.ts:69) e **dispara em massa** (até `take:15` por tick, depois esvazia o backlog ciclo a ciclo) — a cadência/limite por hora (`cadenceMaxPerHour`) é **ignorada** porque o espaçamento já está no passado. Risco de flood/ban no WhatsApp e perda do controle de ritmo.
- Esperado (fix): validar `startAt` futuro no POST (espelhar `manual-dispatch/scheduled` l.49-51) e/ou `startMs = Math.max(campaign.startAt.getTime(), Date.now())`.
- **Correção:** adicionada validação `if (campaign.sendType !== "immediate" && campaign.startAt.getTime() <= Date.now()) return 400 "A data de início deve ser no futuro"` antes de construir os dispatches. `sendType: "immediate"` segue usando `Date.now()` e não é bloqueado. **A mesma correção foi aplicada em `app/api/individual/campaigns/[id]/schedule/route.ts`**, que tinha o mesmo problema (também usa `campaign.startAt.getTime()` para `startMs` sem validação de futuro).

## F-604 | categoria: funcional | severidade: media | status: aberto
- Tela: `lib/campaign-dispatcher.ts:40-48` (`isWithinWindow`) consumido em `:101-104`
- Passos: 1) Campanha `sendType: "windowed"` com janela ex. 09:00–18:00 e dias úteis. 2) Deploy do cron em ambiente UTC (Vercel) enquanto o usuário/negócio está em America/Sao_Paulo (UTC-3).
- Esperado: a janela horária deve ser avaliada no fuso do usuário/negócio que a configurou.
- Observado: `isWithinWindow` usa `now.getHours()`, `now.getMinutes()` e `now.getDay()` (l.43,46) — todos no **fuso do servidor**. `windowStart`/`windowEnd` são strings "HH:MM" sem fuso associado. Em servidor UTC, uma janela "09:00–18:00" definida pensando em horário de Brasília é aplicada como 09:00–18:00 UTC, deslocando o envio em ~3h (envia 06:00–15:00 local). Não há campo de timezone na campanha nem conversão. (Obs.: o agendamento absoluto via `datetime-local` → `new Date(x).toISOString()` está correto porque converte local→UTC; o bug é específico da janela horária recorrente.)
- Esperado (fix): persistir o timezone da campanha e avaliar a janela nesse fuso (ex.: `Intl.DateTimeFormat` com `timeZone`), ou documentar/forçar UTC explicitamente na UI.
- **Evidência nova (review F-2XX, mesmo defeito):** o bug NÃO está só no `campaign-dispatcher`. `lib/contact-dispatcher.ts:69-77` tem a função `isWithinWindow` **idêntica** (também usa `now.getHours()`/`now.getMinutes()`/`now.getDay()` em fuso do servidor) e é consumida em `:126-129`. Logo campanhas individuais (`ContactCampaign`) com `sendType: "windowed"` sofrem o mesmo deslocamento de ~3h em produção UTC. O fix precisa cobrir os dois dispatchers.

## F-605 | categoria: performance | severidade: media | status: corrigido
- Tela: `lib/manual-dispatcher.ts:62-88` (loop de envio do disparo manual agendado)
- Passos: 1) Agendar um disparo manual para muitos grupos (dezenas/centenas). 2) Cron processa o job.
- Esperado: envios espaçados (cadência/delay aleatório entre mensagens), como nas campanhas (`campaign-dispatcher` usa `cadenceMinSeconds`/`cadenceMaxSeconds`/`cadenceMaxPerHour`), para reduzir risco de ban e throttling do provedor.
- Observado: o disparo manual agendado envia para **todos os grupos do job em loop apertado, back-to-back, sem nenhum delay** (l.62-88) e tudo num único tick do cron (1 job = 1 iteração de `runManualDispatcher`). Não há `cadenceMaxPerHour` nem sleep entre grupos. Para listas grandes isso é um burst de mensagens idênticas → alto risco de ban do número e de rate-limit do provider (Evolution/wppconnect).
- Esperado (fix): aplicar espaçamento/cadência por grupo (ou fatiar o job em remessas com `scheduledFor` escalonado, como o modelo de `campaignDispatch`).
- **Correção:** loop convertido para indexado (`for (let i = 0; i < groups.length; i++)`); após cada grupo, exceto o último (`if (i < groups.length - 1)`), aguarda `delayMs = 1000 + random(0..1000)` (1-2s) via `setTimeout`. Elimina o burst back-to-back, reduzindo risco de ban/rate-limit. Sem delay após o último grupo.

## F-606 | categoria: usabilidade | severidade: media | status: corrigido
- Tela: `components/campaigns/ManualDispatch.tsx:278-283` (feedback pós-agendamento) + `app/api/campaigns/manual-dispatch/scheduled/route.ts:5-20` (GET nunca consumido)
- Passos: 1) Agendar um disparo manual. 2) Confirmação aparece via `alert(...)` (l.280). 3) Tentar revisar/cancelar/ver status do disparo agendado.
- Esperado: lista dos disparos manuais agendados (pendentes/processados/falhos) com possibilidade de cancelar antes da hora; feedback não-bloqueante.
- Observado: (a) confirmação e erros usam `alert()`/`alert()` nativo bloqueante (l.280,282) — inconsistente com o resto da UI. (b) Existe `GET /api/campaigns/manual-dispatch/scheduled` (route.ts:5-20) que devolve os `ScheduledManualDispatch`, mas **nenhum componente o consome** (grep: a única referência a `manual-dispatch/scheduled` no front é o POST em `ManualDispatch.tsx:263`). A aba "Campanhas Agendadas" (l.654-655) mostra `Campaign`, **não** os disparos manuais agendados. Resultado: depois do `alert`, o disparo agendado **some da visão** — sem status, sem cancelamento, sem confirmação se executou. Endpoint GET é efetivamente código morto exposto.
- Esperado (fix): renderizar a listagem do GET (status `scheduled`/`processing`/`completed`/`failed`) com ação de cancelar; substituir `alert()` por feedback inline.
- **Correção:** (a) `alert()` de sucesso/erro substituído por `div` de feedback inline (`feedback` state + `showFeedback`) com estilo de sucesso/erro que some após 4s. (b) Novo componente `PendingSchedules` consome `GET /api/campaigns/manual-dispatch/scheduled` (state `scheduledDispatches`, fetch no `useEffect` inicial e refresh após agendar) e renderiza "📅 Agendamentos pendentes" abaixo do form, mostrando data/hora, nº de grupos, instância e status (`scheduled`/`processing`). A API GET não aceita filtro por `campaignId` e o model `ScheduledManualDispatch` não tem associação a `Campaign`, então a lista é escopada por usuário (como a API já faz), não por campanha.
- **precisa-decisão:** botão "Cancelar" NÃO implementado — o endpoint `DELETE /api/campaigns/manual-dispatch/scheduled/[id]` não existe (só há `route.ts` com GET/POST, sem rota `[id]`). Criar a rota DELETE (e decidir regras de permissão/estado: só cancelar `scheduled`, não `processing`) ficou pendente de decisão. Até lá a lista é somente-leitura.

## F-607 | categoria: usabilidade | severidade: baixa | status: corrigido
- Tela: `components/campaigns/ManualDispatch.tsx:602-608` e `components/campaigns/CampaignForm.tsx:749,765,838,903` (inputs `datetime-local` de data/hora)
- Passos: 1) Disparo Manual → "Agendar" (ou criar campanha agendada). 2) Abrir o seletor `datetime-local`.
- Esperado: o seletor impede (ou ao menos sinaliza) datas/horas no passado via atributo `min` com o instante atual.
- Observado: nenhum dos inputs `datetime-local` define `min` (ManualDispatch l.602-608; CampaignForm l.749,765,838,903 só usam `min` em campos numéricos de cadência). O usuário pode escolher livremente o passado e só descobre o erro no submit — e no caso de campanha (F-603) o backend nem rejeita. UX de tentativa-e-erro.
- Esperado (fix): adicionar `min={toLocalDatetimeValue(new Date())}` (ou equivalente) aos inputs de agendamento.
- **Correção:** `min={nowLocalMin}` (instante local atual no formato `datetime-local`, memoizado via `useMemo`) adicionado ao input de agendamento do `ManualDispatch` e aos 4 inputs de "Data e hora de início" do `CampaignForm` (scheduled/recurring/windowed/batch). No `ManualDispatch` o valor é calculado pela fórmula do contrato; no `CampaignForm` reusa o helper existente `toLocalDatetimeValue(new Date())`. O seletor passa a impedir datas/horas no passado na UI.

## F-608 | categoria: usabilidade | severidade: baixa | status: aberto
- Tela: `components/campaigns/ManualDispatch.tsx:206-231` (`collectSelectedGroupContacts`) e `:644` (groupName do preview)
- Passos: 1) Selecionar **vários** grupos. 2) Clicar "Coletar contatos do primeiro grupo selecionado" (l.438). 3) Observar também o nome do grupo no header do PhoneMockup.
- Esperado: comportamento previsível ao operar com múltiplos grupos selecionados.
- Observado: (a) `collectSelectedGroupContacts` usa `Array.from(selectedGroups)[0]` (l.207) — "primeiro" é a ordem de **inserção no Set**, não a ordem visual da lista (que é ordenada por `filteredGroups`), então o grupo coletado pode não ser o que o usuário entende como "primeiro". (b) O preview de celular usa `filteredGroups.find((g) => selectedGroups.has(g.id))?.name` (l.644) para o nome no header — mostra **um único** nome de grupo mesmo quando o disparo vai para N grupos, podendo passar a impressão de envio único. Ambos são ambiguidades de UX, não bugs de runtime.
- Esperado (fix): deixar explícito qual grupo será coletado (ex.: seletor dedicado) e indicar no preview que o envio atinge N grupos.

## F-700 | categoria: funcional | severidade: alta | status: corrigido
- Tela: `lib/providers/evolution.ts` — `EvolutionApiProvider.sendGroupMedia` (POST `/message/sendMedia/{instance}`)
- Passos: 1) Instância Evolution com socket WhatsApp instável/caído. 2) Enviar mídia (ex.: imagem/vídeo grande em base64) para um grupo.
- Esperado: erro acionável quando a instância está desconectada e tolerância a quedas transitórias do socket durante o envio.
- Observado: o método só repassava o erro cru do provider — `{"status":500,"error":"Internal Server Error","response":{"message":["Error: Connection Closed"]}}`. Esse "Connection Closed" do Baileys/Evolution indica que o socket WhatsApp da instância estava desconectado no momento do envio (ou caiu por payload base64 grande). Não havia pré-checagem de conexão nem retry, então o usuário recebia mensagem técnica e o envio falhava sem nova tentativa.
- **Correção:** em `sendGroupMedia` (`lib/providers/evolution.ts`): (1) **pré-checagem de conexão** — antes do POST chama `this.getStatus(config, instanceName)`; se != "connected", lança `Evolution API: instância "<name>" não está conectada (status: <status>). Releia o QR Code e tente novamente.` sem tentar enviar. (2) **retry em "Connection Closed"** — em resposta não-OK cujo corpo contenha "connection closed" (case-insensitive), aguarda 1500ms (helper privado `sleep`) e refaz o POST, até 3 tentativas no total; mantém `AbortSignal.timeout(60000)` por tentativa. (3) erros não-OK que NÃO sejam "Connection Closed" continuam lançando imediatamente (sem retry). (4) **mensagem final** após esgotar retries deixa explícito que a conexão da instância caiu durante o envio (instância instável ou mídia muito grande) e inclui o corpo da última resposta. Assinatura do método e contrato de tipos inalterados.
- **Como validei:** `npm run build` (limpando `.next` para descartar artefatos de validator stale) compilou e fez type-check com sucesso; `npx tsc --noEmit` sem erros em `evolution.ts`. Commit: `fc4b836`.

## F-701 | categoria: usabilidade | severidade: média | status: corrigido
- Tela: `components/campaigns/CampaignForm.tsx` (passo 1 — Template) e `components/individual/ContactCampaignForm.tsx` (passo 1 — Template)
- Passos: 1) Abrir "Nova Campanha" (ou "Nova Campanha Individual") com a rede lenta ou indisponível. 2) Observar o campo "Template de Mensagem *" no passo 1 enquanto o fetch de templates está em andamento.
- Esperado: enquanto os templates carregam, indicar carregamento; só mostrar "Crie um template..." quando, de fato, não houver templates.
- Observado: ambos inicializavam `templates` como `[]` e renderizavam a mensagem "Crie um template antes de continuar." / "Crie um template de contato antes de continuar." sempre que `templates.length === 0`, inclusive **durante** o fetch — exibindo uma mensagem falsa (parecia que o dropdown "não abria"). Pior: o fetch não tinha `.catch()` (`fetch(...).then(r => r.ok ? r.json() : []).then(setTemplates)`), então uma falha de rede deixava a promise rejeitada sem tratamento e `templates` permanecia `[]` para sempre, fixando a mensagem falsa.
- Esperado (fix): estado de carregamento separado; ordem de render loading → vazio → select; tratar erro do fetch e finalizar o loading sempre.
- **Correção:** em ambos os arquivos foi adicionado `const [loadingTemplates, setLoadingTemplates] = useState(true)`. O fetch de templates foi reescrito para `.then(data => setTemplates(Array.isArray(data) ? data : []))` (guarda contra resposta não-array), `.catch(() => {})` (evita rejeição não tratada) e `.finally(() => setLoadingTemplates(false))` (finaliza o loading em sucesso ou erro). No JSX a condição virou `loadingTemplates ? <p>Carregando templates...</p> : templates.length === 0 ? <p>Crie um template...</p> : <select>` — os textos das mensagens de erro existentes foram mantidos exatamente. Nenhum outro estado/etapa do formulário foi alterado.
- **Como validei:** `npx tsc --noEmit` sem erros. Arquivos: `components/campaigns/CampaignForm.tsx`, `components/individual/ContactCampaignForm.tsx`. Commit: `ae40dfe`.

## F-702 | categoria: performance | severidade: alta | status: corrigido
- Tela: `app/api/campaigns/templates/route.ts` (GET) e `app/api/individual/templates/route.ts` (GET) — endpoints de listagem de templates.
- Passos: 1) Cadastrar templates com mídia anexada (a mídia é gravada como base64 inline na coluna `mediaUrl`). 2) Abrir telas que listam templates (formulários de campanha, abas de templates, disparo manual). 3) Observar o tempo de resposta / tamanho do payload do GET de listagem.
- Esperado: a listagem deve retornar apenas os metadados necessários; o base64 pesado só deve ser buscado quando realmente for usado (editar/enviar).
- Observado: ambos os GET de listagem faziam `findMany` SEM `select`, retornando a coluna `mediaUrl` com megabytes de base64 inline em cada registro. Os formulários de campanha nem usam `mediaUrl`, mas pagavam o custo de baixar todo o base64 → listagem lenta e payloads enormes.
- **Correção (mudança coordenada):** (1) **Listas enxutas** — em `app/api/campaigns/templates/route.ts` (GET) e `app/api/individual/templates/route.ts` (GET) adicionado `select` no `findMany` com TODAS as colunas do modelo EXCETO `mediaUrl` (MessageTemplate: id, name, body, variables, mediaType, mediaCaption, createdById, createdAt, updatedAt; ContactTemplate: id, name, variations, mediaType, mediaCaption, createdById, createdAt, updatedAt). (2) **GET por id** — adicionado `export async function GET` em `app/api/campaigns/templates/[id]/route.ts` que valida `getAuthUser()` (403), busca o registro COMPLETO via `findUnique` (com `mediaUrl`), retorna 404 se não achar e espelha a checagem de ownership do PATCH (isSuperAdmin OU createdById === user.userId, senão 403). O GET por id de individual já existia e não foi tocado. (3) **Consumidores buscam mediaUrl sob demanda** — `components/campaigns/TemplatesTab.tsx` (`openEdit` agora async, faz `fetch('/api/campaigns/templates/'+t.id)` e usa o `mediaUrl` completo, com fallback vazio em erro), `components/individual/ContactTemplatesTab.tsx` (idem, via GET já existente de individual), e o CRÍTICO `components/campaigns/ManualDispatch.tsx` (o `useEffect` que aplica o template selecionado agora, quando o template tem `mediaType`, busca o registro completo via fetch e seta `mediaUrl` no estado — com flag `cancelled` no cleanup para evitar race, `setMediaUrl("")` enquanto carrega e fallback seguro em erro). Comportamento de PATCH/DELETE/POST inalterado. Sem migration / sem alteração de schema (índices ficam para depois).
- **Confirmação do fluxo de mídia do ManualDispatch:** ao selecionar um template com mídia, o effect busca o registro completo e popula `mediaUrl`; no disparo o `effectiveMedia` (= `mediaUrl` no modo "url") é enviado em `mediaUrl` do payload. Logo o envio de mídia continua recebendo o `mediaUrl` correto, agora carregado sob demanda em vez de vir na listagem.
- **Como validei:** `npx tsc --noEmit` sem erros e `npm run build` concluído com sucesso. Grep confirmou que não há mais acesso a `.mediaUrl` em itens de listagem nos componentes (só `form.mediaUrl` e `full.mediaUrl` do registro buscado). Commit: F-702.

## F-703 | categoria: performance | severidade: media | status: corrigido
- Tela: consultas de listagem de templates — `MessageTemplate` (where `createdById` + orderBy `updatedAt` desc) e `ContactTemplate` (where `createdById` + orderBy `createdAt` desc). Causa #2 do relatório de performance.
- Passos: 1) Base com muitos templates por usuário. 2) Abrir telas que listam templates (formulários de campanha, abas de templates, disparo manual). 3) Observar o custo das consultas filtradas por dono e ordenadas por data.
- Esperado: as consultas filtradas por `createdById` e ordenadas por `updatedAt`/`createdAt` devem usar índice em vez de full table scan + sort.
- Observado: não havia índice cobrindo (`createdById`, data), então o banco fazia varredura e ordenação em memória conforme a tabela cresce.
- **Correção:** índices compostos adicionados em duas frentes coordenadas. (1) `prisma/schema.prisma`: `@@index([createdById, updatedAt])` no model `MessageTemplate` e `@@index([createdById, createdAt])` no model `ContactTemplate` — nenhum outro campo/modelo alterado. (2) Migration Prisma para histórico local: nova pasta `prisma/migrations/20260616120000_add_template_indexes/migration.sql` com `CREATE INDEX "MessageTemplate_createdById_updatedAt_idx"` e `CREATE INDEX "ContactTemplate_createdById_createdAt_idx"` (nomes na convenção do Prisma). (3) `scripts/migrate-turso.mjs`: dois statements idempotentes apêndados ao fim do array `migrations` (`CREATE INDEX IF NOT EXISTS ...`), sem remover/reordenar os existentes.
- **Aplicação em produção (Turso):** os índices chegam ao banco real no **próximo deploy**, quando o `npm run build` executa `scripts/migrate-turso.mjs` (idempotente e seguro — usa `IF NOT EXISTS`). Localmente o `DATABASE_URL` aponta para `file:./dev.db`, então o runner Turso é pulado; o build não foi executado para não tocar nenhum banco remoto.
- **Como validei:** `npx prisma validate` (schema válido), `npx prisma generate` (client regenerado, Prisma 7.8.0) e `npx tsc --noEmit` sem erros. Arquivos: `prisma/schema.prisma`, `scripts/migrate-turso.mjs`, `prisma/migrations/20260616120000_add_template_indexes/migration.sql`. Commit: F-703.

---

# FASE 7 — Gatilho e execução dos dispatchers (review estático read-only, faixa F-2XX)

> Investigação do sintoma "o sistema de agendamento não está funcionando", focada
> no **gatilho** (o que invoca `/api/cron/campaign-dispatcher` periodicamente) e na
> **execução** dos 4 dispatchers (`lib/campaign-dispatcher.ts`, `contact-dispatcher.ts`,
> `manual-dispatcher.ts`, `quick-dispatcher.ts`). Nada foi alterado no código.

## F-216 | categoria: funcional | severidade: alta | status: decisão-aceita
> **Resolução (ver entrada canônica F-216 acima):** decisão-aceita = manter cron EXTERNO (cron-job.org), sem Vercel Cron nativo. Caminho tornado confiável/claro via F-217. Ação operacional do usuário: definir `CRON_SECRET` no Vercel (Production) + job GET a cada minuto em cron-job.org com `Authorization: Bearer <CRON_SECRET>`.
- Tela: `vercel.json:1` (conteúdo literal `{}`) + ausência de `vercel.ts`/`vercel.json` com `crons` em todo o repo (glob `**/vercel.{json,ts,js}` só acha `vercel.json={}` e um arquivo de `node_modules`) + `app/api/cron/campaign-dispatcher/route.ts:7-32` (handler GET que roda os 4 dispatchers) + `components/settings/CronSettings.tsx:212,218,302-335` (UI declara "Cron externo" e instrui cron-job.org).
- Passos: 1) Agendar uma campanha (status `scheduled`, remessas `CampaignDispatch` criadas com `scheduledFor` futuro). 2) Esperar passar o horário agendado. 3) Observar que nenhuma remessa muda de `pending` → `sent`.
- Esperado: algo invoca `GET /api/cron/campaign-dispatcher` periodicamente (a cada minuto) para que `runCampaignDispatcher`/`runContactDispatcher`/`runManualDispatcher`/`runQuickDispatcher` processem as remessas vencidas (`scheduledFor <= now`).
- Observado: **não existe nenhum gatilho periódico declarado no repositório.** `vercel.json` é `{}` (sem chave `crons`), não há `vercel.ts`, e o handler do cron só roda quando alguém faz a requisição HTTP. O mecanismo PRETENDIDO é um **cron externo** configurado manualmente fora do código — a própria UI (`CronSettings.tsx:302-306`) explica que o plano Hobby do Vercel só permite cron 1x/dia e por isso instrui o usuário a cadastrar `https://movichat.vercel.app/api/cron/campaign-dispatcher` no cron-job.org "Every minute" (`:315-335`). Conclusão: o disparo agendado depende 100% de um serviço externo que **não é versionado nem verificável pelo código**. Se esse cron externo não foi criado, foi pausado/desativado (cron-job.org desativa jobs gratuitos após falhas consecutivas), ou aponta para URL/secret errado, **nenhum dispatch agendado roda** — exatamente o sintoma relatado. O único caminho in-repo que executa os dispatchers é o botão "Executar agora" (`CronSettings.tsx:112-125` → `POST /api/cron/status` → `runCampaignDispatcher`), que é manual e só roda o dispatcher de GRUPOS (não contact/manual/quick).
- **Causa-raiz mais provável do "agendamento não funciona" — confiança ALTA.** Diagnóstico estático: o gatilho não está garantido pelo repositório; é um cron externo frágil. Verificação que requer ambiente (fora do escopo read-only): confirmar no painel do cron-job.org (ou serviço equivalente) se o job existe, está ativo, aponta para a URL de produção correta e está retornando HTTP 200 (ver F-217 sobre 401). Recomendação de robustez: declarar `crons` em `vercel.json`/`vercel.ts` (em plano que suporte cadência por minuto) para que o gatilho seja versionado e independente de configuração manual externa.

## F-217 | categoria: funcional | severidade: alta | status: corrigido
> **Resolução (ver entrada canônica F-217 acima):** 401 deixou de ser silencioso — agora retorna corpo JSON claro + `console.warn`; `CRON_SECRET` ausente em produção retorna `503` explícito (não fica mais público); sucesso retorna `summary` agregado; string falsa "Vercel Cron Jobs" removida do status; UI marca o header `Authorization: Bearer <CRON_SECRET>` como obrigatório.
- Tela: `app/api/cron/campaign-dispatcher/route.ts:8-15` (bloco de auth do handler).
- Passos: 1) Definir `CRON_SECRET` no ambiente Vercel (recomendado pela própria UI em `CronSettings.tsx:347`). 2) Configurar o cron externo SEM o header `Authorization: Bearer <CRON_SECRET>` (ou com valor divergente). 3) O cron externo chama o endpoint a cada minuto.
- Esperado: o cron externo autenticado dispara os dispatchers; se a auth falhar, o operador é alertado de forma visível.
- Observado: o handler exige `auth === \`Bearer ${cronSecret}\`` **OU** `x-vercel-cron === "1"` quando `CRON_SECRET` está definido (`:9-14`); caso contrário responde `401 Unauthorized` (`:13`) e **não roda nenhum dispatcher**. Como NÃO há Vercel Cron neste projeto (F-216), o header `x-vercel-cron` nunca chega — então o cron externo PRECISA enviar exatamente o `Authorization: Bearer <CRON_SECRET>`. Se o `CRON_SECRET` foi definido no Vercel mas o job externo não foi atualizado com o header correto (cenário comum ao rotacionar o segredo, ou se o cron-job.org não envia headers no plano free), **todas as invocações retornam 401 silenciosamente** — o app não registra esse 401 em lugar nenhum visível ao usuário (a aba Status só mostra a fila parada), e o sintoma é idêntico a "agendamento não funciona". Relacionado a F-216. Nota de segurança secundária: se `CRON_SECRET` NÃO estiver definido (`:9` falso), o endpoint fica **público** — qualquer um pode disparar os dispatchers via GET sem autenticação.
- **Confiança média-alta** como causa (condicional a `CRON_SECRET` estar setado): é a segunda falha mais provável depois de F-216, e as duas se sobrepõem (gatilho externo ausente OU autenticando errado). Verificação requer ambiente: inspecionar os headers configurados no cron externo e o valor de `CRON_SECRET` em produção.

## F-218 | categoria: funcional | severidade: media | status: aberto
- Tela: `lib/campaign-dispatcher.ts:121-128`, `lib/contact-dispatcher.ts:144-151`, `lib/quick-dispatcher.ts:72-79` (skip por `instance.status !== "connected"`) e `lib/manual-dispatcher.ts:46-53` (marca `failed`). Origem do valor: `app/api/providers/[id]/status/route.ts:36-41` e `app/api/whatsapp/webhook/route.ts:75` (únicos pontos que gravam `WhatsAppInstance.status="connected"` no banco).
- Passos: 1) Instância WhatsApp realmente conectada, porém com o campo `WhatsAppInstance.status` no banco desatualizado (ex.: ninguém abriu a tela que faz polling de `/api/providers/[id]/status` recentemente e o webhook `connection.update` não chegou). 2) Cron dispara um dispatch vencido para essa instância.
- Esperado: dispatch enviado, pois a instância está de fato conectada.
- Observado: cada dispatcher claima a remessa (`status="processing"`) e, **dentro do try**, checa `if (instance.status !== "connected")` lendo o valor **persistido no banco** (carregado no `findMany` inicial, não consultado ao vivo no provider). Se o campo estiver "connecting"/"disconnected"/stale, a remessa é marcada `skipped` ("Instância desconectada") nos dispatchers de grupo/contato/quick — ou `failed` (permanente, sem retry) no `manual-dispatcher.ts:46-53`. O `status` só é atualizado para "connected" de forma reativa (polling da UI em `providers/[id]/status/route.ts:36-37`, ou webhook `whatsapp/webhook/route.ts:69-91`); não há refresh do status no início do run do dispatcher. Se essa sincronização não ocorre, **100% dos dispatches da instância são silenciosamente pulados** → sintoma "agendamento não funciona" mesmo com cron rodando e WhatsApp conectado. No caso do manual-dispatcher o efeito é pior: o job vira `failed` definitivo, sem nova tentativa quando o status voltar.
- **Confiança média (condicional)**: é um modo de falha real e plausível, porém depende de o campo `status` estar dessincronizado em produção — não verificável estaticamente. Diferencia-se de F-216/F-217 (que param TUDO) por afetar apenas dispatches de instâncias com status stale, e seria visível na aba Status como remessas `skipped`/`failed` com "Instância desconectada". Fix sugerido: revalidar o status ao vivo (`provider.getStatus`) no início do dispatch ou tratar instância desconectada como adiável (mantém `pending`/`scheduled` p/ retry) em vez de `skipped`/`failed` terminal.

---

# FASE 8 — Lado de CRIAÇÃO/agendamento dos dispatches (review estático read-only, faixa F-3XX)

> Investigação do sintoma "o sistema de agendamento não está funcionando", focada
> no lado que GRAVA as remessas (`app/api/campaigns/[id]/schedule`,
> `app/api/individual/campaigns/[id]/schedule`, `app/api/campaigns/manual-dispatch/scheduled`,
> `app/api/individual/quick-dispatch`, rotas `pause`) e na COERÊNCIA com o que os
> dispatchers consomem (status/`scheduledFor`/`runIndex`). Nada foi alterado no código.
> Coerência básica verificada e OK: o `schedule` grava remessas sem `status` explícito
> → cai no `@default("pending")` do schema (`prisma/schema.prisma:218`/`:396`), e o cron
> filtra exatamente `status:"pending"` + `campaign.status in ["scheduled","running"]`
> (`lib/campaign-dispatcher.ts:65-73`) — bate. Manual (`scheduled`) e Quick também batem.
> A causa-raiz primária do sintoma já está coberta por F-216/F-217 (gatilho/cron ausente:
> `schedule` apenas enfileira e depende do cron, enquanto `dispatch-now` envia inline — por
> isso "dispatch-now funciona e schedule não"). Abaixo, bugs ADICIONAIS do lado de criação.

## F-311 | categoria: funcional | severidade: alta | status: aberto
- Tela: `app/api/campaigns/[id]/schedule/route.ts:119-124` (deleteMany+createMany) + `app/api/campaigns/[id]/pause/route.ts:18` + `prisma/schema.prisma:227` (`@@unique([campaignId, groupId, runIndex])`). Mesma falha em `app/api/individual/campaigns/[id]/schedule/route.ts:116-121` + `prisma/schema.prisma:407` (`@@unique([campaignId, contactId, runIndex])`).
- Passos: 1) Agendar campanha (runIndex = `runCount` = 0; remessas `pending`). 2) Cron envia parte das remessas — grupo A vira `sent`, grupo B segue `pending`; campanha vira `running`. 3) Usuário pausa (`pause/route.ts:18` permite `running`→`paused`, sem mexer em remessas nem em `runCount`). 4) Usuário re-agenda (o `schedule` permite status `paused`, l.81), com `runIndex` ainda = `runCount` = 0.
- Esperado: o re-agendamento recria a fila do run de forma consistente (ou bloqueia/limpa o run anterior), sem violar constraint e sem perder remessas pendentes.
- Observado: o `deleteMany` (l.120-122) só remove `status in ["pending","processing"]` — a remessa `sent` do grupo A **permanece**. Em seguida o `createMany` (l.124) insere uma linha para **todos** os grupos no MESMO `runIndex` 0, inclusive o grupo A, que colide com a linha `sent` já existente → viola `@@unique([campaignId, groupId, runIndex])` → o `createMany` (sem `skipDuplicates`, não suportado no libSQL conforme nota de F-602) **lança P2002** → resposta **500** e o `campaign.update` (l.132) nem roda (campanha presa em `paused`). Pior: o `deleteMany` já **apagou** a remessa `pending` do grupo B antes do throw → **perda de dados**: o grupo B nunca mais será enviado e o run fica corrompido. Re-agendar uma campanha parcialmente enviada falha e destrói as remessas restantes.
- Esperado (fix): ao re-agendar, ou (a) limpar TODAS as remessas do `runIndex` (qualquer status) antes do `createMany`, ou (b) avançar para um novo `runIndex` (`runCount+1`) ao recriar a fila, ou (c) `createMany` idempotente. Aplicar nos dois `schedule` (grupo e individual). Relacionado a F-602 (que tratou a corrida de duplicação no dispatcher, não esta colisão na rota de schedule).
- **Hipótese de causa-raiz / confiança ALTA (no caminho de código):** `deleteMany` filtrado por status parcial + `createMany` de todos os alvos no mesmo `runIndex` é incoerente com o unique `(…, runIndex)` sempre que existir remessa terminal (`sent`/`failed`/`skipped`) nesse run. Ocorre ao pausar uma campanha já parcialmente disparada e tentar re-agendá-la.

## F-312 | categoria: funcional | severidade: media | status: aberto
- Tela: `app/api/individual/quick-dispatch/route.ts:143-164` (cálculo de `scheduledFor`) — sem validação de `startAt` futuro.
- Passos: 1) Criar um Disparo Rápido (`POST /api/individual/quick-dispatch`) enviando `startAt` com data/hora no passado. 2) Aguardar o cron rodar (quando houver gatilho).
- Esperado: rejeitar `startAt` no passado (como `manual-dispatch/scheduled/route.ts:49-51` faz) ou truncar para `Date.now()` — espelhando a correção já aplicada em F-603 às rotas de `schedule` de campanha.
- Observado: o endpoint **não valida** que `startAt` é futuro. `baseStart = startAt ? new Date(startAt) : new Date()` e `startMs = isNaN(...) ? Date.now() : baseStart.getTime()` (l.144-145) — um `startAt` passado é aceito como está. O laço de cadência (l.150-164) acumula `scheduledFor` a partir desse passado, então **todos** os destinatários nascem com `scheduledFor <= now`. No primeiro tick, o `runQuickDispatcher` pega `scheduledFor: { lte: now }` (`lib/quick-dispatcher.ts:26`) e dispara em massa (até `take:15` por tick, esvaziando o backlog ciclo a ciclo) — o espaçamento por `cadenceMaxPerHour`/`cadenceMin/Max` fica **anulado** porque já está no passado. Risco de flood/ban do número. É a mesma classe do F-603, corrigido nos `schedule` de campanha (grupo e individual) mas **não** no Disparo Rápido.
- Esperado (fix): validar `startAt` futuro no POST (ou `startMs = Math.max(baseStart.getTime(), Date.now())`), igual ao que F-603 fez para as campanhas.
- **Hipótese de causa-raiz / confiança ALTA (no caminho de código), impacto condicional:** o bug só se materializa se um `startAt` passado for submetido; o Disparo Rápido tipicamente usa "agora" (`startAt` default = `CURRENT_TIMESTAMP`), por isso severidade `media`. Mas a porta para flood existe e é idêntica à que motivou F-603.

## F-313 | categoria: funcional | severidade: alta | status: corrigido
- Arquivo: `app/api/providers/[id]/instances/[instanceId]/route.ts:86-88` (handler DELETE) + UI `components/settings/ProvidersSettings.tsx:1329`.
- Passos: 1) Uma instância é deletada DIRETO no servidor Evolution (some de lá), mas no banco do MoviChat ela continua com `status: "connected"` (status defasado/stale). 2) Usuário tenta removê-la pelo painel.
- **Causa raiz:** o DELETE bloqueava cegamente quando `instance.status === "connected"` (`return 400 "Desconecte a instância antes de removê-la"`), confiando no status do BANCO, que estava stale. As órfãs ficavam presas para sempre: (a) o DELETE barrava pela trava; (b) "Desconectar" chama o servidor Evolution (que não tem mais a instância) — apesar de o `disconnect/route.ts:37-40` já forçar `status:"disconnected"` localmente de forma incondicional, o **botão de remover na UI estava ESCONDIDO** quando `status === "connected"` (`ProvidersSettings.tsx:1329`, condição `instance.status !== "connected"`), então para uma órfã stale-connected o usuário simplesmente **não tinha botão de remover**. Resultado: instância órfã impossível de excluir.
- Esperado: permitir remover órfãs SEM abrir brecha para deletar acidentalmente uma instância genuinamente conectada e em uso.
- **Correção (abordagem PREFERIDA — check de status AO VIVO; a trava passa a refletir a REALIDADE, não o banco stale):** no DELETE, quando `instance.status === "connected"`, antes de barrar faz `provider.getStatus(...)` contra o servidor. Se o status ao vivo **não** for `"connected"` (órfã — `EvolutionApiProvider.getStatus` retorna `"disconnected"` no caminho `!res.ok`, `lib/providers/evolution.ts:75`, quando a instância sumiu) → sincroniza o status local (`update` para o valor real) e **prossegue** com a exclusão (incluindo `purgeInstanceDependents` + `delete`, inalterados). Se ao vivo ainda estiver `"connected"` (genuinamente em uso) → mantém o 400. Se o provider estiver **inacessível** (getStatus lança) → mantém o 400 por segurança (não dá pra confirmar; o "Desconectar" segue como escape, pois força `disconnected` local). Auth/ownership (linhas 82-84) e `deleteFromProvider`/`purgeInstanceDependents` **intactos**. **NÃO** removi a trava cegamente. UI: `ProvidersSettings.tsx:1329` passou de `isAdmin && instance.status !== "connected"` para apenas `isAdmin &&`, expondo o botão de remover também para instâncias stale-connected — o backend continua sendo o guarda real (instância de verdade conectada → 400 + alerta na UI).
- **Como verifiquei (`next dev` + DB SQLite isolado descartável + servidor Evolution mockado):** subi `next dev` apontado para um banco de teste isolado (`prisma/test-f313.db`, criado via `prisma db push`; `.env.local` trocado temporariamente e **restaurado** ao final — confirmado que voltou ao Turso remoto) e um mock HTTP que responde `GET /instance/connectionState/<name>`: `live-*` → `{instance:{state:"open"}}` (connected), demais → 404 (gone). Semeei 2 instâncias com `status:"connected"`: uma "órfã" (`orphan-1`, mock 404) e uma "viva" (`live-1`, mock open). Token JWT de superadmin mintado sem `jti` (pula a checagem de sessão). Resultados: **TEST 1 (órfã)** → DELETE **HTTP 200 `{"ok":true}`**, linha **REMOVIDA** do banco ✅. **TEST 2 (viva)** → DELETE **HTTP 400 `{"error":"Desconecte a instância antes de removê-la"}`**, linha **PROTEGIDA** (permanece) ✅. Todos os dados de teste, o banco descartável e os scripts temporários foram **removidos** ao final; nenhum processo órfão; nada de teste commitado.
- **Commit:** `6dcd2fa` (id do commit do fix; um `--amend` posterior insere este próprio hash na nota, então o HEAD final pode diferir por uma iteração — ver `git log`) — "fix(F-313): permite remover instância órfã via check de status ao vivo no DELETE".

---

# FASE 9 — Cravar (A) cron-não-executa vs (B) timezone-scheduledFor (review estático read-only, faixa F-2XX)

> Missão focada: o usuário relata que campanhas ficam `scheduled` e NUNCA disparam (nem
> chegam a `running`), afirmando que "o cron externo está ATIVO". Como o dispatcher, ao
> achar 1+ remessa devida, a PRIMEIRA ação é `updateMany` scheduled→running
> (`lib/campaign-dispatcher.ts:90-93`), uma campanha presa em `scheduled` significa que o
> `findMany` (`:65-85`) retorna ZERO. Só há duas explicações: (A) o dispatcher nunca
> executa de fato, ou (B) `scheduledFor` está sempre no futuro (shift de timezone na
> criação). Abaixo o veredito. Nada foi alterado no código.

## F-222 | categoria: funcional | severidade: alta | status: verificado-correto
- Tela: `components/campaigns/CampaignForm.tsx:758,290` (input `datetime-local` → `new Date(startAt).toISOString()`), `app/api/campaigns/route.ts:92` (`new Date(startAt)`), `app/api/campaigns/[id]/schedule/route.ts:90,100` + `:36` (validação futuro + `startMs = campaign.startAt.getTime()` + `scheduledFor: new Date(cursor)`), `lib/campaign-dispatcher.ts:58,71` (`now = new Date()`, `scheduledFor: { lte: now }`).
- **REFUTAÇÃO da hipótese (B) "timezone empurra `scheduledFor` permanentemente pro futuro" — confiança ALTA.** Tracei a cadeia inteira e NÃO há shift que adie o disparo:
  1. O `<input type="datetime-local">` mantém em `startAt` uma string de relógio-de-parede LOCAL sem fuso, ex. `"2026-06-22T15:30"`.
  2. `handleSubmit` faz `new Date(startAt).toISOString()` (`CampaignForm.tsx:290`). Pela spec ECMAScript, uma string date-time COM componente de hora e SEM offset é parseada como **hora local** → `.toISOString()` produz o **instante UTC correto** (ex. `15:30` em UTC-3 → `18:30Z`). Conversão correta, sem deslocamento.
  3. `POST /api/campaigns` (`route.ts:92`) recebe a string ISO com `Z` e faz `new Date(...)` → mesmo instante. Gravado em `Campaign.startAt`.
  4. `schedule/route.ts:100` lê `startMs = campaign.startAt.getTime()` (instante em ms) e gera `scheduledFor: new Date(cursor)` a partir dele (`:36`). Sem reinterpretação de fuso.
  5. O dispatcher compara `scheduledFor: { lte: now }` com `now = new Date()` (`campaign-dispatcher.ts:58,71`) — **instante contra instante** (ambos UTC). Correto.
  6. A validação `campaign.startAt.getTime() <= Date.now()` (`schedule/route.ts:90`) também é instante-vs-instante; coerente.
- Esperado: se o usuário (UTC-3) agenda "daqui a 2 min", `scheduledFor` casa `<= now` em ~2 min. Confirmado pelo trace — o instante gravado é exatamente o escolhido.
- Observado: **não existe deslocamento permanente pro futuro.** (B) está REFUTADO como causa do "trava em scheduled". Fecha a lacuna que F-221 deixou em aberto ("possível divergência de timezone na criação — área F-3XX, não confirmada"): aqui foi confirmada como inexistente. (Ressalva fora deste sintoma: a janela `windowed` em `isWithinWindow` usa `now.getHours()` = hora LOCAL DO SERVIDOR, que na Vercel é UTC — isso pode causar `skipped` fora do horário esperado, mas é a área F-604 e produz `skipped`, NÃO "trava em scheduled".)

## F-223 | categoria: funcional | severidade: alta | status: aberto
- Tela: `app/api/cron/status/route.ts:71-86` (botão "Executar agora" → `POST` → `runCampaignDispatcher()` direto, sob sessão admin, **sem** passar pela auth de cron de `campaign-dispatcher/route.ts:8-15`) e `:44-68` (resposta de status SEM nenhum campo `lastRun`/última-execução do cron). UI: `components/settings/CronSettings.tsx:112-125` (handler do botão), `:334` (URL hardcoded `https://movichat.vercel.app/...`).
- **VEREDITO: a causa do "trava em `scheduled`" é (A) o cron não executa de fato — confiança ALTA.** Com (B) refutado em F-222 e o dispatcher em si verificado correto (F-221), a única explicação restante para `findMany` retornar zero é que o endpoint `/api/cron/campaign-dispatcher` **não está sendo invocado periodicamente** (ou é invocado e barrado antes de rodar). Subcausas, todas já mapeadas e que se sobrepõem: cron externo inexistente/pausado/desativado (F-216); 401 por `CRON_SECRET` setado sem `Authorization: Bearer` correto (F-217); URL de produção divergente da hardcoded → 404; método ≠ GET → 405 (o handler só exporta `GET`, `route.ts:7`); ou instância com `status` stale → tudo `skipped` (F-218, mas esse deixaria rastro `skipped`, não `scheduled`).
- **Diagnóstico DECISIVO para o usuário separar (A) de (B)/F-218, in-app:** clicar **"Executar agora"** na aba Cron. Esse botão chama `POST /api/cron/status` que roda `runCampaignDispatcher()` **diretamente**, ignorando a auth do cron e qualquer gatilho externo.
  - Se ao clicar a campanha sai de `scheduled` (vira `running`/remessas → `sent`) e o banner mostra "Enviados > 0" → o dispatcher e o `scheduledFor` estão CORRETOS; o que falta é só o gatilho periódico → **(A) confirmado**.
  - Se mostra "Enviados: 0" e a campanha continua `scheduled`: olhar "Pendentes" e os "Últimos disparos" — `skipped`/"Instância desconectada" = F-218; ou conferir que `scheduledFor` está genuinamente no futuro (agendamento para mais tarde, não bug).
- **Lacuna que agrava o diagnóstico:** `app/api/cron/status/route.ts:44-68` NÃO persiste nem retorna nenhum `lastRun`/timestamp da última batida do cron externo — a aba Status mostra apenas a fila parada, sem dizer se o endpoint está sendo chamado. A ÚNICA fonte de verdade sobre a saúde do cron externo é o histórico de execuções no painel do cron-job.org (código HTTP por chamada). Soma-se a F-217 (texto "Vercel Cron Jobs" enganoso).
- **FIX exato por caso:**
  - **(A) — o que mudar:** (config, mais provável) no cron-job.org confirmar que o job: existe e está **ENABLED**; URL = domínio de produção REAL + `/api/cron/campaign-dispatcher` (a página hardcoda `movichat.vercel.app` em `CronSettings.tsx:334` — se o domínio real diferir, corrigir); método **GET**; schedule **Every minute**; e, SE `CRON_SECRET` estiver setado na Vercel, header `Authorization: Bearer <CRON_SECRET>` idêntico. (código, robustez) declarar `crons` em `vercel.json`/`vercel.ts` para versionar o gatilho (atenção: Hobby = 1x/dia; por-minuto exige Pro ou o cron externo); e persistir um `lastRun` no dispatcher exposto em `/api/cron/status` para a aba Status sinalizar saúde do cron.
  - **(B) — o que mudar:** NADA (refutado em F-222). Não há correção de timezone necessária para este sintoma.
- **Passos EXATOS de confirmação em produção (para o usuário):**
  1. Configurações → aba Cron → "Status & Fila": anotar "Agendadas" e "Pendentes".
  2. Clicar **"Executar agora"** e ler o banner verde ("Enviados: N"). N>0 / campanha vira `running` → **(A)**: o problema é o gatilho externo, não o código de envio.
  3. Abrir cron-job.org → o job → **Execution history**: confirmar execução a cada minuto retornando **HTTP 200**. `401` = `CRON_SECRET`/header divergente (F-217); `404` = URL errada; `405` = método ≠ GET; sem execuções/desabilitado = job inativo (F-216).
  4. Vercel → Projeto → Logs/Functions, filtrar `/api/cron/campaign-dispatcher`: ver se chegam requisições e com qual status. Ausência total de requisições confirma cron externo não batendo (A).

---

# FASE 10 — Disparo de GRUPO que vira `failed`/campanha `Error` no envio Evolution (review estático read-only, faixa F-2XX)

> Sintoma refinado (screenshot da aba Cron em produção): o dispatcher RODOU, claimou a
> remessa e TENTOU enviar, mas o disparo da campanha "teste" ficou `failed` e a campanha
> virou `error`. Como ficou `failed` e NÃO `skipped`, passou pelo check
> `instance.status === "connected"` (`lib/campaign-dispatcher.ts:121`) — logo o erro veio
> da CHAMADA DE ENVIO em si (try/catch `:120-161`, que grava `errorMessage`). Foco:
> modos de falha de `EvolutionApiProvider.sendGroupMessage`/`sendGroupMedia`, onde o
> usuário vê o texto do erro, e como a campanha sai de `error`. Nada foi alterado no código.

## F-224 | categoria: funcional | severidade: media | status: aberto
- Tela: `components/settings/CronSettings.tsx:251-285` (card "Últimos disparos") vs `app/api/cron/status/route.ts:59-67` (a resposta JÁ inclui `errorMessage` por remessa) e `:9-17`/interface `CronSettings.tsx:9-18` (o tipo `recentDispatches[]` declara `errorMessage: string | null`).
- Passos: 1) Uma remessa falha no envio (status `failed`, `errorMessage` gravado em `lib/campaign-dispatcher.ts:156-159`). 2) Abrir Configurações → aba **Cron** → "Status & Fila" → seção "Últimos disparos". 3) Ver a linha da campanha "teste" com o badge **"Falhou"**.
- Esperado: como o card é o ponto de monitoramento do cron e foi ONDE o usuário viu a falha pela screenshot, o texto de `errorMessage` (a causa real) deveria aparecer ali.
- Observado: o card renderiza só `campaignName`, `groupName` e a data (`CronSettings.tsx:273-280`) — **o `errorMessage` NUNCA é exibido**, embora a API o devolva (`cron/status/route.ts:66`) e o tipo o carregue (`CronSettings.tsx:16`). O dado trafega até o cliente e é descartado na renderização. Resultado: na aba Cron o usuário vê apenas "Falhou", sem nenhuma pista do motivo. Para ler o texto do erro ele precisa SAIR da aba Cron e abrir o detalhe da campanha específica (ver F-226/abaixo). É um gap de observabilidade que torna o sintoma "deu erro e não sei por quê" — exatamente a situação do usuário.
- **Onde a `errorMessage` por-disparo É de fato exibida (resposta ao item 3 da missão):**
  - **Campanhas de GRUPO** → `components/campaigns/CampaignDetail.tsx:364-366`: dentro da lista "Envios", cada linha mostra o `errorMessage` em vermelho **inline** (sempre visível, sem precisar expandir). Caminho do usuário: aba Campanhas → clicar na campanha → rolar até "Envios" (pode filtrar por "Falhos" no select `:338-343`). Fonte do dado: `app/api/campaigns/[id]/analytics`.
  - **Campanhas INDIVIDUAIS/contato** → `components/individual/ContactCampaignDetail.tsx:317-324`: o `errorMessage` aparece num bloco "Erro:" só **após clicar na linha do disparo para expandir** (`:268-270` toggle `expandedDispatch`). Menos visível que o de grupo.
  - **Aba Cron "Últimos disparos"** → **não exibe** (este finding).
- **Confiança ALTA (verificável estaticamente):** o JSX do card não referencia `d.errorMessage` em nenhum ponto. Fix sugerido: renderizar `d.errorMessage` (quando presente) abaixo de `groupName`, espelhando `CampaignDetail.tsx:364-366`.

## F-225 | categoria: funcional | severidade: alta | status: aberto
- Tela: `lib/providers/evolution.ts:257-271` (`sendGroupMessage`, caminho de TEXTO — o usado pela campanha "teste" se o template não tem mídia, via `lib/campaign-dispatcher.ts:146`) e `:273-348` (`sendGroupMedia`, caminho de MÍDIA via `:137-141`). Catch que grava o texto: `lib/campaign-dispatcher.ts:154-160`.
- Passos: 1) Campanha de grupo agendada, instância com `WhatsAppInstance.status="connected"` no NOSSO banco. 2) Cron claima e tenta enviar. 3) A chamada à Evolution falha e a remessa vira `failed` com `errorMessage` = a `e.message` lançada pelo provider.
- Esperado: enumerar EXATAMENTE os erros que esses métodos lançam e o texto que vai parar em `campaignDispatch.errorMessage`.
- **Catálogo de erros lançados (texto exato em `errorMessage`):**
  - `sendGroupMessage` (texto): se `!res.ok` → lança **`Evolution API: falha ao enviar para grupo - <corpo>`** onde `<corpo>` = `await res.text()` (corpo cru do erro da Evolution) ou, se a leitura do corpo falhar, o código HTTP como string (`evolution.ts:266-267`). Timeout de **15s** (`AbortSignal.timeout(15000)`, `:263`) → `fetch` lança `DOMException`/`TimeoutError` → catch genérico grava **`The operation was aborted due to timeout`** (texto do runtime). Falha de rede/DNS/`baseUrl` inalcançável → `TypeError` do undici → grava **`fetch failed`**.
  - `sendGroupMedia` (mídia): faz uma **pré-checagem AO VIVO** com `getStatus` (`:310-313`) — se o WhatsApp estiver deslogado no lado Evolution, lança **`Evolution API: instância "<nome>" não está conectada (status: <state>). Releia o QR Code e tente novamente.`** (mesmo com nosso banco dizendo "connected"). Em "Connection Closed" durante o envio: retry até 3× com 1500ms (`:317-345`); esgotado → **`Evolution API: a conexão da instância "<nome>" caiu durante o envio da mídia após 3 tentativas (instância instável ou mídia muito grande) - <corpo>`**. Outros `!res.ok` (não-"connection closed") → **`Evolution API: falha ao enviar mídia - <corpo>`** (`:338`). Timeout aqui é **60s** (`:324`).
- **ASSIMETRIA-CHAVE (provável causa do `failed` da campanha "teste"):** `sendGroupMessage` (TEXTO) **NÃO tem** a pré-checagem `getStatus` ao vivo nem o retry de "Connection Closed" que o `sendGroupMedia` tem. O único gate antes do texto é `instance.status === "connected"` lido do NOSSO banco (`campaign-dispatcher.ts:121`), que pode estar stale (ver F-218). Logo, se a instância está deslogada no lado Evolution mas "connected" no banco, um envio de **texto** vai direto à API e falha com `Evolution API: falha ao enviar para grupo - Connection Closed` (ou corpo equivalente), **sem retry** — enquanto o mesmo cenário com **mídia** falharia mais cedo com a mensagem "não está conectada". Isso explica por que ficou `failed` (e não `skipped`).
- **Ranking dos modos de falha de um envio de TEXTO de GRUPO (mais → menos provável), com texto esperado:**
  1. **Instância deslogada/derrubada no lado Evolution, mas "connected" no nosso banco** (status stale, F-218, ou socket Baileys caiu). → `Evolution API: falha ao enviar para grupo - Connection Closed` (ou corpo da Evolution tipo `"The instance ... is not connected"`). SEM retry no caminho texto.
  2. **apiKey do provider errada/expirada** (`ProviderConfig.apiKey`). → HTTP 401 → `Evolution API: falha ao enviar para grupo - {"status":401,"error":"Unauthorized",...}` (corpo cru da Evolution).
  3. **baseUrl errado / instância deletada no servidor Evolution** (existe no nosso banco, não no servidor). → HTTP 404 → `Evolution API: falha ao enviar para grupo - {...Not Found...}`.
  4. **`groupJid` inválido, grupo inexistente, ou o bot não é membro/foi removido do grupo.** → HTTP 400 → `Evolution API: falha ao enviar para grupo - <corpo de erro de número/jid>`.
  5. **Payload/endpoint incompatível com a versão da Evolution** (o texto usa só `${base}/message/sendText/${instanceName}` SEM os fallbacks multi-endpoint que `fetchGroups`/`fetchMessages` têm). → HTTP 400/404 → `Evolution API: falha ao enviar para grupo - <corpo>`.
  6. **Timeout (Evolution lenta)** — 15s. → `The operation was aborted due to timeout`.
  7. **Rede/DNS/baseUrl inalcançável.** → `fetch failed`.
- **Confiança ALTA (caminho de código verificado):** o `errorMessage` exato depende do corpo que a Evolution devolve, mas o PREFIXO e a ausência de retry/pré-check no caminho texto são determinísticos. Para o usuário ver o corpo cru: abrir CampaignDetail (F-224/F-226). Fix sugerido: dar ao `sendGroupMessage` a mesma pré-checagem `getStatus` ao vivo e o retry de "Connection Closed" do `sendGroupMedia`, e/ou revalidar `instance.status` ao vivo no dispatcher (alinha com F-218).

## F-226 | categoria: funcional | severidade: alta | status: aberto
- Tela: `lib/campaign-dispatcher.ts:177-184` (transição para estado terminal `error`) + `app/api/campaigns/[id]/retry/route.ts:5-27` (rota de retry manual) + `components/campaigns/CampaignDetail.tsx:108-122,312-318` (botão "Retentar N falhos") + `:172` (`canDispatchNow` inclui `error`).
- Passos: 1) Campanha sem recorrência (`repeatType === "none"`). 2) Cron processa o run; TODAS as remessas do `runIndex` falham. 3) `remaining === 0` (nenhuma `pending`/`processing`).
- Esperado: confirmar a transição terminal e como a campanha sai de `error`.
- Observado (confirmação do item 4 da missão): em `:177-184`, quando `remaining === 0` e `!hasRecurrence`, conta `totalDispatches` e `failedDispatches` do `runIndex`; `finalStatus = (total > 0 && failed === total) ? "error" : "completed"` (`:183`). Ou seja, **se TODOS falharam → campanha vira `error`**; se ao menos uma foi `sent` → `completed`. **NÃO há retry automático** — o dispatcher não re-enfileira nem re-tenta as `failed`; elas ficam paradas e a campanha em estado terminal `error`. **Saída de `error` = ação MANUAL do usuário**, por dois caminhos no `CampaignDetail`:
  - **(a) "Retentar N falhos"** (`CampaignDetail.tsx:312-318`, visível quando `failedCount > 0`) → `POST /api/campaigns/[id]/retry`. A rota (`retry/route.ts:16-24`) faz `updateMany` em TODAS as remessas `status:"failed"` da campanha, resetando-as para `status:"pending"`, `scheduledFor = agora`, e zerando `errorMessage`/`sentAt`/`messageId`; e SE a campanha está `completed`/`draft` volta para `scheduled` (`:22-24`). **Observação:** a rota NÃO trata explicitamente o estado `error` no `if` de `:22` (só `completed`/`draft`) — porém as remessas resetadas para `pending` ainda assim serão pegas pelo cron porque o filtro do dispatcher aceita `campaign.status in ["scheduled","running"]` (`campaign-dispatcher.ts:72`)... **MAS uma campanha em `error` NÃO está em nenhum desses dois** → as remessas voltam a `pending` mas o cron as ignora enquanto a campanha seguir `error`. Isso é um provável **bug secundário**: o retry de uma campanha `error` reseta as remessas mas não devolve a campanha a `scheduled`, então o retry não dispara via cron (precisaria também do "Disparar agora").
  - **(b) "Disparar agora"** (`CampaignDetail.tsx:172` inclui `error` em `canDispatchNow`) → `POST /api/campaigns/[id]/dispatch-now`, que roda o envio inline ignorando o cron. Esse é o caminho que de fato re-dispara uma campanha `error` sem depender do gatilho periódico.
- **Resumo para o usuário:** a campanha "teste" em **Error** não se re-tenta sozinha. Para reprocessar: abrir a campanha (aba Campanhas) → ler o `errorMessage` inline em "Envios" (F-224 explica por que a aba Cron não mostra) → corrigir a causa (reconectar a instância, etc.) → clicar **"Disparar agora"** (recomendado para sair de `error`) e/ou **"Retentar N falhos"**. Atenção ao bug secundário: "Retentar falhos" sozinho pode não bastar para uma campanha já em `error`, pois a rota não a recoloca em `scheduled` — combinar com "Disparar agora".
- **Confiança ALTA (caminho de código verificado):** transição `error` e ausência de auto-retry são determinísticas; o gap do retry em estado `error` é deduzido do `if` parcial em `retry/route.ts:22` cruzado com o filtro do dispatcher `:72`.

---

# Findings reportados pelo usuário (faixa F-0XX)

## F-001 | categoria: funcional | severidade: alta | status: corrigido
- Tela: `app/api/providers/[id]/instances/[instanceId]/route.ts` (handler DELETE) + `components/settings/ProvidersSettings.tsx` (`confirmDeleteInstance` + modal de remoção).
- Passos: 1) Ter uma instância JÁ DESCONECTADA no painel (Configurações → Provedores). 2) Clicar para remover. 3) Escolher uma das opções de remoção no modal.
- Esperado: a remoção conclui (instância desconectada pode ser excluída com confirmação), ou — se realmente falhar — a UI mostra a CAUSA real, nunca o fallback genérico.
- Observado (reportado pelo usuário): ao excluir uma instância desconectada aparecia o alerta genérico **"Erro ao remover instância"**. **Causa raiz:** `purgeInstanceDependents(instanceId)` + `prisma.whatsAppInstance.delete(...)` rodavam SEM try/catch. A relação `QuickDispatch.instance` (`prisma/schema.prisma:438`) é OBRIGATÓRIA e **sem `onDelete`** → Prisma assume `Restrict`; o purge **não** apagava `QuickDispatch`, então qualquer instância com disparos rápidos batia em erro de FK. O route devolvia um **500 opaco sem campo `error`** no JSON e a UI caía em `data.error || "Erro ao remover instância"` (`confirmDeleteInstance`).
- (resolvedor) Correção:
  1. **Backend:** `purgeInstanceDependents` agora apaga `QuickDispatch` da instância (`deleteMany({ where: { instanceId } })`, com cascade em `QuickDispatchRecipient`) — cobre a única relação obrigatória sem `onDelete` que faltava (auditei todas as relações que apontam para `WhatsAppInstance`: `WhatsAppGroup`/`ManualDispatchLog`/`ScheduledManualDispatch` são `Cascade`, `ContactGroup.sourceInstance` é `SetNull`, `Contact` é desvinculado, `Campaign`/`ContactCampaign` já tratados). A deleção foi envolvida em try/catch que retorna `NextResponse.json({ error: "Não foi possível remover a instância: <detalhe real>" }, { status: 500 })` — a UI nunca mais cai no fallback genérico.
  2. **Regra por status (gate = confirmação, não bloqueio):** removido o `return 400 "Desconecte a instância antes de removê-la"`. O backend NÃO bloqueia mais a exclusão de instância conectada; apenas sincroniza o status ao vivo best-effort (não-fatal). Quem autoriza é a confirmação do usuário na UI.
  3. **UI:** modal de remoção agora é status-aware via `deleteModal.instance.status`. Desconectada → aviso normal (warning) + as opções de remoção (confirmação implícita ao escolher). Conectada/ativa → banner DESTACADO em `--danger` informando que a instância está ATIVA, que removê-la interrompe o uso e que a ação NÃO PODE SER REVERTIDA, **mais** um checkbox obrigatório "Entendo o risco e que não há como reverter" — os botões de remover ficam desabilitados até o usuário marcá-lo.
  4. **Robustez transacional (follow-up):** purge+delete agora são **atômicos**. `purgeInstanceDependents` recebe o client transacional (`async function purgeInstanceDependents(tx: Prisma.TransactionClient, instanceId)`) e o handler roda tudo em `prisma.$transaction(async (tx) => { await purgeInstanceDependents(tx, instanceId); await tx.whatsAppInstance.delete(...); }, { timeout: 15000 })`. Antes, se o `delete` final falhasse, o purge (deleteMany de campanhas/quickDispatches, unlink de contatos, etc.) **já estava commitado** e deixava dados órfãos. Com a transação, qualquer erro faz **rollback total**. O `try/catch` em volta da transação foi mantido (retorna o 500 com a causa real). Timeout elevado para 15s acima do default interativo (~5s) porque o purge faz vários `deleteMany`. A chamada externa ao provider (`deleteFromProvider`/`getStatus`) permanece **FORA** da transação — rede não pertence a transação de DB.
  5. **Regressão (DEV) — "Apenas do sistema" ainda dava erro + sem confirmação:** o usuário reportou que, ao escolher *Apenas do sistema* (`deleteFromProvider=false`) numa instância desconectada, ainda aparecia erro de remoção E não havia etapa de confirmação. **Investigação (empírica, não chute):** a hipótese de que o adapter libsql/Turso Embedded Replica (`lib/prisma.ts`, syncInterval 60s) NÃO suportaria transações interativas foi **REFUTADA** — reproduzi diretamente contra a réplica embedded e confirmei que: (a) transação interativa com escrita **commita e persiste** OK; (b) o purge+delete completo (inclusive a deleção real de uma instância desconectada com 1 `QuickDispatch` dependente) **executa sem erro**; (c) `prisma.$transaction([...])` (array/batch) e `client.batch()` também funcionam. Ou seja, o backend transacional do item 4 **está correto** e foi mantido. **Causa raiz real do "erro de remoção":** deleção **não-idempotente**. Quando a instância já não existe no primário (Turso) — porque uma remoção anterior já commitou mas a réplica embedded local ainda a listava por causa do lag de sync de 60s, OU por um duplo-clique disparando um 2º DELETE — o `tx.whatsAppInstance.delete(...)` lança **P2025** ("Record to delete does not exist"), o catch devolvia 500 `{error}` e a UI mostrava o alerta. A **falta de confirmação** no caminho desconectado (botões disparavam o DELETE em um clique) tornava esses disparos acidentais/duplos fáceis, alimentando o P2025.
  6. **Correção da regressão:**
     - **Backend (idempotência):** no catch da transação, `P2025` agora é tratado como **sucesso** (`return NextResponse.json({ ok: true })`) — se a instância já sumiu, o objetivo do usuário já foi atingido; nada de alerta enganoso. Demais erros continuam retornando o 500 com a causa real. Transação interativa **mantida** (provada funcional no adapter libsql).
     - **UI (confirmação consciente para TODA remoção):** novo state `deleteConfirm` (reset junto com `deleteAck` ao abrir o modal). Instância **desconectada** agora exige um checkbox "Confirmo que desejo remover esta instância" (warning, mais leve) antes de habilitar os botões; **conectada** mantém o checkbox de risco `--danger` já existente. Ambos os botões (*Apenas do sistema* / *Remover completamente*) usam `disabled={deleting || !deleteConfirmed}`, onde `deleteConfirmed = deleteIsConnected ? deleteAck : deleteConfirm`. Acabou o delete em um clique.
  - **Validação:** `npx tsc --noEmit` sem erros; `eslint` nos 2 arquivos sem erros (4 warnings pré-existentes, não relacionados). Remoção "apenas do sistema" reproduzida de fato (instância desconectada com dependente `QuickDispatch` removida, sem erro). `params` é `Promise` (AGENTS.md) — mantido. Relacionado a F-313 (mesmo handler/sintoma de "Erro ao remover", causa diferente — F-313 tratou órfã stale-connected via check de status ao vivo; este trata o 500 opaco da FK de `QuickDispatch`, a troca de bloqueio por confirmação, e agora a idempotência P2025 + confirmação no caminho desconectado).
