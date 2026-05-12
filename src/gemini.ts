import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.PAID_GEMINI_KEY || process.env.GEMINI_API_KEY || "" });

export interface AIInterpretation {
  tipo: 'entrada' | 'saida';
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

export async function interpretStockText(
  text: string, 
  type: 'entrada' | 'saida',
  context: { products: string[], kits: string[] }
): Promise<AIInterpretation> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Você é um assistente de gestão de estoque para marmitas saudáveis. 
      Interprete o texto abaixo para uma operação de ${type === 'entrada' ? 'PRODUÇÃO' : 'VENDA'}.

      TEXTO DO CLIENTE/ATELIÊ: "${text}"

      CARDÁPIO PERMITIDO (Use APENAS estes nomes):
      PRODUTOS: ${context.products.length > 0 ? context.products.join(', ') : 'Nenhum cadastrado'}
      KITS: ${context.kits.length > 0 ? context.kits.join(', ') : 'Nenhum cadastrado'}

      REGRAS DE OURO:
      1. Identifique o produto ou kit e a quantidade numérica. 
      2. Mapeie nomes parecidos para os nomes EXATOS do CARDÁPIO acima.
      3. Se for um kit, marque "isKit: true".
      4. Se houver substituição em kit (ex: trocando X por Y), registre em "substituicoes" com "remover" e "adicionar".
      5. Retorne APENAS o JSON puro.

      FORMATO JSON:
      {
        "tipo": "${type}",
        "itens": [
          { "produto": "Nome do Cardápio", "quantidade": 1, "isKit": false, "substituicoes": [] }
        ]
      }`,
      config: {
        responseMimeType: "application/json"
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("A IA retornou uma resposta vazia. Tente novamente.");
    }

    // Limpeza rigorosa para evitar quebra por conta de blocos markdown
    const cleanJson = resultText.replace(/```json\n?|```/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (error: any) {
    console.error("Erro na interpretação da IA:", error);
    if (error instanceof SyntaxError) {
      throw new Error("Erro de processamento da IA. Tente simplificar o texto do pedido.");
    }
    throw error;
  }
}

export interface AIBillItem {
  nome: string;
  valor: number;
  codigoPagamento: string;
  dataVencimento: string; // ISO date string
  categoria: string;
}

export async function analyzeBillImage(base64Image: string): Promise<AIBillItem> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { 
        parts: [
          {
            text: `Analise a imagem deste boleto e extraia as seguintes informações em formato JSON:
            1. Nome do Fornecedor (nome)
            2. Valor do boleto (valor - apenas número)
            3. Código de barras ou linha digitável para pagamento (codigoPagamento)
            4. Data de vencimento no formato YYYY-MM-DD (dataVencimento)
            5. Estilo de mercadoria ou categoria (categoria - ex: Alimentos, Embalagens, Energia, etc.)

            Retorne APENAS o JSON puro no seguinte formato:
            {
              "nome": "NOME DO FORNECEDOR",
              "valor": 123.45,
              "codigoPagamento": "0000000000000000000000000000000",
              "dataVencimento": "2024-12-31",
              "categoria": "CATEGORIA"
            }`
          },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image
            }
          }
        ]
      },
      config: {
        responseMimeType: "application/json"
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("A IA não conseguiu ler a imagem do boleto. Tente novamente com uma foto mais nítida.");
    }

    const cleanJson = resultText.replace(/```json\n?|```/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (error: any) {
    console.error("Erro na análise da imagem do boleto:", error);
    throw new Error("Erro ao processar imagem do boleto. Verifique se a iluminação está boa.");
  }
}
