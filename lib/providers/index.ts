import { UazApiProvider } from "./uazapi";
import { EvolutionApiProvider } from "./evolution";
import type { WhatsAppProvider } from "./types";

export * from "./types";

const providers: Record<string, WhatsAppProvider> = {
  uazapi: new UazApiProvider(),
  evolution: new EvolutionApiProvider(),
};

export function getProvider(type: string): WhatsAppProvider {
  const provider = providers[type];
  if (!provider) throw new Error(`Provedor desconhecido: ${type}`);
  return provider;
}

export const PROVIDER_TYPES = [
  { value: "uazapi", label: "UazAPI", url_hint: "https://free.uazapi.dev" },
  { value: "evolution", label: "Evolution API", url_hint: "https://sua-evolution.exemplo.com" },
];
