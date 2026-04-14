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
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Interprete o seguinte texto de ${type === 'entrada' ? 'produção' : 'vendas'} de marmitas e retorne um JSON estruturado.
    
    Texto: "${text}"
    
    Contexto do Cardápio (Produtos e Kits conhecidos):
    Produtos: ${context.products.join(', ')}
    Kits: ${context.kits.join(', ')}
    
    Regras:
    1. Identifique o nome do produto ou kit. Você DEVE usar EXCLUSIVAMENTE os nomes fornecidos no contexto.
    2. Se o usuário mencionar algo que não está no contexto, tente encontrar o correspondente mais próximo no contexto.
    3. Identifique a quantidade.
    4. O tipo deve ser "${type}".
    5. Se o item identificado for um KIT (baseado no contexto), marque "isKit: true".
    6. Se o usuário mencionar substituições em um kit (ex: "Kit X trocando Y por Z"), identifique os itens a remover e adicionar.
       - "remover": nome exato da marmita que sai do kit (deve estar na lista de Produtos).
       - "adicionar": nome exato da marmita que entra no lugar (deve estar na lista de Produtos).
    7. NÃO invente novos nomes de produtos. Use apenas o que está na lista de Produtos ou Kits.
    
    Formato esperado:
    {
      "tipo": "${type}",
      "itens": [
        { 
          "produto": "nome exato do kit", 
          "quantidade": 1, 
          "isKit": true,
          "substituicoes": [
            { "remover": "nome da marmita que sai", "adicionar": "nome da marmita que entra" }
          ]
        }
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
                quantidade: { type: Type.NUMBER },
                isKit: { type: Type.BOOLEAN },
                substituicoes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      remover: { type: Type.STRING },
                      adicionar: { type: Type.STRING }
                    },
                    required: ["remover", "adicionar"]
                  }
                }
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
