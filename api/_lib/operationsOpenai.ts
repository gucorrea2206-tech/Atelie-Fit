import { requireEnv } from "./env.js";

const operationsInstructions = `
Voce e a inteligencia operacional do Atelie Fit.
Sua funcao e interpretar pedidos, producoes, vendas, boletos e documentos internos para manter estoque e financeiro corretos.
Voce nao e agente comercial de WhatsApp e nao deve conversar com clientes.

Regras gerais:
- Responda sempre somente com JSON valido no formato pedido.
- Preserve nomes, valores e datas com precisao.
- Quando houver cardapio permitido, use apenas os nomes exatos fornecidos.
- Se o texto estiver ambiguo, escolha a interpretacao mais provavel, sem inventar produtos fora do cardapio.
`;

export async function createOperationalJson<T>({
  input,
  schema,
  schemaName,
  maxOutputTokens = 700,
}: {
  input: unknown[];
  schema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens?: number;
}): Promise<T> {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_OPERATIONS_MODEL || "gpt-4o-mini";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: operationsInstructions,
        max_output_tokens: maxOutputTokens,
        input,
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            schema,
          },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI operations request failed: ${response.status} ${body}`);
    }

    const data = await response.json();
    const outputText =
      data.output_text ||
      data.output?.flatMap((item: any) => item.content || []).find((item: any) => item.text)?.text;

    if (!outputText) {
      throw new Error("OpenAI operations response did not include output_text.");
    }

    return JSON.parse(outputText) as T;
  } finally {
    clearTimeout(timeout);
  }
}
