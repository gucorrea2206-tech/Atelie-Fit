import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdminApiUser } from "../_lib/apiAuth.js";
import { createOperationalJson } from "../_lib/operationsOpenai.js";

type StockInterpretation = {
  tipo: "entrada" | "saida";
  itens: {
    produto: string;
    quantidade: number;
    isKit: boolean;
    substituicoes: { remover: string; adicionar: string }[];
  }[];
};

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

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreCandidate(candidate: string, query: string, sourceText: string) {
  const candidateTokens = normalizeName(candidate).split(" ").filter((token) => token.length > 2);
  const queryText = `${normalizeName(query)} ${normalizeName(sourceText)}`;
  return candidateTokens.reduce((score, token) => score + (queryText.includes(token) ? 1 : 0), 0);
}

function coerceToAllowedName(name: string, sourceText: string, allowedNames: string[]) {
  if (!allowedNames.length) return name;

  const normalizedName = normalizeName(name);
  const exact = allowedNames.find((candidate) => normalizeName(candidate) === normalizedName);
  if (exact) return exact;

  const ranked = allowedNames
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, name, sourceText),
    }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score ? ranked[0].candidate : name;
}

function normalizeInterpretation(result: StockInterpretation, sourceText: string, context: any): StockInterpretation {
  const products = Array.isArray(context?.products) ? context.products : [];
  const kits = Array.isArray(context?.kits) ? context.kits : [];

  return {
    ...result,
    itens: result.itens.map((item) => ({
      ...item,
      produto: coerceToAllowedName(item.produto, sourceText, item.isKit ? kits : products),
      substituicoes: item.substituicoes.map((substitution) => ({
        remover: coerceToAllowedName(substitution.remover, sourceText, products),
        adicionar: coerceToAllowedName(substitution.adicionar, sourceText, products),
      })),
    })),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiUser = await requireAdminApiUser(req, res);
  if (!apiUser) return;

  try {
    const { text, type, context } = req.body || {};
    if (!text || !["entrada", "saida"].includes(type)) {
      return res.status(400).json({ error: "text and type are required" });
    }

    const result = await createOperationalJson<StockInterpretation>({
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

    return res.status(200).json(normalizeInterpretation(result, text, context));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao interpretar texto com IA.";
    console.error("Operational stock AI failed", { error: message });
    return res.status(500).json({ error: message });
  }
}
