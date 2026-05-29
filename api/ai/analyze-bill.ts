import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createOperationalJson } from "../_lib/operationsOpenai.js";

export const config = {
  maxDuration: 60,
};

const billSchema = {
  type: "object",
  additionalProperties: false,
  required: ["nome", "valor", "codigoPagamento", "dataVencimento", "categoria"],
  properties: {
    nome: { type: "string" },
    valor: { type: "number" },
    codigoPagamento: { type: "string" },
    dataVencimento: { type: "string" },
    categoria: { type: "string" },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { base64Image } = req.body || {};
    if (!base64Image) {
      return res.status(400).json({ error: "base64Image is required" });
    }

    const result = await createOperationalJson({
      schemaName: "bill_analysis",
      schema: billSchema,
      maxOutputTokens: 500,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Analise a imagem deste boleto e extraia:
1. Nome do fornecedor (nome)
2. Valor do boleto como numero (valor)
3. Codigo de barras ou linha digitavel (codigoPagamento)
4. Data de vencimento no formato YYYY-MM-DD (dataVencimento)
5. Categoria da despesa, por exemplo Alimentos, Embalagens, Energia, etc. (categoria)

Retorne somente o JSON estruturado.`,
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${base64Image}`,
            },
          ],
        },
      ],
    });

    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar imagem do boleto.";
    console.error("Operational bill AI failed", { error: message });
    return res.status(500).json({ error: message });
  }
}
