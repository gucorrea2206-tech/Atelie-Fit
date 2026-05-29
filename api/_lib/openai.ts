import { requireEnv } from "./env.js";

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

function fallbackDecision(message: string): AgentDecision {
  const lowerMessage = message.toLowerCase();
  const isSupport = ["atras", "erro", "problema", "reclama", "cancel", "troca", "pedido errado"].some((term) =>
    lowerMessage.includes(term)
  );
  const isRecovery = ["voltar", "promo", "desconto", "orcamento", "orçamento"].some((term) => lowerMessage.includes(term));

  if (isSupport) {
    return {
      intent: "suporte",
      agent: "Caio",
      shouldReply: true,
      reply: "Oi! Sinto muito por isso. Me passa, por favor, seu nome e o que aconteceu com o pedido para eu te ajudar agora.",
      confidence: 0.55,
      reason: "fallback_suporte",
    };
  }

  if (isRecovery) {
    return {
      intent: "recuperacao",
      agent: "Maya",
      shouldReply: true,
      reply: "Oi! Que bom te ver por aqui. Me conta seu objetivo da semana que eu te ajudo a escolher um combo leve e pratico.",
      confidence: 0.5,
      reason: "fallback_recuperacao",
    };
  }

  return {
    intent: "vendas",
    agent: "Nina",
    shouldReply: true,
    reply: "Oi! Claro. Me diz se voce quer marmitas para quantos dias e se tem alguma restricao alimentar. Ai eu te ajudo com as melhores opcoes.",
    confidence: 0.5,
    reason: "fallback_vendas",
  };
}

export async function decideAgentReply(message: string, context: Record<string, unknown> = {}): Promise<AgentDecision> {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

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
        instructions: systemInstructions,
        max_output_tokens: 220,
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
  } catch (error) {
    console.error("OpenAI decision failed, using fallback", {
      error: error instanceof Error ? error.message : "Unknown OpenAI error",
    });
    return fallbackDecision(message);
  } finally {
    clearTimeout(timeout);
  }
}
