import { prisma } from "./prisma";

// Each entry is idempotent: errors on "duplicate column" are swallowed.
const MIGRATIONS = [
  // --- groups / instances / contacts ---
  {
    name: "WhatsAppGroup",
    sql: `CREATE TABLE IF NOT EXISTS "WhatsAppGroup" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "instanceId" TEXT NOT NULL,
      "groupJid" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "participantCount" INTEGER NOT NULL DEFAULT 0,
      "lastSyncAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "WhatsAppGroup_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  {
    name: "WhatsAppGroup_unique",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppGroup_instanceId_groupJid_key" ON "WhatsAppGroup"("instanceId", "groupJid")`,
  },
  {
    name: "MessageTemplate",
    sql: `CREATE TABLE IF NOT EXISTS "MessageTemplate" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "variables" TEXT NOT NULL DEFAULT '[]',
      "mediaType" TEXT,
      "mediaUrl" TEXT,
      "mediaCaption" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
  },
  {
    name: "Campaign",
    sql: `CREATE TABLE IF NOT EXISTS "Campaign" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "templateId" TEXT NOT NULL,
      "instanceId" TEXT NOT NULL,
      "variableValues" TEXT NOT NULL DEFAULT '{}',
      "startAt" DATETIME NOT NULL,
      "repeatType" TEXT NOT NULL DEFAULT 'none',
      "repeatEndAt" DATETIME,
      "nextRunAt" DATETIME,
      "runCount" INTEGER NOT NULL DEFAULT 0,
      "cadenceMinSeconds" INTEGER NOT NULL DEFAULT 10,
      "cadenceMaxSeconds" INTEGER NOT NULL DEFAULT 30,
      "cadenceMaxPerHour" INTEGER NOT NULL DEFAULT 60,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Campaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "Campaign_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
  },
  {
    name: "CampaignGroup",
    sql: `CREATE TABLE IF NOT EXISTS "CampaignGroup" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "campaignId" TEXT NOT NULL,
      "groupId" TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "CampaignGroup_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CampaignGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WhatsAppGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
  },
  {
    name: "CampaignGroup_unique",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "CampaignGroup_campaignId_groupId_key" ON "CampaignGroup"("campaignId", "groupId")`,
  },
  {
    name: "CampaignDispatch",
    sql: `CREATE TABLE IF NOT EXISTS "CampaignDispatch" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "campaignId" TEXT NOT NULL,
      "groupId" TEXT NOT NULL,
      "runIndex" INTEGER NOT NULL DEFAULT 0,
      "scheduledFor" DATETIME NOT NULL,
      "sentAt" DATETIME,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "errorMessage" TEXT,
      "messageId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "CampaignDispatch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CampaignDispatch_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WhatsAppGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
  },
  {
    name: "CampaignDispatch_unique",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "CampaignDispatch_campaignId_groupId_runIndex_key" ON "CampaignDispatch"("campaignId", "groupId", "runIndex")`,
  },
  {
    name: "ManualDispatchLog",
    sql: `CREATE TABLE IF NOT EXISTS "ManualDispatchLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "instanceId" TEXT NOT NULL,
      "message" TEXT NOT NULL DEFAULT '',
      "mediaType" TEXT,
      "mediaCaption" TEXT,
      "hasMedia" INTEGER NOT NULL DEFAULT 0,
      "groupCount" INTEGER NOT NULL DEFAULT 0,
      "sentCount" INTEGER NOT NULL DEFAULT 0,
      "failedCount" INTEGER NOT NULL DEFAULT 0,
      "results" TEXT NOT NULL DEFAULT '[]',
      "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ManualDispatchLog_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  {
    name: "ScheduledManualDispatch",
    sql: `CREATE TABLE IF NOT EXISTS "ScheduledManualDispatch" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "instanceId" TEXT NOT NULL,
      "message" TEXT NOT NULL,
      "mediaType" TEXT,
      "mediaUrl" TEXT,
      "mediaCaption" TEXT,
      "fileName" TEXT,
      "groupIds" TEXT NOT NULL DEFAULT '[]',
      "scheduledFor" DATETIME NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'scheduled',
      "errorMessage" TEXT,
      "createdById" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "ScheduledManualDispatch_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ScheduledManualDispatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`,
  },
  {
    name: "ContactGroup",
    sql: `CREATE TABLE IF NOT EXISTS "ContactGroup" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "sourceGroupId" TEXT,
      "sourceGroupName" TEXT,
      "sourceGroupJid" TEXT,
      "sourceInstanceId" TEXT,
      "createdById" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "ContactGroup_sourceGroupId_fkey" FOREIGN KEY ("sourceGroupId") REFERENCES "WhatsAppGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "ContactGroup_sourceInstanceId_fkey" FOREIGN KEY ("sourceInstanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "ContactGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`,
  },
  {
    name: "ContactGroupItem",
    sql: `CREATE TABLE IF NOT EXISTS "ContactGroupItem" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "contactGroupId" TEXT NOT NULL,
      "contactId" TEXT NOT NULL,
      "sourcePhone" TEXT,
      "sourceName" TEXT,
      "rawJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ContactGroupItem_contactGroupId_fkey" FOREIGN KEY ("contactGroupId") REFERENCES "ContactGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ContactGroupItem_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  {
    name: "ContactGroupItem_unique",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "ContactGroupItem_contactGroupId_contactId_key" ON "ContactGroupItem"("contactGroupId", "contactId")`,
  },
  // --- ALTER TABLE columns (idempotent: error = already exists, safe to ignore) ---
  { name: "Contact_instanceId",  sql: `ALTER TABLE "Contact" ADD COLUMN "instanceId" TEXT REFERENCES "WhatsAppInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE` },
  { name: "Contact_lastReadAt",  sql: `ALTER TABLE "Contact" ADD COLUMN "lastReadAt" DATETIME` },
  // --- Campaign scheduling columns ---
  { name: "Campaign_channel",              sql: `ALTER TABLE "Campaign" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'whatsapp'` },
  { name: "Campaign_sendType",             sql: `ALTER TABLE "Campaign" ADD COLUMN "sendType" TEXT NOT NULL DEFAULT 'scheduled'` },
  { name: "Campaign_windowStart",          sql: `ALTER TABLE "Campaign" ADD COLUMN "windowStart" TEXT` },
  { name: "Campaign_windowEnd",            sql: `ALTER TABLE "Campaign" ADD COLUMN "windowEnd" TEXT` },
  { name: "Campaign_windowDays",           sql: `ALTER TABLE "Campaign" ADD COLUMN "windowDays" TEXT NOT NULL DEFAULT '[]'` },
  { name: "Campaign_batchSize",            sql: `ALTER TABLE "Campaign" ADD COLUMN "batchSize" INTEGER` },
  { name: "Campaign_batchIntervalMinutes", sql: `ALTER TABLE "Campaign" ADD COLUMN "batchIntervalMinutes" INTEGER` },
  { name: "Campaign_repeatEveryX",         sql: `ALTER TABLE "Campaign" ADD COLUMN "repeatEveryX" INTEGER` },
  { name: "Campaign_repeatEveryUnit",      sql: `ALTER TABLE "Campaign" ADD COLUMN "repeatEveryUnit" TEXT` },
  // --- Instance ownership ---
  { name: "WhatsAppInstance_ownerId", sql: `ALTER TABLE "WhatsAppInstance" ADD COLUMN "ownerId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE` },
  // --- User avatar + permissions ---
  { name: "User_avatar",       sql: `ALTER TABLE "User" ADD COLUMN "avatar" TEXT` },
  { name: "User_permissions",  sql: `ALTER TABLE "User" ADD COLUMN "permissions" TEXT NOT NULL DEFAULT '{}'` },
  // --- Data isolation: createdById on campaign assets ---
  { name: "Campaign_createdById",         sql: `ALTER TABLE "Campaign" ADD COLUMN "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE` },
  { name: "ContactCampaign_createdById",  sql: `ALTER TABLE "ContactCampaign" ADD COLUMN "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE` },
  { name: "MessageTemplate_createdById",  sql: `ALTER TABLE "MessageTemplate" ADD COLUMN "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE` },
  { name: "ContactTemplate_createdById",  sql: `ALTER TABLE "ContactTemplate" ADD COLUMN "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE` },
  { name: "DispatchGroup_createdById",    sql: `ALTER TABLE "DispatchGroup" ADD COLUMN "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE` },
  {
    name: "SystemChangelog",
    sql: `CREATE TABLE IF NOT EXISTS "SystemChangelog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "version" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "changes" TEXT NOT NULL DEFAULT '[]',
      "deployedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
  },
  {
    name: "SystemChangelog_seed_v1",
    sql: `INSERT OR IGNORE INTO "SystemChangelog" ("id","version","title","description","changes","deployedAt","createdAt","updatedAt") VALUES (
      'changelog-v1-0-0',
      'v1.0.0',
      'Lançamento inicial do MoviChat',
      'Primeira versão do sistema de CRM WhatsApp com todas as funcionalidades base.',
      '[{"type":"feature","text":"Autenticação com JWT e controle de roles (superadmin, admin, agente)"},{"type":"feature","text":"Pipeline Kanban com colunas personalizáveis"},{"type":"feature","text":"Gerenciamento de contatos com busca e filtros"},{"type":"feature","text":"Conversas em tempo real com suporte a SSE e polling"},{"type":"feature","text":"Envio e recebimento de mensagens WhatsApp via Evolution API"},{"type":"feature","text":"Suporte a mídias: imagens, vídeos, áudios e documentos"},{"type":"feature","text":"Campanhas em grupo e disparos individuais"},{"type":"feature","text":"Configurações de instâncias e provedores WhatsApp"},{"type":"feature","text":"Sistema de temas personalizáveis"},{"type":"feature","text":"Sessões de usuário com histórico de acesso"}]',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "SystemChangelog_seed_v1_1_0",
    sql: `INSERT OR IGNORE INTO "SystemChangelog" ("id","version","title","description","changes","deployedAt","createdAt","updatedAt") VALUES (
      'changelog-v1-1-0',
      'v1.1.0',
      'Melhorias de performance e sincronização de mensagens',
      'Correções críticas de bugs e melhorias de performance na sincronização de conversas.',
      '[{"type":"fix","text":"Corrigido bug de stale closure no SSE que impedia atualização em tempo real"},{"type":"fix","text":"Corrigido N+1 query na listagem de conversas usando batch query"},{"type":"fix","text":"Corrigido sincronização de instâncias que não associava contatos corretamente"},{"type":"improvement","text":"SSE usa DB polling ao invés de singleton em memória, funcionando em serverless Vercel"},{"type":"improvement","text":"Batch upsert nos grupos de campanha usando transações Prisma"},{"type":"feature","text":"Botão de buscar histórico de mensagens do provedor"},{"type":"feature","text":"Re-registro automático de webhooks na inicialização do servidor"},{"type":"feature","text":"Endpoint manual para re-registro de webhook por instância"},{"type":"feature","text":"Nova Conversa: modal para iniciar conversa com contato existente ou número novo"},{"type":"feature","text":"Notificações toast para novas mensagens quando conversa não está aberta"},{"type":"feature","text":"Painel de Versionamento exclusivo para superadmin com histórico completo de deploys"}]',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "SystemChangelog_seed_v1_2_1",
    sql: `INSERT OR IGNORE INTO "SystemChangelog" ("id","version","title","description","changes","deployedAt","createdAt","updatedAt") VALUES (
      'changelog-v1-2-1',
      'v1.2.1',
      'Correção crítica: recebimento de mensagens após limpeza do banco',
      'Após limpeza do banco de dados, o provider e a instância da Evolution foram removidos, impedindo o processamento dos webhooks recebidos. Corrigido e processo documentado.',
      '[{"type":"fix","text":"Recriado registro do provider Evolution API no banco após limpeza — sem ele, o webhook chegava mas não era processado por ausência de provedor ativo"},{"type":"fix","text":"Recriada instância Borgescley no banco vinculada ao provider correto com status connected"},{"type":"fix","text":"Recriada WhatsAppSession padrão apontando para a instância ativa"},{"type":"fix","text":"Removidos registros duplicados de provider e instância gerados durante o processo de correção"},{"type":"improvement","text":"Identificado que limpezas de banco devem preservar os registros de ApiProvider e WhatsAppInstance para manter o fluxo de webhooks funcional"}]',
      '2026-05-14T04:00:00.000Z',
      '2026-05-14T04:00:00.000Z',
      '2026-05-14T04:00:00.000Z'
    )`,
  },
  {
    name: "SystemChangelog_seed_v1_3_0",
    sql: `INSERT OR IGNORE INTO "SystemChangelog" ("id","version","title","description","changes","deployedAt","createdAt","updatedAt") VALUES (
      'changelog-v1-3-0',
      'v1.3.0',
      'Disparo Individual, Grupos de Disparo e Isolamento de Dados',
      'Novo módulo de campanhas para contatos individuais, agrupamento de grupos WhatsApp em Grupos de Disparo, editor de templates com preview em tempo real, e isolamento completo de ativos por usuário.',
      '[{"type":"feature","text":"Módulo de Disparo Individual: campanhas 1-a-1 com templates de múltiplas variações para A/B testing"},{"type":"feature","text":"Templates Individuais com variações de mensagem, suporte a mídia e preview do celular em tempo real"},{"type":"feature","text":"Grupos de Disparo: coleções reutilizáveis de grupos WhatsApp para facilitar o agendamento de campanhas"},{"type":"feature","text":"Editor de templates de campanha reformulado com toolbar de formatação, contador de caracteres e preview do WhatsApp"},{"type":"feature","text":"Rastreamento de sessões de usuário com IP, dispositivo, browser, OS e geolocalização"},{"type":"feature","text":"Painel de Sessões nas configurações com histórico de acessos e revogação de sessão"},{"type":"feature","text":"Página de Versionamento exclusiva para superadmin com histórico completo de deploys"},{"type":"improvement","text":"Isolamento de dados por criador: cada usuário vê apenas seus próprios templates, campanhas e grupos de disparo"},{"type":"improvement","text":"Superadmin tem visibilidade global; admin e agentes são escopados aos próprios ativos"},{"type":"improvement","text":"Permissão Disparo Individual é opt-in: agentes só acessam o módulo quando a permissão é concedida explicitamente"},{"type":"fix","text":"Templates e campanhas criados sem vínculo de dono agora exigem createdById em todas as rotas de criação"},{"type":"fix","text":"PATCH e DELETE de templates e campanhas verificam propriedade antes de permitir a operação"}]',
      '2026-05-14T12:00:00.000Z',
      '2026-05-14T12:00:00.000Z',
      '2026-05-14T12:00:00.000Z'
    )`,
  },
  // --- Changelog v1.5.0 ---
  {
    name: "SystemChangelog_seed_v1_5_0",
    sql: `INSERT OR IGNORE INTO "SystemChangelog" ("id","version","title","description","changes","deployedAt","createdAt","updatedAt") VALUES (
      'changelog-v1-5-0',
      'v1.5.0',
      'Correção do sistema de disparo recorrente e desativação de conversas',
      'Restauração do cron job de disparo automático, correção de bugs na ativação da recorrência de campanhas e desativação global do módulo de conversas.',
      '[{"type":"fix","text":"Cron job restaurado no vercel.json — disparo recorrente agendado volta a executar automaticamente a cada minuto"},{"type":"fix","text":"Disparo recorrente agora usa o runIndex real dos dispatches ao verificar conclusão, evitando dessincronização com runCount"},{"type":"fix","text":"Botão Disparar Agora (dispatch-now) agora agenda corretamente a próxima recorrência em campanhas com repeatType != none, em vez de marcar como completed"},{"type":"fix","text":"Mesmo fix de recorrência aplicado ao dispatcher de contatos individuais (contact-dispatcher)"},{"type":"improvement","text":"Sistema de conversas desativado globalmente para todas as contas (conversationsEnabled = false em todas as instâncias)"}]',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "SystemChangelog_seed_v1_5_1",
    sql: `INSERT OR IGNORE INTO "SystemChangelog" ("id","version","title","description","changes","deployedAt","createdAt","updatedAt") VALUES (
      'changelog-v1-5-1',
      'v1.5.1',
      'Agendamento de campanhas mais intuitivo',
      'Melhoria no fluxo de criação e agendamento de campanhas em grupo, reduzindo etapas manuais e deixando claro quando a campanha entra na fila.',
      '[{"type":"feature","text":"Novo modo Enviar agora na etapa de agendamento de campanhas"},{"type":"improvement","text":"Botão final de nova campanha agora cria e agenda automaticamente, mantendo Salvar rascunho como ação separada"},{"type":"improvement","text":"Atalhos rápidos para iniciar em 15 minutos, em 1 hora ou amanhã"},{"type":"improvement","text":"Resumo de agendamento mais claro com data, recorrência, janela ou lotes"},{"type":"fix","text":"Validação do agendamento não exige data no modo imediato e evita cálculo inválido de lotes"}]',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "SystemChangelog_seed_v1_6_0",
    sql: `INSERT OR IGNORE INTO "SystemChangelog" ("id","version","title","description","changes","deployedAt","createdAt","updatedAt") VALUES (
      'changelog-v1-6-0',
      'v1.6.0',
      'Disparo manual agendado e grupos de contatos',
      'Novo fluxo para agendar disparos manuais sem campanha, reutilizar grupos de disparo e coletar contatos de grupos WhatsApp.',
      '[{"type":"feature","text":"Disparo manual agora permite aplicar Grupos de Disparo salvos"},{"type":"feature","text":"Disparo manual pode ser agendado sem vinculo com campanha"},{"type":"feature","text":"Coleta de contatos de grupos WhatsApp com importacao para a base de contatos"},{"type":"feature","text":"Grupos de contatos coletados ficam disponiveis nas campanhas individuais"},{"type":"feature","text":"Exportacao CSV dos grupos de contatos com dados de origem e dados disponiveis do contato"}]',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "SystemChangelog_seed_v1_6_1",
    sql: `INSERT OR IGNORE INTO "SystemChangelog" ("id","version","title","description","changes","deployedAt","createdAt","updatedAt") VALUES (
      'changelog-v1-6-1',
      'v1.6.1',
      'Grupos de contatos para disparo individual',
      'Nova aba no modulo de disparo individual para criar grupos de contatos a partir de grupos WhatsApp e usar essas listas em campanhas.',
      '[{"type":"feature","text":"Nova aba Grupos de Contatos no modulo Disparo Individual"},{"type":"feature","text":"Criacao de grupo de contatos a partir da extracao de um grupo WhatsApp"},{"type":"feature","text":"Botao Criar campanha abre uma campanha individual com a lista de contatos ja carregada"},{"type":"improvement","text":"Listagem centralizada dos grupos de contatos com exportacao CSV e exclusao da lista"}]',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "SystemChangelog_seed_v1_2_0",
    sql: `INSERT OR IGNORE INTO "SystemChangelog" ("id","version","title","description","changes","deployedAt","createdAt","updatedAt") VALUES (
      'changelog-v1-2-0',
      'v1.2.0',
      'Redesign completo do módulo de Conversas',
      'Reformulação total da interface de conversas com layout de 4 colunas inspirado no Chatwoot/WhatsApp Web, correção definitiva do recebimento de mensagens em tempo real e múltiplas melhorias de UX.',
      '[{"type":"fix","text":"Corrigido webhook da Evolution API que apontava para URL de deploy antiga inexistente — mensagens recebidas agora chegam corretamente"},{"type":"fix","text":"APP_URL fixado como variável de ambiente permanente no Vercel para não mudar entre deploys"},{"type":"fix","text":"Método updateWebhook corrigido para usar o formato correto da Evolution API v2 (POST com objeto aninhado)"},{"type":"fix","text":"SSE aprimorado com suporte ao parâmetro ?since= para não perder mensagens durante reconexões"},{"type":"improvement","text":"SSE com auto-reconexão automática em 3s após queda de conexão"},{"type":"improvement","text":"Indicador visual de status do SSE: ponto verde (conectado) / amarelo (reconectando)"},{"type":"improvement","text":"Auto-scroll inteligente: não força scroll ao topo quando usuário está lendo mensagens antigas"},{"type":"improvement","text":"Textarea de envio com auto-resize (até 4 linhas) substituindo input simples"},{"type":"feature","text":"Layout 4 colunas: Instâncias (72px) | Lista de conversas (300px) | Chat (flex) | Painel do contato (300px)"},{"type":"feature","text":"Separadores de dia nas mensagens: HOJE / ONTEM / data por extenso"},{"type":"feature","text":"Agrupamento visual de mensagens consecutivas do mesmo remetente em janelas de 5 minutos"},{"type":"feature","text":"Painel lateral de informações do contato com edição inline de nome, email, notas e coluna do pipeline"},{"type":"feature","text":"Timestamps relativos na lista de conversas: agora, 2min, 14:30, Ontem, 12/05"},{"type":"feature","text":"Filtros em pill tabs na lista de conversas: Todos / Não lidas / Lidas"},{"type":"feature","text":"Drag-and-drop de arquivos diretamente na área de chat"},{"type":"feature","text":"Busca de conversas com botão de limpar"},{"type":"feature","text":"Indicador de status de instância (conectado/desconectado) com badge na lista"}]',
      '2026-05-14T03:30:00.000Z',
      '2026-05-14T03:30:00.000Z',
      '2026-05-14T03:30:00.000Z'
    )`,
  },
];

let ran = false;

export async function runMigrations(): Promise<void> {
  if (ran) return;
  ran = true;
  for (const m of MIGRATIONS) {
    try {
      await prisma.$executeRawUnsafe(m.sql);
    } catch {
      // "duplicate column name" or "table already exists" — safe to ignore
    }
  }
}
