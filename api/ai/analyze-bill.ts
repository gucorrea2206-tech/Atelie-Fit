import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireEnv } from "../_lib/env.js";

export const config = {
  maxDuration: 60,
};

type BillAnalysis = {
  nome: string;
  valor: number;
  codigoPagamento: string;
  dataVencimento: string;
  categoria: string;
  confianca: number;
  observacoes: string;
};

const billSchema = {
  type: "object",
  additionalProperties: false,
  required: ["nome", "valor", "codigoPagamento", "dataVencimento", "categoria", "confianca", "observacoes"],
  properties: {
    nome: { type: "string" },
    valor: { type: "number" },
    codigoPagamento: { type: "string" },
    dataVencimento: { type: "string" },
    categoria: { type: "string" },
    confianca: { type: "number" },
    observacoes: { type: "string" },
  },
};

function cleanPaymentCode(value: string) {
  const text = String(value || "").trim();
  const digits = text.replace(/\D/g, "");
  if ([44, 47, 48].includes(digits.length)) return digits;
  return text;
}

function normalizeDate(value: string) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const brazilianDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brazilianDate) {
    return `${brazilianDate[3]}-${brazilianDate[2]}-${brazilianDate[1]}`;
  }

  return "";
}

function normalizeBillAnalysis(result: BillAnalysis): BillAnalysis {
  return {
    nome: String(result.nome || "").trim(),
    valor: Number.isFinite(Number(result.valor)) ? Number(result.valor) : 0,
    codigoPagamento: cleanPaymentCode(result.codigoPagamento),
    dataVencimento: normalizeDate(result.dataVencimento),
    categoria: String(result.categoria || "").trim(),
    confianca: Number.isFinite(Number(result.confianca)) ? Number(result.confianca) : 0,
    observacoes: String(result.observacoes || "").trim(),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { base64Image, mimeType } = req.body || {};
    if (!base64Image) {
      return res.status(400).json({ error: "base64Image is required" });
    }

    const apiKey = requireEnv("OPENAI_API_KEY");
    const model = process.env.OPENAI_BILL_MODEL || "gpt-4o";
    const imageMimeType = String(mimeType || "image/jpeg");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_output_tokens: 900,
        instructions: `Voce e um OCR especializado em boletos, DANFEs, faturas e contas brasileiras.
Leia apenas o que estiver visivel na imagem. Nao chute dados.
Se um campo nao estiver legivel, retorne string vazia para texto, 0 para valor e reduza a confianca.
O codigoPagamento deve ser a linha digitavel ou codigo de barras do boleto, preferencialmente somente numeros.
Data de vencimento deve ser sempre YYYY-MM-DD.
Valor deve ser numero decimal em reais, sem simbolo R$.
Categoria deve ser curta, como Alimentos, Embalagens, Energia, Aluguel, Impostos, Servicos ou Outros.`,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Extraia os campos do boleto/conta da imagem.

Prioridades:
1. Identifique a linha digitavel do boleto, normalmente agrupada em blocos numericos no topo ou rodape.
2. Leia o vencimento exatamente como aparece e converta para YYYY-MM-DD.
3. Leia o valor total a pagar, nao confunda desconto, juros, multa ou subtotal.
4. Nome deve ser o fornecedor/beneficiario/emitente, nao o banco.
5. Se houver PIX em vez de boleto, coloque a chave/copia-e-cola em codigoPagamento.
6. Se houver duvida relevante, explique em observacoes e reduza confianca.`,
              },
              {
                type: "input_image",
                image_url: `data:${imageMimeType};base64,${base64Image}`,
                detail: "high",
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "bill_analysis",
            schema: billSchema,
          },
        },
      }),
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI bill analysis failed: ${response.status} ${body}`);
    }

    const data = await response.json();
    const outputText =
      data.output_text ||
      data.output?.flatMap((item: any) => item.content || []).find((item: any) => item.text)?.text;

    if (!outputText) {
      throw new Error("OpenAI bill analysis did not include output_text.");
    }

    return res.status(200).json(normalizeBillAnalysis(JSON.parse(outputText)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar imagem do boleto.";
    console.error("Operational bill AI failed", { error: message });
    return res.status(500).json({ error: message });
  }
}
