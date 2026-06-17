export interface AIInterpretation {
  tipo: "entrada" | "saida";
  itens: {
    produto: string;
    quantidade: number;
    isKit?: boolean;
    substituicoes?: {
      remover: string;
      adicionar: string;
    }[];
  }[];
}

export interface AIBillItem {
  nome: string;
  valor: number;
  codigoPagamento: string;
  dataVencimento: string;
  categoria: string;
  confianca?: number;
  observacoes?: string;
}

async function postJson<T>(url: string, body: unknown, fallbackMessage: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || fallbackMessage);
  }

  return response.json();
}

export async function interpretStockText(
  text: string,
  type: "entrada" | "saida",
  context: { products: string[]; kits: string[] }
): Promise<AIInterpretation> {
  return postJson<AIInterpretation>(
    "/api/ai/interpret-stock",
    { text, type, context },
    "Erro de processamento da IA. Tente simplificar o texto do pedido."
  );
}

export async function analyzeBillImage(base64Image: string, mimeType?: string): Promise<AIBillItem> {
  return postJson<AIBillItem>(
    "/api/ai/analyze-bill",
    { base64Image, mimeType },
    "Erro ao processar imagem do boleto. Verifique se a iluminacao esta boa."
  );
}
