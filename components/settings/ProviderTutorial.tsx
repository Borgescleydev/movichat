"use client";

import { useState } from "react";

type TutorialType = "evolution" | "wppconnect";

interface Props {
  onClose: () => void;
  defaultTab?: TutorialType;
}

export default function ProviderTutorial({ onClose, defaultTab = "evolution" }: Props) {
  const [tab, setTab] = useState<TutorialType>(defaultTab);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Guia de Configuração de Provedores</h2>
            <p className="text-xs text-gray-500 mt-0.5">Como configurar a integração com WhatsApp</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 flex gap-2 border-b border-gray-100">
          {[
            { key: "evolution" as const, label: "Evolution API", emoji: "⚡" },
            { key: "wppconnect" as const, label: "WPPConnect", emoji: "🔗" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-3 px-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-green-500 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === "evolution" && <EvolutionGuide />}
          {tab === "wppconnect" && <WPPConnectGuide />}
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="w-7 h-7 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
        {n}
      </div>
      <div className="flex-1 pb-5">
        <p className="font-semibold text-gray-900 mb-2">{title}</p>
        <div className="text-sm text-gray-600 space-y-2">{children}</div>
      </div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <pre className="bg-gray-900 text-green-400 rounded-lg p-3 text-xs overflow-x-auto font-mono leading-relaxed">
        {children}
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="absolute top-2 right-2 text-gray-400 hover:text-white bg-gray-700 rounded px-2 py-0.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? "Copiado!" : "Copiar"}
      </button>
    </div>
  );
}

function InfoBox({ type, children }: { type: "info" | "warn" | "ok"; children: React.ReactNode }) {
  const colors = {
    info: "bg-blue-50 border-blue-200 text-blue-800",
    warn: "bg-yellow-50 border-yellow-200 text-yellow-800",
    ok: "bg-green-50 border-green-200 text-green-800",
  };
  const icons = { info: "ℹ️", warn: "⚠️", ok: "✅" };
  return (
    <div className={`border rounded-lg p-3 text-xs ${colors[type]}`}>
      {icons[type]} {children}
    </div>
  );
}

function EvolutionGuide() {
  return (
    <div className="space-y-1">
      <InfoBox type="ok">
        <strong>Grupos são suportados!</strong> A Evolution API suporta listagem e envio para grupos do WhatsApp, mas a instância precisa estar <strong>conectada</strong> (status verde) para que funcione.
      </InfoBox>

      <div className="mt-5 space-y-0 border-l-2 border-green-100 pl-4">
        <Step n={1} title="Instale a Evolution API com Docker">
          <Code>{`docker run -d \\
  --name evolution-api \\
  -p 8080:8080 \\
  -e AUTHENTICATION_API_KEY=SUA_CHAVE_AQUI \\
  -e AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true \\
  -e QRCODE_LIMIT=30 \\
  atendai/evolution-api:latest`}</Code>
          <InfoBox type="warn">
            Troque <code>SUA_CHAVE_AQUI</code> por uma chave forte e única. Essa é a chave que você usará no Movichat.
          </InfoBox>
        </Step>

        <Step n={2} title="Configure o Movichat com os dados da Evolution">
          <ul className="space-y-1 list-disc list-inside">
            <li><strong>Tipo:</strong> Evolution API</li>
            <li><strong>URL Base:</strong> <code className="bg-gray-100 px-1 rounded">http://SEU-IP:8080</code> (ou domínio público)</li>
            <li><strong>API Key:</strong> o valor de <code className="bg-gray-100 px-1 rounded">AUTHENTICATION_API_KEY</code></li>
          </ul>
          <InfoBox type="info">
            A URL deve ser acessível publicamente se você estiver usando o Movichat no Vercel. Para ambiente local, use ngrok ou similar.
          </InfoBox>
        </Step>

        <Step n={3} title="Configure o Webhook na Evolution">
          <p>Ao criar uma instância no Movichat, o webhook é configurado automaticamente. Mas se precisar configurar manualmente, use a URL:</p>
          <Code>{`https://movichat.vercel.app/api/whatsapp/webhook`}</Code>
          <p>Ou via API da Evolution:</p>
          <Code>{`curl -X POST http://SEU-IP:8080/webhook/set/NOME_INSTANCIA \\
  -H "apikey: SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://movichat.vercel.app/api/whatsapp/webhook",
    "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"]
  }'`}</Code>
        </Step>

        <Step n={4} title="Crie uma instância e conecte o WhatsApp">
          <ol className="list-decimal list-inside space-y-1">
            <li>Clique em <strong>"Nova Instância"</strong> no card do provedor</li>
            <li>Um QR Code aparecerá — escaneie com o WhatsApp do celular</li>
            <li>Vá em WhatsApp → <strong>Aparelhos Conectados</strong> → Conectar Aparelho</li>
            <li>Após conectar, o status ficará verde</li>
          </ol>
        </Step>

        <Step n={5} title="Sincronize os grupos">
          <ol className="list-decimal list-inside space-y-1">
            <li>Acesse <strong>Campanhas → Grupos</strong></li>
            <li>Selecione a instância conectada</li>
            <li>Clique em <strong>"Sincronizar Grupos"</strong></li>
          </ol>
          <InfoBox type="warn">
            A instância precisa estar com status <strong>Conectado</strong> (ponto verde) para que a listagem de grupos funcione. Instâncias desconectadas retornarão erro.
          </InfoBox>
        </Step>
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 p-4 space-y-2">
        <p className="font-semibold text-sm text-gray-800">Solução de problemas comuns</p>
        <div className="space-y-2 text-xs text-gray-600">
          <div className="flex gap-2">
            <span className="text-red-500 font-bold flex-shrink-0">●</span>
            <div><strong>Grupos não aparecem:</strong> Verifique se a instância está conectada (status verde). Grupos só são listados por instâncias ativas.</div>
          </div>
          <div className="flex gap-2">
            <span className="text-red-500 font-bold flex-shrink-0">●</span>
            <div><strong>Erro de autenticação:</strong> Confirme que <code>AUTHENTICATION_API_KEY</code> no Docker é igual ao campo "API Key" no Movichat.</div>
          </div>
          <div className="flex gap-2">
            <span className="text-red-500 font-bold flex-shrink-0">●</span>
            <div><strong>Não consigo pingar o servidor:</strong> A URL base deve ser acessível externamente. Tente abrir no navegador: <code>http://SEU-IP:8080/instance/fetchInstances</code></div>
          </div>
          <div className="flex gap-2">
            <span className="text-red-500 font-bold flex-shrink-0">●</span>
            <div><strong>QR Code não aparece:</strong> A Evolution API pode estar sem espaço em memória ou com o limite de QR codes atingido. Reinicie o container.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WPPConnectGuide() {
  return (
    <div className="space-y-1">
      <InfoBox type="ok">
        <strong>WPPConnect é gratuito e open source!</strong> Auto-hospedado via Docker. Suporta grupos, mensagens, arquivos e webhooks. Ideal como alternativa à Evolution API.
      </InfoBox>

      <div className="mt-5 space-y-0 border-l-2 border-green-100 pl-4">
        <Step n={1} title="Instale o WPPConnect Server com Docker">
          <Code>{`docker run -d \\
  --name wppconnect \\
  -p 21465:21465 \\
  -e SECRETKEY=MINHA_CHAVE_SECRETA \\
  -e PORT=21465 \\
  wppconnect/wppconnect-server:latest`}</Code>
          <InfoBox type="warn">
            Troque <code>MINHA_CHAVE_SECRETA</code> por uma chave forte. Esse valor vai no campo <strong>API Key</strong> do Movichat.
          </InfoBox>
        </Step>

        <Step n={2} title="Configure no Movichat">
          <ul className="space-y-1 list-disc list-inside">
            <li><strong>Tipo:</strong> WPPConnect</li>
            <li><strong>URL Base:</strong> <code className="bg-gray-100 px-1 rounded">http://SEU-IP:21465</code></li>
            <li><strong>API Key (Secret Key):</strong> o valor de <code className="bg-gray-100 px-1 rounded">SECRETKEY</code></li>
          </ul>
        </Step>

        <Step n={3} title="Teste a conexão com o servidor">
          <p>Clique em <strong>"Testar Conexão"</strong> no card do provedor. Você deve ver:</p>
          <InfoBox type="ok">Servidor WPPConnect acessível</InfoBox>
          <p className="mt-2">Ou acesse no navegador:</p>
          <Code>{`http://SEU-IP:21465/api/MINHA_CHAVE_SECRETA/WPPCONNECT/generate-token`}</Code>
        </Step>

        <Step n={4} title="Crie uma instância e conecte o WhatsApp">
          <ol className="list-decimal list-inside space-y-1">
            <li>Clique em <strong>"Nova Instância"</strong></li>
            <li>Escaneie o QR Code que aparecerá</li>
            <li>Após conectar, o status fica verde automaticamente</li>
          </ol>
          <InfoBox type="info">
            O WPPConnect usa "sessões" internamente — cada instância no Movichat corresponde a uma sessão no servidor.
          </InfoBox>
        </Step>

        <Step n={5} title="Requisitos do servidor">
          <ul className="space-y-1 list-disc list-inside">
            <li>Mínimo 1GB RAM (recomendado 2GB)</li>
            <li>Chrome/Chromium instalado (incluído na imagem Docker)</li>
            <li>Porta 21465 acessível externamente para webhooks</li>
          </ul>
        </Step>
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 p-4 space-y-2">
        <p className="font-semibold text-sm text-gray-800">Comparação Evolution API vs WPPConnect</p>
        <table className="w-full text-xs text-gray-600 border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left py-2 px-3 border border-gray-200">Recurso</th>
              <th className="text-center py-2 px-3 border border-gray-200">Evolution</th>
              <th className="text-center py-2 px-3 border border-gray-200">WPPConnect</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Gratuito / Open Source", "✅", "✅"],
              ["Grupos", "✅", "✅"],
              ["Múltiplas instâncias", "✅", "✅"],
              ["Webhook", "✅", "✅"],
              ["Estabilidade", "Alta", "Média"],
              ["Documentação", "Excelente", "Boa"],
              ["RAM necessária", "~512MB", "~1-2GB"],
              ["Protocolo", "Baileys (nativo)", "Chrome headless"],
            ].map(([feature, ev, wpp]) => (
              <tr key={feature}>
                <td className="py-1.5 px-3 border border-gray-100">{feature}</td>
                <td className="py-1.5 px-3 border border-gray-100 text-center">{ev}</td>
                <td className="py-1.5 px-3 border border-gray-100 text-center">{wpp}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <InfoBox type="info">
          <strong>Recomendação:</strong> A Evolution API é mais estável e leve. Use WPPConnect se tiver problemas com a Evolution ou precisar de uma alternativa.
        </InfoBox>
      </div>
    </div>
  );
}
