import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface AIInterpretation {
  tipo: 'entrada' | 'saida';
  itens: {
    produto: string;
    quantidade: number;
    isKit?: boolean;
  }[];
}

export async function interpretStockText(
  text: string, 
  type: 'entrada' | 'saida',
  context: { products: string[], kits: string[] }
): Promise<AIInterpretation> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Interprete o seguinte texto de ${type === 'entrada' ? 'produção' : 'vendas'} de marmitas e retorne um JSON estruturado.
    
    Texto: "${text}"
    
    Contexto do Cardápio (Produtos e Kits conhecidos):
    Produtos: ${context.products.join(', ')}
    Kits: ${context.kits.join(', ')}
    
    Regras:
    1. Identifique o nome do produto ou kit. Você DEVE usar EXCLUSIVAMENTE os nomes fornecidos no contexto.
    2. Se o usuário mencionar algo que não está no contexto, tente encontrar o correspondente mais próximo no contexto. Se não houver correspondência mínima, ignore o item ou retorne o nome mais provável do contexto.
    3. Identifique a quantidade.
    4. O tipo deve ser "${type}".
    5. Se o item identificado for um KIT (baseado no contexto), marque "isKit: true".
    6. NÃO invente novos nomes de produtos. Use apenas o que está na lista de Produtos ou Kits.
    
    Formato esperado:
    {
      "tipo": "${type}",
      "itens": [
        { "produto": "nome exato do produto ou kit", "quantidade": 10, "isKit": false }
      ]
    }`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          tipo: { type: Type.STRING, enum: ["entrada", "saida"] },
          itens: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                produto: { type: Type.STRING },
                quantidade: { type: Type.NUMBER }
              },
              required: ["produto", "quantidade"]
            }
          }
        },
        required: ["tipo", "itens"]
      }
    }
  });

  return JSON.parse(response.text);
}
