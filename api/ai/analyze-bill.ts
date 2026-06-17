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

function extractJsonText(text: string) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] || trimmed).trim();
}

function getBillPrompt() {
  return `Extraia os campos do boleto/conta da imagem.

Retorne somente JSON com:
- nome: fornecedor, beneficiario ou emitente; nunca use apenas o nome do banco.
- valor: valor total a pagar em reais como numero decimal.
- codigoPagamento: linha digitavel, codigo de barras, codigo PIX copia-e-cola ou chave PIX. Preserve todos os digitos.
- dataVencimento: vencimento em YYYY-MM-DD.
- categoria: categoria curta como Alimentos, Embalagens, Energia, Aluguel, Impostos, Servicos ou Outros.
- confianca: numero de 0 a 1.
- observacoes: explique apenas quando algum campo estiver duvidoso.

Regras:
1. Leia apenas o que estiver visivel. Nao chute dados.
2. Priorize "linha digitavel", "codigo de barras", "vencimento", "valor do documento", "valor a pagar" e "beneficiario".
3. Nao confunda agencia/conta, CNPJ, nosso numero ou numero do documento com linha digitavel.
4. Nao confunda desconto, juros, multa ou subtotal com valor total.
5. Se o campo estiver ilegivel, use string vazia ou 0 e reduza confianca.`;
}

async function analyzeBillWithGemini({
  apiKey,
  base64Image,
  mimeType,
}: {
  apiKey: string;
  base64Image: string;
  mimeType: string;
}) {
  const model = process.env.GEMINI_BILL_MODEL || "gemini-2.5-flash";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: getBillPrompt() },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: billSchema,
        },
      }),
    }
  ).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini bill analysis failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const outputText = data.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("\n") || "";
  if (!outputText) {
    throw new Error("Gemini bill analysis did not include output text.");
  }

  return normalizeBillAnalysis(JSON.parse(extractJsonText(outputText)));
}

async function analyzeBillWithOpenAI({
  apiKey,
  base64Image,
  mimeType,
}: {
  apiKey: string;
  base64Image: string;
  mimeType: string;
}) {
  const model = process.env.OPENAI_BILL_MODEL || "gpt-4o";
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
              text: getBillPrompt(),
            },
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${base64Image}`,
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

  return normalizeBillAnalysis(JSON.parse(extractJsonText(outputText)));
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

    const imageMimeType = String(mimeType || "image/jpeg");
    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    if (geminiApiKey) {
      return res.status(200).json(
        await analyzeBillWithGemini({
          apiKey: geminiApiKey,
          base64Image,
          mimeType: imageMimeType,
        })
      );
    }

    return res.status(200).json(
      await analyzeBillWithOpenAI({
        apiKey: requireEnv("OPENAI_API_KEY"),
        base64Image,
        mimeType: imageMimeType,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar imagem do boleto.";
    console.error("Operational bill AI failed", { error: message });
    return res.status(500).json({ error: message });
  }
}
