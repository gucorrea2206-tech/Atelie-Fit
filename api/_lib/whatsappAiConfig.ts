import { getAdminDb } from "./firebaseAdmin.js";

export type AgentName = "Lia" | "Nina" | "Caio" | "Maya";

export type WhatsAppAgentConfig = {
  name: AgentName;
  role: string;
  status: "Ativo" | "Revisão";
  tone: string;
  goal: string;
  prompt: string;
  handoffRules: string;
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
  agentKnowledge: Partial<Record<AgentName, WhatsAppKnowledgeConfig>>;
  automations: WhatsAppAutomationConfig[];
};

export type WhatsAppAutomationConfig = {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  triggerDays?: number;
  agent: AgentName;
  message: string;
};

const defaultAgents: WhatsAppAgentConfig[] = [
  {
    name: "Lia",
    role: "Atendimento inicial",
    status: "Ativo",
    tone: "Acolhedor, direto e consultivo",
    goal: "Entender intenção, coletar bairro e direcionar sem parecer robô.",
    prompt: "Identifique a intenção inicial, colete bairro e necessidade principal. Direcione para vendas, suporte, recuperação ou humano quando necessário.",
    handoffRules: "Transferir para Nina quando houver intenção de compra, cardápio, preço, combo ou entrega. Transferir para Caio quando houver problema, atraso, troca, cancelamento ou reclamação. Transferir para Maya quando houver cliente parado, cupom de retorno ou orçamento sem resposta.",
    enabled: true,
  },
  {
    name: "Nina",
    role: "Vendas e cardápio",
    status: "Ativo",
    tone: "Persuasivo, leve e orientado a benefícios",
    goal: "Recomendar marmitas, kits e combos semanais para fechar pedido.",
    prompt: "Atenda dúvidas de cardápio, preços, kits, combos, entrega e objetivos alimentares. Recomende opções usando apenas a base comercial cadastrada.",
    handoffRules: "Transferir para Caio quando a conversa virar reclamação, atraso, pedido errado, cancelamento ou suporte. Transferir para humano quando faltar informação confiável, houver irritação ou risco financeiro.",
    enabled: true,
  },
  {
    name: "Caio",
    role: "Suporte e pós-venda",
    status: "Ativo",
    tone: "Calmo, resolutivo e empático",
    goal: "Resolver atraso, troca, item incorreto e acionar atendimento humano.",
    prompt: "Resolva problemas de atraso, pedido incorreto, troca, cancelamento e reclamações. Seja calmo, peça dados essenciais e acione humano em casos sensíveis.",
    handoffRules: "Transferir para Nina quando o problema for resolvido e o cliente quiser comprar novamente. Transferir para humano em reclamação forte, pedido sensível ou caso sem informação suficiente.",
    enabled: true,
  },
  {
    name: "Maya",
    role: "Recuperação",
    status: "Revisão",
    tone: "Gentil, oportuno e sem insistência",
    goal: "Reativar clientes parados e recuperar orçamentos sem resposta.",
    prompt: "Recupere clientes parados e orçamentos sem resposta com abordagem gentil, objetiva e sem insistência.",
    handoffRules: "Transferir para Nina quando o cliente demonstrar intenção clara de compra. Transferir para Caio se a resposta virar problema, reclamação ou suporte.",
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

const defaultAgentKnowledge: Partial<Record<AgentName, WhatsAppKnowledgeConfig>> = {
  Lia: {
    ...defaultKnowledge,
    policies: "Base de triagem: identificar intencao, coletar bairro, nome e necessidade. Encaminhar vendas para Nina, suporte para Caio e recuperacao para Maya.",
  },
  Nina: {
    ...defaultKnowledge,
    prices: "Usar o cardapio do estoque como fonte principal. Confirmar disponibilidade antes de fechar pedido.",
  },
  Caio: {
    ...defaultKnowledge,
    policies: "Pedir nome, telefone e numero do pedido em casos de atraso, troca, item incorreto, cancelamento ou reclamacao.",
  },
  Maya: {
    ...defaultKnowledge,
    recovery: "Abordagem gentil para clientes parados, sem insistencia apos recusa.",
  },
};

const defaultAutomations: WhatsAppAutomationConfig[] = [
  {
    id: "inactive_15_days",
    title: "Cliente parado 15 dias",
    description: "Identifica clientes sem compra recente e prepara recuperacao.",
    enabled: true,
    triggerDays: 15,
    agent: "Maya",
    message: "Oi! Vi que faz um tempinho que voce nao pede com a gente. Quer que eu te mande uma sugestao de kit para esta semana?",
  },
  {
    id: "post_delivery",
    title: "Pos-entrega",
    description: "Acompanha satisfacao apos compra recente.",
    enabled: false,
    triggerDays: 1,
    agent: "Caio",
    message: "Oi! Passando para saber se deu tudo certo com seu pedido do Atelie Fit.",
  },
  {
    id: "promo_return",
    title: "Cupom de retorno",
    description: "Segmenta clientes elegiveis para oferta de retorno.",
    enabled: false,
    triggerDays: 30,
    agent: "Maya",
    message: "Tenho uma condicao especial para voce voltar essa semana. Quer ver as opcoes?",
  },
  {
    id: "stock_low",
    title: "Estoque baixo",
    description: "Orienta agentes a sugerirem alternativas disponiveis.",
    enabled: true,
    agent: "Nina",
    message: "Quando um item estiver baixo, sugerir a alternativa mais proxima disponivel no estoque.",
  },
];

export const defaultWhatsappAiConfig: WhatsAppAiConfig = {
  active: true,
  businessName: "Ateliê Fit",
  defaultAgent: "Lia",
  tone: "humano, curto, simpático e consultivo",
  agents: defaultAgents,
  knowledge: defaultKnowledge,
  agentKnowledge: defaultAgentKnowledge,
  automations: defaultAutomations,
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
    agentKnowledge: {
      ...defaultAgentKnowledge,
      ...(data.agentKnowledge || {}),
    },
    automations: defaultAutomations.map((defaultAutomation) => ({
      ...defaultAutomation,
      ...(Array.isArray(data.automations)
        ? data.automations.find((automation: WhatsAppAutomationConfig) => automation.id === defaultAutomation.id) || {}
        : {}),
    })),
  };
}
