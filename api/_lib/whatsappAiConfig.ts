import { getAdminDb } from "./firebaseAdmin.js";

export type AgentName = "Lia" | "Nina" | "Caio" | "Maya";

export type WhatsAppAgentConfig = {
  name: AgentName;
  role: string;
  status: "Ativo" | "Revisão";
  tone: string;
  goal: string;
  prompt: string;
  enabled: boolean;
};

export type WhatsAppKnowledgeConfig = {
  menu: string;
  prices: string;
  promotions: string;
  delivery: string;
  policies: string;
  recovery: string;
};

export type WhatsAppAiConfig = {
  active: boolean;
  businessName: string;
  defaultAgent: AgentName;
  tone: string;
  agents: WhatsAppAgentConfig[];
  knowledge: WhatsAppKnowledgeConfig;
};

const defaultAgents: WhatsAppAgentConfig[] = [
  {
    name: "Lia",
    role: "Atendimento inicial",
    status: "Ativo",
    tone: "Acolhedor, direto e consultivo",
    goal: "Entender intenção, coletar bairro e direcionar sem parecer robô.",
    prompt: "Identifique a intenção inicial, colete bairro e necessidade principal. Direcione para vendas, suporte, recuperação ou humano quando necessário.",
    enabled: true,
  },
  {
    name: "Nina",
    role: "Vendas e cardápio",
    status: "Ativo",
    tone: "Persuasivo, leve e orientado a benefícios",
    goal: "Recomendar marmitas, kits e combos semanais para fechar pedido.",
    prompt: "Atenda dúvidas de cardápio, preços, kits, combos, entrega e objetivos alimentares. Recomende opções usando apenas a base comercial cadastrada.",
    enabled: true,
  },
  {
    name: "Caio",
    role: "Suporte e pós-venda",
    status: "Ativo",
    tone: "Calmo, resolutivo e empático",
    goal: "Resolver atraso, troca, item incorreto e acionar atendimento humano.",
    prompt: "Resolva problemas de atraso, pedido incorreto, troca, cancelamento e reclamações. Seja calmo, peça dados essenciais e acione humano em casos sensíveis.",
    enabled: true,
  },
  {
    name: "Maya",
    role: "Recuperação",
    status: "Revisão",
    tone: "Gentil, oportuno e sem insistência",
    goal: "Reativar clientes parados e recuperar orçamentos sem resposta.",
    prompt: "Recupere clientes parados e orçamentos sem resposta com abordagem gentil, objetiva e sem insistência.",
    enabled: false,
  },
];

const defaultKnowledge: WhatsAppKnowledgeConfig = {
  menu: "",
  prices: "",
  promotions: "",
  delivery: "",
  policies: "",
  recovery: "",
};

export const defaultWhatsappAiConfig: WhatsAppAiConfig = {
  active: true,
  businessName: "Ateliê Fit",
  defaultAgent: "Lia",
  tone: "humano, curto, simpático e consultivo",
  agents: defaultAgents,
  knowledge: defaultKnowledge,
};

export async function getWhatsappAiConfig(): Promise<WhatsAppAiConfig> {
  const db = getAdminDb();
  const snapshot = await db.collection("whatsapp_ai_config").doc("main").get();
  if (!snapshot.exists) {
    return defaultWhatsappAiConfig;
  }

  const data = snapshot.data() || {};
  const savedAgents = Array.isArray(data.agents) ? data.agents : [];

  return {
    ...defaultWhatsappAiConfig,
    ...data,
    agents: defaultAgents.map((defaultAgent) => ({
      ...defaultAgent,
      ...(savedAgents.find((agent: WhatsAppAgentConfig) => agent.name === defaultAgent.name) || {}),
    })),
    knowledge: {
      ...defaultKnowledge,
      ...(data.knowledge || {}),
    },
  };
}
