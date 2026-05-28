import { requireEnv } from "./env";

export type Intent = "vendas" | "suporte" | "recuperacao" | "humano" | "triagem";

export interface AgentDecision {
  intent: Intent;
  agent: "Lia" | "Nina" | "Caio" | "Maya" | "Humano";
  shouldReply: boolean;
  reply: string;
  confidence: number;
  reason: string;
}

const systemInstructions = `
Voce atende clientes do Atelie Fit pelo WhatsApp.
O negocio vende marmitas fit, kits semanais, combos e lanches saudaveis.

Agentes:
- Lia: triagem inicial. Identifica intencao e coleta informacoes basicas.
- Nina: vendas. Fala de cardapio, kits, objetivos fitness, preco e entrega.
- Caio: suporte. Resolve atraso, reclamacao, troca, cancelamento e problemas.
- Maya: recuperacao. Reativa clientes parados e orcamentos sem resposta.

Regras:
- Seja curto, humano e natural para WhatsApp.
- Nao invente dados de pagamento, endereco ou disponibilidade.
- Se houver reclamacao forte, pedido errado, atraso serio ou cliente irritado, marque humano.
- Responda somente JSON valido com: intent, agent, shouldReply, reply, confidence, reason.
`;

export async function decideAgentReply(message: string, context: Record<string, unknown> = {}): Promise<AgentDecision> {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: systemInstructions,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({ message, context }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "agent_decision",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["intent", "agent", "shouldReply", "reply", "confidence", "reason"],
            properties: {
              intent: { type: "string", enum: ["vendas", "suporte", "recuperacao", "humano", "triagem"] },
              agent: { type: "string", enum: ["Lia", "Nina", "Caio", "Maya", "Humano"] },
              shouldReply: { type: "boolean" },
              reply: { type: "string" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              reason: { type: "string" },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI response failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const text = data.output_text || data.output?.flatMap((item: any) => item.content || []).find((item: any) => item.text)?.text;
  if (!text) {
    throw new Error("OpenAI response did not include output_text.");
  }

  return JSON.parse(text) as AgentDecision;
}
