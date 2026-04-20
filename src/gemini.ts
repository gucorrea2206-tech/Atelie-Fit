import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

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
