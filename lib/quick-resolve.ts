/**
 * Resolvedor PURO de mensagens do Disparo Rápido.
 *
 * SEM imports de prisma/next: o frontend importa este módulo para gerar o
 * preview com EXATAMENTE a mesma lógica do backend. Não desvie das regras.
 */

/**
 * Resolve uma mensagem em duas etapas:
 *  1. SPIN  — tokens com pipe `{a|b|c}` viram UMA opção aleatória. Uma opção
 *     pode conter UM nível de chaves internas (tokens `{var}`); aninhamentos
 *     mais profundos não são suportados.
 *  2. VARIÁVEIS — tokens `{nome}` viram built-ins (date/time) ou o valor de
 *     `vars` (lookup case-insensitive); ausente vira string vazia.
 *
 * A ordem importa: spin primeiro para que uma opção de spin contendo `{var}`
 * ainda seja resolvida na etapa de variáveis.
 */
export function resolveQuickMessage(message: string, vars: Record<string, string>): string {
  if (!message) return "";

  // Passo 1 (SPIN): tokens com pipe — escolhe uma opção aleatória. As opções
  // aceitam UM nível de chaves internas (ex.: `{Olá {nome}|Oi}`), mas exigem ao
  // menos um `|` de topo, para que `{var}` sozinho NÃO case como spin.
  let result = message.replace(/\{((?:[^{}]|\{[^{}]*\})*\|(?:[^{}]|\{[^{}]*\})*)\}/g, (_match, group: string) => {
    const options = group.split("|");
    return options[Math.floor(Math.random() * options.length)];
  });

  // Mapa case-insensitive das variáveis fornecidas.
  const lowerVars: Record<string, string> = {};
  for (const key of Object.keys(vars || {})) {
    lowerVars[key.toLowerCase()] = vars[key];
  }

  // Passo 2 (VARIÁVEIS): substitui tokens simples `{nome}`.
  result = result.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const lower = name.toLowerCase();
    if (lower === "date") return new Date().toLocaleDateString("pt-BR");
    if (lower === "time") return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (lower in lowerVars) return lowerVars[lower] ?? "";
    return "";
  });

  return result;
}

/**
 * Extrai os nomes únicos de variáveis (tokens simples, sem pipe) presentes na
 * mensagem. Útil para o frontend montar o cabeçalho de colunas/campos.
 */
export function extractVariableNames(message: string): string[] {
  if (!message) return [];
  const names = new Set<string>();
  const matches = message.matchAll(/\{(\w+)\}/g);
  for (const m of matches) {
    names.add(m[1]);
  }
  return [...names];
}
