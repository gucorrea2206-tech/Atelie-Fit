import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createOperationalJson } from "../_lib/operationsOpenai.js";

const stockSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tipo", "itens"],
  properties: {
    tipo: { type: "string", enum: ["entrada", "saida"] },
    itens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["produto", "quantidade", "isKit", "substituicoes"],
        properties: {
          produto: { type: "string" },
          quantidade: { type: "number" },
          isKit: { type: "boolean" },
          substituicoes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["remover", "adicionar"],
              properties: {
                remover: { type: "string" },
                adicionar: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, type, context } = req.body || {};
    if (!text || !["entrada", "saida"].includes(type)) {
      return res.status(400).json({ error: "text and type are required" });
    }

    const result = await createOperationalJson({
      schemaName: "stock_interpretation",
      schema: stockSchema,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Interprete o texto abaixo para uma operacao de ${type === "entrada" ? "PRODUCAO" : "VENDA"}.

TEXTO DO CLIENTE/ATELIE: "${text}"

CARDAPIO PERMITIDO (use apenas estes nomes):
PRODUTOS: ${context?.products?.length ? context.products.join(", ") : "Nenhum cadastrado"}
KITS: ${context?.kits?.length ? context.kits.join(", ") : "Nenhum cadastrado"}

Regras:
1. Identifique produto ou kit e quantidade numerica.
2. Mapeie nomes parecidos para nomes exatos do cardapio.
3. Se for kit, marque isKit como true.
4. Se houver substituicao em kit, preencha substituicoes com remover/adicionar.
5. O campo tipo deve ser exatamente "${type}".`,
            },
          ],
        },
      ],
    });

    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao interpretar texto com IA.";
    console.error("Operational stock AI failed", { error: message });
    return res.status(500).json({ error: message });
  }
}
