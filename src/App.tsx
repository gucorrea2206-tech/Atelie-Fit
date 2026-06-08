import React, { useState, useEffect } from 'react';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logout, 
  Product, 
  Movement, 
  StockItem, 
  Kit,
  Supplier,
  ShoppingProduct,
  Bill,
  Sale,
  PromokitLead,
  OperationalEvent,
  CampaignDispatchQueueItem,
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  setDoc,
  serverTimestamp, 
  deleteDoc,
  updateDoc,
  writeBatch,
  doc,
  Timestamp
} from 'firebase/firestore';
import { interpretStockText, AIInterpretation, analyzeBillImage, AIBillItem } from './operationalAi';
import { buildCampaignAudienceSegments, CampaignAudienceSegment, getLeadInactiveDays } from './campaignAudience';
import { buildProductionRecommendations } from './productionInsights';
import { 
  Plus, 
  Minus, 
  Package, 
  History, 
  Brain, 
  LogOut, 
  LogIn, 
  Check, 
  Loader2,
  AlertCircle,
  Settings,
  Trash2,
  ChevronRight,
  ChevronDown,
  LayoutDashboard,
  Calendar,
  ShoppingCart,
  Store,
  UserPlus,
  FileText,
  Copy,
  CreditCard,
  Wallet,
  Clock,
  AlertTriangle,
  Repeat,
  DollarSign,
  Camera,
  Image as ImageIcon,
  MessageCircle,
  PlugZap,
  Send,
  Headphones,
  RefreshCcw,
  Tag,
  CheckCircle2,
  Activity,
  Bot,
  Route,
  Zap,
  Megaphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  subDays,
  startOfDay,
  endOfDay
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Error Boundary Component
function ErrorDisplay({ error, onRetry }: { error: string, onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-red-50">
      <div className="max-w-md w-full bg-white p-6 rounded-2xl shadow-xl border border-red-100">
        <div className="flex items-center gap-3 text-red-600 mb-4">
          <AlertCircle size={24} />
          <h2 className="text-lg font-semibold">Erro no Sistema</h2>
        </div>
        <p className="text-gray-600 mb-6 text-sm break-words">{error}</p>
        <button 
          onClick={onRetry}
          className="w-full py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
        >
          Tentar Novamente
        </button>
      </div>
    </div>
  );
}

type WhatsAppEnvironment = 'dashboard' | 'atendimento' | 'leads' | 'configuracoes';
type WhatsAppConfigTab = 'agentes' | 'base' | 'automacoes' | 'campanhas' | 'integracoes';

const whatsappConversations = [
  {
    id: 1,
    customer: 'Mariana Alves',
    intent: 'Comprar kit semanal',
    agent: 'Nina',
    time: 'Agora',
    score: 92,
    messages: [
      { from: 'client', text: 'Oi, queria um cardápio fit pra semana. Quero emagrecer mas sem passar fome.' },
      { from: 'agent', text: 'Perfeito, Mariana. Para esse objetivo eu indicaria o Kit Equilíbrio com 10 marmitas. Você prefere frango, carne ou misto?' },
      { from: 'client', text: 'Misto. Entrega no Centro?' },
    ],
  },
  {
    id: 2,
    customer: 'Rafael Costa',
    intent: 'Atraso na entrega',
    agent: 'Caio',
    time: '8 min',
    score: 34,
    messages: [
      { from: 'client', text: 'Meu pedido era pra chegar 12h e nada até agora.' },
      { from: 'agent', text: 'Sinto muito pelo atraso, Rafael. Vou verificar o pedido e já te retorno com a previsão atualizada.' },
    ],
  },
  {
    id: 3,
    customer: 'Bianca Prado',
    intent: 'Orçamento parado',
    agent: 'Maya',
    time: '23 min',
    score: 76,
    messages: [
      { from: 'agent', text: 'Bianca, deixei separado o combo de 5 almoços com 10% de desconto até hoje. Quer que eu finalize pra você?' },
    ],
  },
];

const whatsappAgents = [
  {
    name: 'Lia',
    role: 'Atendimento inicial',
    status: 'Ativo',
    tone: 'Acolhedor, direto e consultivo',
    goal: 'Entender intenção, coletar bairro e direcionar sem parecer robô.',
  },
  {
    name: 'Nina',
    role: 'Vendas e cardápio',
    status: 'Ativo',
    tone: 'Persuasivo, leve e orientado a benefícios',
    goal: 'Recomendar marmitas, kits e combos semanais para fechar pedido.',
  },
  {
    name: 'Caio',
    role: 'Suporte e pós-venda',
    status: 'Ativo',
    tone: 'Calmo, resolutivo e empático',
    goal: 'Resolver atraso, troca, item incorreto e acionar atendimento humano.',
  },
  {
    name: 'Maya',
    role: 'Recuperação',
    status: 'Revisão',
    tone: 'Gentil, oportuno e sem insistência',
    goal: 'Reativar clientes parados e recuperar orçamentos sem resposta.',
  },
];

type WhatsAppAgentConfig = {
  name: string;
  role: string;
  status: 'Ativo' | 'Revisão';
  tone: string;
  goal: string;
  prompt: string;
  handoffRules: string;
  enabled: boolean;
};

type WhatsAppKnowledgeConfig = {
  menu: string;
  prices: string;
  promotions: string;
  delivery: string;
  policies: string;
  recovery: string;
};

type WhatsAppAgentKnowledgeConfig = Record<string, WhatsAppKnowledgeConfig>;

type WhatsAppAutomationConfig = {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  triggerDays?: number;
  agent: string;
  message: string;
};

type WhatsAppFlowStepType = 'wait' | 'message' | 'condition' | 'randomizer' | 'handoff';

type WhatsAppFlowStep = {
  id: string;
  type: WhatsAppFlowStepType;
  title: string;
  trigger: string;
  message: string;
  agent: string;
  position: { x: number; y: number };
};

type WhatsAppCampaignConfig = {
  id: string;
  name: string;
  status: 'Rascunho' | 'Finalizada' | 'Pausada';
  audience: string;
  agent: string;
  campaignAgent: string;
  handoffAgent: string;
  objective: string;
  couponCode: string;
  couponDetails: string;
  campaignKnowledge: string;
  initialMessage: string;
  randomizerEnabled: boolean;
  messageVariants: string[];
  triggerKeyword: string;
  flowReply: string;
  responseRecognition: string;
  responseInstructions: string;
  handoffRules: string;
  flowSteps: WhatsAppFlowStep[];
};

type WhatsAppCampaignAssistantConfig = {
  name: string;
  tone: string;
  prompt: string;
  knowledge: string;
  responseRecognition: string;
  defaultHandoffRules: string;
};

const defaultWhatsappAgents: WhatsAppAgentConfig[] = whatsappAgents.map(agent => ({
  ...agent,
  status: agent.status as 'Ativo' | 'Revisão',
  enabled: agent.status === 'Ativo',
  prompt:
    agent.name === 'Lia' ? 'Identifique a intenção inicial, colete bairro e necessidade principal. Direcione para vendas, suporte, recuperação ou humano quando necessário.' :
    agent.name === 'Nina' ? 'Atenda dúvidas de cardápio, preços, kits, combos, entrega e objetivos alimentares. Recomende opções usando apenas a base comercial cadastrada.' :
    agent.name === 'Caio' ? 'Resolva problemas de atraso, pedido incorreto, troca, cancelamento e reclamações. Seja calmo, peça dados essenciais e acione humano em casos sensíveis.' :
    'Recupere clientes parados e orçamentos sem resposta com abordagem gentil, objetiva e sem insistência.',
  handoffRules:
    agent.name === 'Lia' ? 'Transferir para Nina quando houver intenção de compra, cardápio, preço, combo ou entrega. Transferir para Caio quando houver problema, atraso, troca, cancelamento ou reclamação. Transferir para Maya quando houver cliente parado, cupom de retorno ou orçamento sem resposta.' :
    agent.name === 'Nina' ? 'Transferir para Caio quando a conversa virar reclamação, atraso, pedido errado, cancelamento ou suporte. Transferir para humano quando faltar informação confiável, houver irritação ou risco financeiro.' :
    agent.name === 'Caio' ? 'Transferir para Nina quando o problema for resolvido e o cliente quiser comprar novamente. Transferir para humano em reclamação forte, pedido sensível ou caso sem informação suficiente.' :
    'Transferir para Nina quando o cliente demonstrar intenção clara de compra. Transferir para Caio se a resposta virar problema, reclamação ou suporte.',
}));

const defaultWhatsappKnowledge: WhatsAppKnowledgeConfig = {
  menu: '',
  prices: '',
  promotions: '',
  delivery: '',
  policies: '',
  recovery: '',
};

const defaultAgentKnowledge = defaultWhatsappAgents.reduce((acc, agent) => {
  acc[agent.name] = { ...defaultWhatsappKnowledge };
  return acc;
}, {} as WhatsAppAgentKnowledgeConfig);

const defaultWhatsappAutomations: WhatsAppAutomationConfig[] = [
  {
    id: 'inactive_15_days',
    title: 'Cliente parado 15 dias',
    description: 'Identifica clientes sem compra recente e prepara recuperação.',
    enabled: true,
    triggerDays: 15,
    agent: 'Maya',
    message: 'Oi! Vi que faz um tempinho que você não pede com a gente. Quer que eu te mande uma sugestão de kit para esta semana?',
  },
  {
    id: 'post_delivery',
    title: 'Pós-entrega',
    description: 'Acompanha satisfação após compra recente.',
    enabled: false,
    triggerDays: 1,
    agent: 'Caio',
    message: 'Oi! Passando para saber se deu tudo certo com seu pedido do Ateliê Fit.',
  },
  {
    id: 'promo_return',
    title: 'Cupom de retorno',
    description: 'Segmenta clientes elegíveis para oferta de retorno.',
    enabled: false,
    triggerDays: 30,
    agent: 'Maya',
    message: 'Tenho uma condição especial para você voltar essa semana. Quer ver as opções?',
  },
  {
    id: 'stock_low',
    title: 'Estoque baixo',
    description: 'Orienta agentes a sugerirem alternativas disponíveis.',
    enabled: true,
    agent: 'Nina',
    message: 'Quando um item estiver baixo, sugerir a alternativa mais próxima disponível no estoque.',
  },
];

const defaultWhatsappCampaignAssistant: WhatsAppCampaignAssistantConfig = {
  name: 'Clara',
  tone: 'Humano, curto, simpático e consultivo',
  prompt: 'Você é o assistente de campanhas do Ateliê Fit. Quando uma pessoa responder uma campanha, identifique que aquela mensagem é uma resposta ao disparo, leia a campanha de origem, use a base da campanha e responda de forma útil. Se a pessoa quiser o cupom, envie o cupom e a regra. Se demonstrar intenção de compra, passe para o agente vendedor. Se virar problema, passe para suporte.',
  knowledge: 'Use sempre a campanha de origem para entender contexto, cupom, regra, link de cardápio, público e objetivo. Não invente desconto, validade, preço, disponibilidade ou link que não estejam na base da campanha ou na base geral.',
  responseRecognition: 'Toda resposta recebida após um disparo ativo deve ser tratada como resposta de campanha, mesmo que seja apenas "sim", "quero", "manda", emoji, áudio transcrito ou pergunta curta. Primeiro identifique a campanha de origem, depois a intenção.',
  defaultHandoffRules: 'Passar para Nina quando houver intenção de compra, pedido de cardápio, preço, montagem de kit, entrega ou fechamento. Passar para Caio quando houver reclamação, atraso, erro, troca ou suporte.',
};

const createDefaultFlowSteps = (triggerKeyword: string, flowReply: string, agent = 'Maya'): WhatsAppFlowStep[] => [
  {
    id: 'wait_response',
    type: 'wait',
    title: 'Esperar resposta',
    trigger: triggerKeyword,
    message: 'O fluxo continua quando o cliente responder com uma dessas intenções.',
    agent,
    position: { x: 350, y: 110 },
  },
  {
    id: 'reply_options',
    type: 'message',
    title: 'Enviar próxima mensagem',
    trigger: '',
    message: flowReply,
    agent,
    position: { x: 670, y: 110 },
  },
];

const defaultWhatsappCampaigns: WhatsAppCampaignConfig[] = [
  {
    id: 'cupom_retorno',
    name: 'Cupom de retorno',
    status: 'Rascunho',
    audience: 'Clientes sem compra há 15 dias',
    agent: 'Maya',
    campaignAgent: 'Maya',
    handoffAgent: 'Nina',
    objective: 'Reativar clientes parados com uma oferta leve.',
    couponCode: 'ATELIE10',
    couponDetails: '10% de desconto para pedido fechado na semana da campanha.',
    campaignKnowledge: 'Cupom ATELIE10 dá 10% de desconto. Enviar o cupom quando a pessoa demonstrar interesse. Se pedir opções, direcionar para kits e cardápio. Link do cardápio: inserir link oficial aqui.',
    initialMessage: 'Tenho um cupom disponível para você voltar essa semana. Quer que eu te mande?',
    randomizerEnabled: true,
    messageVariants: [
      'Tenho um cupom disponível para você voltar essa semana. Quer que eu te mande?',
      'Separei uma condição especial para você pedir de novo essa semana. Quer ver?',
      'Tenho uma sugestão com cupom para facilitar sua semana. Posso te mandar?',
    ],
    triggerKeyword: 'sim, quero, manda, cupom, quero ver',
    flowReply: 'Perfeito. Me conta se você quer marmitas para quantos dias que eu te mando as melhores opções com o cupom aplicado.',
    responseRecognition: 'Qualquer resposta recebida após esse disparo deve ser tratada como interesse ou dúvida sobre o cupom de retorno.',
    responseInstructions: 'Se a pessoa demonstrar interesse no cupom, envie o código e explique a regra de uso. Se perguntar por cardápio, preço ou kit, encaminhe para vendas.',
    handoffRules: 'Transferir para Nina quando houver intenção de compra, pedido de cardápio, escolha de kit, preço, taxa ou fechamento. Transferir para Caio se virar suporte, atraso ou reclamação.',
    flowSteps: createDefaultFlowSteps('sim, quero, manda, cupom, quero ver', 'Perfeito. Me conta se você quer marmitas para quantos dias que eu te mando as melhores opções com o cupom aplicado.', 'Maya'),
  },
  {
    id: 'kit_semana',
    name: 'Kit da semana',
    status: 'Rascunho',
    audience: 'Leads e clientes ativos',
    agent: 'Nina',
    campaignAgent: 'Maya',
    handoffAgent: 'Nina',
    objective: 'Gerar pedidos de kits semanais.',
    couponCode: '',
    couponDetails: 'Campanha sem cupom obrigatório; foco em resposta para receber opções.',
    campaignKnowledge: 'Campanha para oferecer kits semanais. Se a pessoa responder positivamente, entender quantidade desejada e encaminhar para venda consultiva. Link do cardápio: inserir link oficial aqui.',
    initialMessage: 'Essa semana temos sugestões de kits práticos para deixar suas refeições prontas. Quer receber as opções?',
    randomizerEnabled: false,
    messageVariants: [
      'Essa semana temos sugestões de kits práticos para deixar suas refeições prontas. Quer receber as opções?',
    ],
    triggerKeyword: 'sim, opções, quero, manda',
    flowReply: 'Claro. Você prefere um kit com 5 ou 10 marmitas? E tem alguma restrição alimentar?',
    responseRecognition: 'Qualquer resposta recebida após esse disparo deve ser tratada como interesse em receber opções de kits ou tirar dúvida da campanha.',
    responseInstructions: 'Entender se a pessoa quer opções de kit, tirar uma dúvida simples e encaminhar para vendas quando houver intenção de compra.',
    handoffRules: 'Transferir para Nina quando houver interesse em montar pedido, escolher sabores, confirmar entrega ou preço. Transferir para Caio se houver reclamação ou problema.',
    flowSteps: createDefaultFlowSteps('sim, opções, quero, manda', 'Claro. Você prefere um kit com 5 ou 10 marmitas? E tem alguma restrição alimentar?', 'Nina'),
  },
];

const normalizeWhatsappCampaign = (campaign: Partial<WhatsAppCampaignConfig>, fallback?: WhatsAppCampaignConfig): WhatsAppCampaignConfig => {
  const base = fallback || defaultWhatsappCampaigns[0];
  const rawStatus = (campaign as { status?: string }).status;
  const status = rawStatus === 'Pronta'
    ? 'Finalizada'
    : rawStatus === 'Finalizada' || rawStatus === 'Pausada' || rawStatus === 'Rascunho'
    ? rawStatus
    : 'Rascunho';
  const initialMessage = campaign.initialMessage || base.initialMessage;
  const messageVariants = Array.isArray(campaign.messageVariants) && campaign.messageVariants.length > 0
    ? campaign.messageVariants
    : [initialMessage];
  const flowSteps = Array.isArray(campaign.flowSteps) && campaign.flowSteps.length > 0
    ? campaign.flowSteps.map((step, index) => ({
      id: step.id || `step_${index}`,
      type: step.type || 'message',
      title: step.title || (step.type === 'wait' ? 'Esperar resposta' : 'Mensagem'),
      trigger: step.trigger || '',
      message: step.message || '',
      agent: step.agent || campaign.agent || base.agent,
      position: step.position || { x: 350 + index * 300, y: 110 },
    }))
    : createDefaultFlowSteps(campaign.triggerKeyword || base.triggerKeyword, campaign.flowReply || base.flowReply, campaign.agent || base.agent);

  return {
    ...base,
    ...campaign,
    id: campaign.id || base.id,
    name: campaign.name || base.name,
    status,
    campaignAgent: campaign.campaignAgent || campaign.agent || base.campaignAgent || base.agent,
    handoffAgent: campaign.handoffAgent || base.handoffAgent || 'Nina',
    couponCode: campaign.couponCode || '',
    couponDetails: campaign.couponDetails || base.couponDetails || '',
    campaignKnowledge: campaign.campaignKnowledge || base.campaignKnowledge || '',
    initialMessage,
    randomizerEnabled: Boolean(campaign.randomizerEnabled),
    messageVariants,
    responseRecognition: campaign.responseRecognition || base.responseRecognition || '',
    responseInstructions: campaign.responseInstructions || base.responseInstructions || '',
    handoffRules: campaign.handoffRules || base.handoffRules || '',
    flowSteps,
  };
};

const whatsappKnowledgeSections: { key: keyof WhatsAppKnowledgeConfig; title: string; description: string; placeholder: string }[] = [
  { key: 'menu', title: 'Cardápio', description: 'Itens disponíveis, ingredientes e observações.', placeholder: 'Ex: Frango grelhado com legumes - marmita low carb...' },
  { key: 'prices', title: 'Preços e combos', description: 'Valores, kits semanais e regras de pedido mínimo.', placeholder: 'Ex: Kit 5 marmitas R$ 119,90; Kit 10 marmitas R$ 219,90...' },
  { key: 'promotions', title: 'Promoções', description: 'Campanhas ativas e argumentos comerciais.', placeholder: 'Ex: Primeira compra com 10% off acima de R$ 120...' },
  { key: 'delivery', title: 'Entrega', description: 'Bairros, horários, taxas e retirada.', placeholder: 'Ex: Entregas de segunda a sábado, taxa Centro R$ 8...' },
  { key: 'policies', title: 'Políticas', description: 'Troca, cancelamento, validade, congelamento e pagamento.', placeholder: 'Ex: Cancelamentos até 24h antes; pagamento via Pix...' },
  { key: 'recovery', title: 'Recuperação', description: 'Ofertas e abordagem para clientes parados.', placeholder: 'Ex: Clientes sem compra há 15 dias recebem sugestão de kit semanal...' },
];

type AppTab = 'operacao' | 'dashboard' | 'estoque' | 'producao' | 'vendas' | 'historico' | 'config' | 'compras' | 'contas' | 'campanhas' | 'fluxos' | 'assistenteCampanhas' | 'whatsapp';

const tabMeta: Record<AppTab, { label: string; title: string; description: string }> = {
  operacao: {
    label: 'Central Operacional',
    title: 'Central Operacional',
    description: 'Acompanhe pedidos, automações, estoque crítico e pontos que precisam de atenção.',
  },
  dashboard: {
    label: 'Dashboard',
    title: 'Visão geral',
    description: 'Indicadores principais de estoque, vendas e operação do Ateliê Fit.',
  },
  estoque: {
    label: 'Estoque',
    title: 'Estoque de marmitas',
    description: 'Acompanhe disponibilidade, valor parado e kits montáveis.',
  },
  producao: {
    label: 'Produção',
    title: 'Registrar produção',
    description: 'Use a IA operacional para transformar texto em entradas de estoque.',
  },
  vendas: {
    label: 'Vendas',
    title: 'Vendas e pedidos',
    description: 'Sincronize pedidos da Promokit e acompanhe registros com baixa de estoque.',
  },
  historico: {
    label: 'Histórico',
    title: 'Histórico de movimentações',
    description: 'Veja entradas, saídas e ajustes que formaram o estoque atual.',
  },
  config: {
    label: 'Cardápio',
    title: 'Cardápio e kits',
    description: 'Gerencie produtos, preços e composições usadas pela operação.',
  },
  compras: {
    label: 'Lista de Compras',
    title: 'Compras e fornecedores',
    description: 'Organize insumos, fornecedores e listas de reposição.',
  },
  contas: {
    label: 'Contas a Pagar',
    title: 'Financeiro operacional',
    description: 'Controle contas, vencimentos e pagamentos recorrentes.',
  },
  campanhas: {
    label: 'Campanhas',
    title: 'Campanhas',
    description: 'Crie mensagens para disparar no WhatsApp para listas de clientes.',
  },
  fluxos: {
    label: 'Fluxos',
    title: 'Fluxos de resposta',
    description: 'Configure o que acontece quando alguém responde uma campanha.',
  },
  assistenteCampanhas: {
    label: 'Assistente de campanhas',
    title: 'Assistente de campanhas',
    description: 'Configure o agente que interpreta respostas de campanha e responde o cliente.',
  },
  whatsapp: {
    label: 'WhatsApp IA',
    title: 'WhatsApp IA',
    description: 'Configure agentes, base comercial e integrações de atendimento.',
  },
};

const managementTabs: AppTab[] = ['estoque', 'producao', 'config', 'compras', 'contas'];
const marketingTabs: AppTab[] = ['campanhas', 'fluxos', 'assistenteCampanhas'];
const whatsappSubTabs: { id: WhatsAppEnvironment; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'atendimento', label: 'Atendimento', icon: MessageCircle },
  { id: 'leads', label: 'Leads', icon: UserPlus },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
];
const whatsappConfigTabs: { id: WhatsAppConfigTab; label: string; icon: React.ElementType }[] = [
  { id: 'agentes', label: 'Agentes', icon: Bot },
  { id: 'base', label: 'Base de cardápio', icon: Store },
  { id: 'automacoes', label: 'Automações', icon: RefreshCcw },
  { id: 'integracoes', label: 'Integrações', icon: PlugZap },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openNavGroups, setOpenNavGroups] = useState<Record<string, boolean>>({
    dashboard: false,
    gestao: false,
    marketing: false,
    whatsapp: false,
  });
  
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  
  const [activeTab, setActiveTab] = useState<AppTab>('operacao');
  const [whatsappEnvironment, setWhatsappEnvironment] = useState<WhatsAppEnvironment>('dashboard');
  const [whatsappConfigTab, setWhatsappConfigTab] = useState<WhatsAppConfigTab>('agentes');
  const [editingWhatsappAgent, setEditingWhatsappAgent] = useState<string | null>(null);
  const [selectedWhatsappConversation, setSelectedWhatsappConversation] = useState(1);
  const [whatsappAgentConfigs, setWhatsappAgentConfigs] = useState<WhatsAppAgentConfig[]>(defaultWhatsappAgents);
  const [whatsappKnowledge, setWhatsappKnowledge] = useState<WhatsAppKnowledgeConfig>(defaultWhatsappKnowledge);
  const [whatsappAgentKnowledge, setWhatsappAgentKnowledge] = useState<WhatsAppAgentKnowledgeConfig>(defaultAgentKnowledge);
  const [whatsappAutomations, setWhatsappAutomations] = useState<WhatsAppAutomationConfig[]>(defaultWhatsappAutomations);
  const [whatsappCampaigns, setWhatsappCampaigns] = useState<WhatsAppCampaignConfig[]>(defaultWhatsappCampaigns);
  const [whatsappCampaignAssistant, setWhatsappCampaignAssistant] = useState<WhatsAppCampaignAssistantConfig>(defaultWhatsappCampaignAssistant);
  const [selectedCampaignId, setSelectedCampaignId] = useState(defaultWhatsappCampaigns[0].id);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(defaultWhatsappCampaigns[0].id);
  const [selectedFlowCampaignId, setSelectedFlowCampaignId] = useState(defaultWhatsappCampaigns[0].id);
  const [whatsappLeads, setWhatsappLeads] = useState<PromokitLead[]>([]);
  const [operationalEvents, setOperationalEvents] = useState<OperationalEvent[]>([]);
  const [campaignQueue, setCampaignQueue] = useState<CampaignDispatchQueueItem[]>([]);
  const [selectedAgentKnowledge, setSelectedAgentKnowledge] = useState(defaultWhatsappAgents[1].name);
  const [isRunningAutomations, setIsRunningAutomations] = useState(false);
  const [isQueueingPostSale, setIsQueueingPostSale] = useState(false);
  const [automationResult, setAutomationResult] = useState<any | null>(null);
  const [isQueueingCampaign, setIsQueueingCampaign] = useState(false);
  const [isProcessingCampaignQueue, setIsProcessingCampaignQueue] = useState(false);
  const [campaignQueueResult, setCampaignQueueResult] = useState<any | null>(null);
  const [campaignSchedule, setCampaignSchedule] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [campaignAudienceSegment, setCampaignAudienceSegment] = useState<CampaignAudienceSegment>('parados15');
  const [operationalEventFilter, setOperationalEventFilter] = useState<'todos' | 'error' | 'warning'>('todos');
  const [isSavingWhatsappAi, setIsSavingWhatsappAi] = useState(false);
  const [whatsappAiSavedAt, setWhatsappAiSavedAt] = useState<string | null>(null);
  const [configSubTab, setConfigSubTab] = useState<'produtos' | 'kits' | 'lista'>('produtos');
  const [shoppingSubTab, setShoppingSubTab] = useState<'produtos' | 'fornecedores' | 'lista'>('lista');
  const [billsSubTab, setBillsSubTab] = useState<'lista' | 'pagas' | 'cadastrar'>('lista');
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<AIInterpretation | null>(null);

  // Deletion Confirmation State
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, type: 'product' | 'kit' | 'supplier' | 'shoppingProduct' | 'bill' | 'campaign', name: string } | null>(null);

  // Shopping List State
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [shoppingProducts, setShoppingProducts] = useState<ShoppingProduct[]>([]);
  const [newSupplier, setNewSupplier] = useState({ name: '', location: '', contact: '' });
  const [newShoppingProduct, setNewShoppingProduct] = useState({ name: '', supplierId: '', unit: '' });
  const [shoppingListItems, setShoppingListItems] = useState<Record<string, number>>({});
  const [generatedList, setGeneratedList] = useState<string | null>(null);

  // Bills State
  const [bills, setBills] = useState<Bill[]>([]);
  const [newBill, setNewBill] = useState({ name: '', value: '', paymentCode: '', dueDate: '', isRecurring: false, category: '' });
  const [isAnalyzingBill, setIsAnalyzingBill] = useState(false);

  // Sales State
  const [sales, setSales] = useState<Sale[]>([]);
  const [newSale, setNewSale] = useState({ customerName: '', value: '', saleDate: format(new Date(), 'yyyy-MM-dd') });
  const [isSyncingPromokit, setIsSyncingPromokit] = useState(false);
  const [expandedSaleDetails, setExpandedSaleDetails] = useState<Record<string, boolean>>({});
  const [promokitLastOrderCode, setPromokitLastOrderCode] = useState('');
  const [promokitSyncResult, setPromokitSyncResult] = useState<{
    count: number;
    savedCodes: string[];
    processedSales: { code: string; createdSale: boolean; movementCount: number; syncedProductCount: number }[];
    nextLastOrderCode: string;
  } | null>(null);

  // Dashboard State
  const [startDate, setStartDate] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // Kit Creation State
  const [newKitName, setNewKitName] = useState('');
  const [newKitPrice, setNewKitPrice] = useState('');
  const [kitItems, setKitItems] = useState<{ productId: string, quantity: number }[]>([]);

  // Product Creation State
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email !== 'ateliefitlondrina@gmail.com') {
        logout();
        setError("Acesso restrito. Apenas o administrador pode acessar este sistema.");
        setUser(null);
      } else {
        setUser(user);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    const productsQuery = query(collection(db, 'products'), orderBy('name'));
    const movementsQuery = query(collection(db, 'movements'), orderBy('createdAt', 'desc'));
    const kitsQuery = query(collection(db, 'kits'), orderBy('name'));

    const unsubProducts = onSnapshot(productsQuery, (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(prods);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'products'));

    const unsubMovements = onSnapshot(movementsQuery, (snapshot) => {
      const movs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Movement));
      setMovements(movs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'movements'));

    const unsubKits = onSnapshot(kitsQuery, (snapshot) => {
      const kts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Kit));
      setKits(kts);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'kits'));

    const unsubSuppliers = onSnapshot(query(collection(db, 'suppliers'), orderBy('name')), (snapshot) => {
      const sups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
      setSuppliers(sups);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'suppliers'));

    const unsubShoppingProducts = onSnapshot(query(collection(db, 'shoppingProducts'), orderBy('name')), (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShoppingProduct));
      setShoppingProducts(prods);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'shoppingProducts'));

    const unsubBills = onSnapshot(query(collection(db, 'bills'), orderBy('dueDate', 'asc')), (snapshot) => {
      const blls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bill));
      setBills(blls);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'bills'));

    const unsubSales = onSnapshot(query(collection(db, 'sales'), orderBy('saleDate', 'desc'), orderBy('createdAt', 'desc')), (snapshot) => {
      const sls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
      setSales(sls);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'sales'));

    const unsubWhatsappAiConfig = onSnapshot(doc(db, 'whatsapp_ai_config', 'main'), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      if (Array.isArray(data.agents)) {
        setWhatsappAgentConfigs(defaultWhatsappAgents.map(defaultAgent => ({
          ...defaultAgent,
          ...(data.agents.find((agent: WhatsAppAgentConfig) => agent.name === defaultAgent.name) || {}),
        })));
      }
      if (data.knowledge) {
        setWhatsappKnowledge({ ...defaultWhatsappKnowledge, ...data.knowledge });
      }
      if (data.agentKnowledge) {
        setWhatsappAgentKnowledge({
          ...defaultAgentKnowledge,
          ...data.agentKnowledge,
        });
      }
      if (Array.isArray(data.automations)) {
        setWhatsappAutomations(defaultWhatsappAutomations.map(defaultAutomation => ({
          ...defaultAutomation,
          ...(data.automations.find((automation: WhatsAppAutomationConfig) => automation.id === defaultAutomation.id) || {}),
        })));
      }
      if (Array.isArray(data.campaigns)) {
        const savedCampaigns = data.campaigns as Partial<WhatsAppCampaignConfig>[];
        const defaultCampaignIds = defaultWhatsappCampaigns.map(campaign => campaign.id);
        const mergedDefaultCampaigns = defaultWhatsappCampaigns.map(defaultCampaign => (
          normalizeWhatsappCampaign(
            savedCampaigns.find(campaign => campaign.id === defaultCampaign.id) || {},
            defaultCampaign,
          )
        ));
        const customCampaigns = savedCampaigns
          .filter(campaign => campaign.id && !defaultCampaignIds.includes(campaign.id))
          .map(campaign => normalizeWhatsappCampaign(campaign));

        setWhatsappCampaigns([...mergedDefaultCampaigns, ...customCampaigns]);
      }
      if (data.campaignAssistant) {
        setWhatsappCampaignAssistant({
          ...defaultWhatsappCampaignAssistant,
          ...data.campaignAssistant,
        });
      }
      if (data.updatedAt) {
        setWhatsappAiSavedAt(data.updatedAt);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'whatsapp_ai_config'));

    const unsubPromokitLeads = onSnapshot(query(collection(db, 'promokit_customers'), orderBy('updatedAt', 'desc')), (snapshot) => {
      const leads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PromokitLead));
      setWhatsappLeads(leads);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'promokit_customers'));

    const unsubOperationalEvents = onSnapshot(query(collection(db, 'operational_events'), orderBy('createdAt', 'desc')), (snapshot) => {
      const events = snapshot.docs.slice(0, 30).map(doc => ({ id: doc.id, ...doc.data() } as OperationalEvent));
      setOperationalEvents(events);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'operational_events'));

    const unsubCampaignQueue = onSnapshot(query(collection(db, 'campaign_dispatch_queue'), orderBy('createdAt', 'desc')), (snapshot) => {
      const queueItems = snapshot.docs.slice(0, 120).map(doc => ({ id: doc.id, ...doc.data() } as CampaignDispatchQueueItem));
      setCampaignQueue(queueItems);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'campaign_dispatch_queue'));

    return () => {
      unsubProducts();
      unsubMovements();
      unsubKits();
      unsubSuppliers();
      unsubShoppingProducts();
      unsubBills();
      unsubSales();
      unsubWhatsappAiConfig();
      unsubPromokitLeads();
      unsubOperationalEvents();
      unsubCampaignQueue();
    };
  }, [user]);

  // Calculate Stock
  useEffect(() => {
    const stockMap = new Map<string, number>();
    
    movements.forEach(m => {
      const current = stockMap.get(m.productId) || 0;
      if (m.type === 'entrada') {
        stockMap.set(m.productId, current + m.quantity);
      } else {
        stockMap.set(m.productId, current - m.quantity);
      }
    });

    const stockItems = products.map(p => ({
      ...p,
      currentStock: stockMap.get(p.id) || 0
    }));

    setStock(stockItems);
  }, [products, movements]);

  const getAuthenticatedHeaders = async () => {
    const token = await auth.currentUser?.getIdToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const handleProcessIA = async (type: 'entrada' | 'saida') => {
    if (!inputText.trim()) return;
    setIsProcessing(true);
    setError(null);
    try {
      const context = {
        products: products.map(p => p.name),
        kits: kits.map(k => k.name)
      };
      const result = await interpretStockText(inputText, type, context);
      setPreview(result);
    } catch (err: any) {
      setError(`Erro na IA: ${err.message || 'Falha ao interpretar texto'}. Tente novamente.`);
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSyncPromokitOrders = async (take = 10) => {
    setIsSyncingPromokit(true);
    setError(null);

    try {
      const response = await fetch('/api/promokit/sync-new-orders', {
        method: 'POST',
        headers: await getAuthenticatedHeaders(),
        body: JSON.stringify({
          lastOrderCode: promokitLastOrderCode.trim() || undefined,
          take,
          status: 'novo',
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Erro ao sincronizar pedidos da Promokit.');
      }

      setPromokitSyncResult(data);
      setPromokitLastOrderCode(data.nextLastOrderCode || '');
    } catch (err: any) {
      setError(err.message || 'Erro ao sincronizar Promokit.');
    } finally {
      setIsSyncingPromokit(false);
    }
  };

  const handleSyncPromokitLeads = async () => {
    setIsSyncingPromokit(true);
    setError(null);

    try {
      const response = await fetch('/api/promokit/sync-orders', {
        method: 'POST',
        headers: await getAuthenticatedHeaders(),
        body: JSON.stringify({
          lastOrderCode: '1',
          take: 50,
          maxPages: 10,
          status: 'todos',
          processSales: false,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Erro ao sincronizar leads da Promokit.');
      }

      setPromokitSyncResult(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao sincronizar leads da Promokit.');
    } finally {
      setIsSyncingPromokit(false);
    }
  };

  const handleWhatsappAgentChange = (agentName: string, field: keyof WhatsAppAgentConfig, value: string | boolean) => {
    setWhatsappAgentConfigs(currentAgents =>
      currentAgents.map(agent =>
        agent.name === agentName
          ? {
              ...agent,
              [field]: value,
              ...(field === 'enabled' ? { status: value ? 'Ativo' : 'Revisão' } : {}),
            }
          : agent
      )
    );
  };

  const handleWhatsappKnowledgeChange = (field: keyof WhatsAppKnowledgeConfig, value: string) => {
    setWhatsappKnowledge(currentKnowledge => ({
      ...currentKnowledge,
      [field]: value,
    }));
  };

  const buildStockMenuKnowledge = () => {
    const marmitas = stock
      .map(item => `- ${item.name}: R$ ${(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}; estoque ${item.currentStock} un`)
      .join('\n');
    const kitLines = kits
      .map(kit => {
        const items = kit.items
          .map(item => {
            const product = products.find(product => product.id === item.productId);
            return `${item.quantity}x ${product?.name || 'produto'}`;
          })
          .join(', ');
        return `- ${kit.name}: R$ ${(kit.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}; composto por ${items || 'itens cadastrados'}`;
      })
      .join('\n');

    return [`Marmitas em estoque:`, marmitas || '- Nenhuma marmita cadastrada.', '', 'Kits cadastrados:', kitLines || '- Nenhum kit cadastrado.'].join('\n');
  };

  const handleWhatsappAgentKnowledgeChange = (agentName: string, field: keyof WhatsAppKnowledgeConfig, value: string) => {
    setWhatsappAgentKnowledge(currentKnowledge => ({
      ...currentKnowledge,
      [agentName]: {
        ...(currentKnowledge[agentName] || defaultWhatsappKnowledge),
        [field]: value,
      },
    }));
  };

  const handleWhatsappAutomationChange = (automationId: string, field: keyof WhatsAppAutomationConfig, value: string | boolean | number) => {
    setWhatsappAutomations(currentAutomations =>
      currentAutomations.map(automation =>
        automation.id === automationId ? { ...automation, [field]: value } : automation
      )
    );
  };

  const handleWhatsappCampaignChange = (campaignId: string, field: keyof WhatsAppCampaignConfig, value: string | boolean | string[]) => {
    setWhatsappCampaigns(currentCampaigns =>
      currentCampaigns.map(campaign => {
        if (campaign.id !== campaignId) return campaign;
        if (field === 'initialMessage' && typeof value === 'string') {
          const variants = campaign.messageVariants.length > 0 ? [...campaign.messageVariants] : [campaign.initialMessage];
          if (!variants[0] || variants[0] === campaign.initialMessage) variants[0] = value;
          return { ...campaign, initialMessage: value, messageVariants: variants };
        }
        return { ...campaign, [field]: value };
      })
    );
  };

  const buildRelatedCampaignVariant = (message: string, variantNumber: number) => {
    const cleanedMessage = message.trim() || 'Tenho uma novidade para você. Quer que eu te mande?';
    const questionMatch = cleanedMessage.match(/([^.!?]*\?)\s*$/);
    const callToAction = questionMatch?.[1] || 'Quer que eu te mande?';
    const coreMessage = questionMatch ? cleanedMessage.replace(questionMatch[1], '').trim() : cleanedMessage.replace(/[.!?]\s*$/, '');
    const openers = ['Passando rapidinho:', 'Separei isso para você:', 'Tenho uma sugestão aqui:', 'Olha essa opção:'];
    const opener = openers[(variantNumber - 1) % openers.length];
    const body = coreMessage || cleanedMessage.replace(callToAction, '').trim() || cleanedMessage;

    return `${opener} ${body.replace(/[.!?]\s*$/, '')}. ${callToAction}`.replace(/\s+/g, ' ').trim();
  };

  const handleAddWhatsappCampaign = () => {
    const timestamp = Date.now();
    const id = `campanha_${timestamp}`;
    setWhatsappCampaigns(currentCampaigns => [
      ...currentCampaigns,
      {
        id,
        name: 'Nova campanha',
        status: 'Rascunho',
        audience: 'Selecionar público',
        agent: 'Maya',
        campaignAgent: 'Maya',
        handoffAgent: 'Nina',
        objective: 'Definir objetivo comercial da campanha.',
        couponCode: '',
        couponDetails: 'Defina a condição, validade e regra de uso do cupom.',
        campaignKnowledge: 'Informe aqui tudo que o assistente deve saber sobre essa campanha: cupom, validade, regra, link do cardápio, público, objeções e respostas importantes.',
        initialMessage: 'Tenho uma novidade para você. Quer que eu te mande?',
        randomizerEnabled: false,
        messageVariants: ['Tenho uma novidade para você. Quer que eu te mande?'],
        triggerKeyword: 'sim, quero, manda',
        flowReply: 'Perfeito. Vou te mandar as opções agora.',
        responseRecognition: 'Qualquer resposta recebida depois desse disparo deve ser reconhecida como resposta desta campanha.',
        responseInstructions: 'Quando o cliente responder, entender a intenção e entregar a informação da campanha se fizer sentido.',
        handoffRules: 'Transferir para Nina quando o cliente quiser comprar, pedir cardápio, preço, kits ou entrega. Transferir para Caio em problemas ou suporte.',
        flowSteps: createDefaultFlowSteps('sim, quero, manda', 'Perfeito. Vou te mandar as opções agora.', 'Maya'),
      },
    ]);
    setSelectedCampaignId(id);
    setEditingCampaignId(id);
    setSelectedFlowCampaignId(id);
  };

  const handleWhatsappCampaignVariantChange = (campaignId: string, index: number, value: string) => {
    setWhatsappCampaigns(currentCampaigns =>
      currentCampaigns.map(campaign => {
        if (campaign.id !== campaignId) return campaign;
        const variants = [...(campaign.messageVariants || [campaign.initialMessage])];
        variants[index] = value;
        return {
          ...campaign,
          messageVariants: variants,
          initialMessage: index === 0 ? value : campaign.initialMessage,
        };
      })
    );
  };

  const handleAddWhatsappCampaignVariant = (campaignId: string) => {
    setWhatsappCampaigns(currentCampaigns =>
      currentCampaigns.map(campaign =>
        campaign.id === campaignId
          ? {
            ...campaign,
            messageVariants: [
              ...(campaign.messageVariants || [campaign.initialMessage]),
              buildRelatedCampaignVariant(campaign.initialMessage, (campaign.messageVariants?.length || 1) + 1),
            ],
          }
          : campaign
      )
    );
  };

  const handleDeleteWhatsappCampaignVariant = (campaignId: string, index: number) => {
    setWhatsappCampaigns(currentCampaigns =>
      currentCampaigns.map(campaign => {
        if (campaign.id !== campaignId || index === 0) return campaign;
        return {
          ...campaign,
          messageVariants: campaign.messageVariants.filter((_, variantIndex) => variantIndex !== index),
        };
      })
    );
  };

  const deleteWhatsappCampaign = (campaignId: string) => {
    const campaign = whatsappCampaigns.find(campaign => campaign.id === campaignId);
    if (!campaign) return;
    setDeleteConfirm({ id: campaignId, type: 'campaign', name: campaign.name });
  };

  const handleWhatsappCampaignAssistantChange = (field: keyof WhatsAppCampaignAssistantConfig, value: string) => {
    setWhatsappCampaignAssistant(currentAssistant => ({
      ...currentAssistant,
      [field]: value,
    }));
  };

  const handleRunWhatsappAutomations = async () => {
    setIsRunningAutomations(true);
    setAutomationResult(null);
    setError(null);

    try {
      const response = await fetch('/api/whatsapp/run-automations', {
        method: 'POST',
        headers: await getAuthenticatedHeaders(),
        body: JSON.stringify({ dryRun: true, automations: whatsappAutomations }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Erro ao rodar automações.');
      }
      setAutomationResult(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao rodar automações.');
    } finally {
      setIsRunningAutomations(false);
    }
  };

  const handleQueuePostSaleFollowups = async () => {
    setIsQueueingPostSale(true);
    setAutomationResult(null);
    setError(null);

    try {
      const response = await fetch('/api/whatsapp/run-automations', {
        method: 'POST',
        headers: await getAuthenticatedHeaders(),
        body: JSON.stringify({
          dryRun: false,
          queueFollowups: true,
          automations: whatsappAutomations.map(automation =>
            automation.id === 'post_delivery'
              ? { ...automation, enabled: true }
              : { ...automation, enabled: false }
          ),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Erro ao preparar pós-venda.');
      }
      setAutomationResult(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao preparar pós-venda.');
    } finally {
      setIsQueueingPostSale(false);
    }
  };

  const handleQueueSelectedCampaign = async () => {
    if (!selectedCampaign) return;
    if (selectedCampaign.status !== 'Finalizada') {
      setError('Finalize a campanha antes de preparar o disparo.');
      return;
    }
    if (campaignRecipients.length === 0) {
      setError('Nenhum lead com telefone disponível para enfileirar.');
      return;
    }

    setIsQueueingCampaign(true);
    setCampaignQueueResult(null);
    setError(null);

    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: await getAuthenticatedHeaders(),
        body: JSON.stringify({
          action: 'enqueue',
          campaignId: selectedCampaign.id,
          recipients: campaignRecipients,
          scheduledFor: campaignSchedule ? new Date(campaignSchedule).toISOString() : new Date().toISOString(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Erro ao preparar fila da campanha.');
      }
      setCampaignQueueResult(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao preparar fila da campanha.');
    } finally {
      setIsQueueingCampaign(false);
    }
  };

  const handleProcessCampaignQueue = async () => {
    setIsProcessingCampaignQueue(true);
    setCampaignQueueResult(null);
    setError(null);

    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: await getAuthenticatedHeaders(),
        body: JSON.stringify({ action: 'processQueue', limit: 12 }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Erro ao processar fila de campanhas.');
      }
      setCampaignQueueResult(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao processar fila de campanhas.');
    } finally {
      setIsProcessingCampaignQueue(false);
    }
  };

  const handleSaveWhatsappAiConfig = async () => {
    setIsSavingWhatsappAi(true);
    setError(null);
    try {
      const updatedAt = new Date().toISOString();
      await setDoc(doc(db, 'whatsapp_ai_config', 'main'), {
        active: true,
        businessName: 'Ateliê Fit',
        defaultAgent: 'Lia',
        tone: 'humano, curto, simpático e consultivo',
        agents: whatsappAgentConfigs,
        knowledge: {
          ...whatsappKnowledge,
          menu: buildStockMenuKnowledge(),
        },
        agentKnowledge: whatsappAgentKnowledge,
        automations: whatsappAutomations,
        campaigns: whatsappCampaigns,
        campaignAssistant: whatsappCampaignAssistant,
        updatedAt,
      }, { merge: true });
      setWhatsappAiSavedAt(updatedAt);
    } catch (err: any) {
      setError(`Erro ao salvar WhatsApp IA: ${err.message || 'falha ao salvar configuração'}`);
    } finally {
      setIsSavingWhatsappAi(false);
    }
  };

  const handleBillImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingBill(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          const result = await analyzeBillImage(base64);
          setNewBill({
            name: result.nome,
            value: result.valor.toString(),
            paymentCode: result.codigoPagamento,
            dueDate: result.dataVencimento,
            category: result.categoria,
            isRecurring: false
          });
        } catch (err: any) {
          setError(err.message);
        } finally {
          setIsAnalyzingBill(false);
        }
      };
      reader.onerror = () => {
        setError("Erro ao ler o arquivo da imagem.");
        setIsAnalyzingBill(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Erro ao processar a imagem.");
      setIsAnalyzingBill(false);
    }
  };

  const confirmMovements = async () => {
    if (!preview) return;
    setIsProcessing(true);
    setError(null);

    try {
      const saleDateTimestamp = preview.tipo === 'saida' && newSale.customerName 
        ? Timestamp.fromDate(new Date(newSale.saleDate + 'T12:00:00'))
        : Timestamp.now();

      const batch = writeBatch(db);
      let totalSaleQuantity = 0;
      let saleId = "";

      // 1. If it's a sale, create the sale doc first to get an ID
      if (preview.tipo === 'saida' && newSale.customerName) {
        const saleRef = doc(collection(db, 'sales'));
        saleId = saleRef.id;
        // We'll set the data later after calculating totalSaleQuantity
      }

      // 2. Process items and prepare movement docs
      for (const item of preview.itens) {
        if (item.isKit) {
          let kit = kits.find(k => k.name.toLowerCase().trim() === item.produto.toLowerCase().trim());
          if (!kit) {
            kit = kits.find(k => k.name.toLowerCase().includes(item.produto.toLowerCase()) || 
                                item.produto.toLowerCase().includes(k.name.toLowerCase()));
          }
          if (!kit) {
            throw new Error(`Kit "${item.produto}" não encontrado no cardápio.`);
          }

          const kitTotalUnits = kit.items.reduce((acc, ki) => acc + ki.quantity, 0) * item.quantidade;
          totalSaleQuantity += kitTotalUnits;

          for (const kitItem of kit.items) {
            const originalProduct = products.find(p => p.id === kitItem.productId);
            let finalProductId = kitItem.productId;
            let finalProductName = originalProduct?.name || 'Produto';

            if (item.substituicoes && item.substituicoes.length > 0) {
              const sub = item.substituicoes.find(s => 
                originalProduct?.name.toLowerCase().includes(s.remover.toLowerCase()) ||
                s.remover.toLowerCase().includes(originalProduct?.name.toLowerCase() || '')
              );

              if (sub) {
                const newProduct = products.find(p => 
                  p.name.toLowerCase().trim() === sub.adicionar.toLowerCase().trim() ||
                  p.name.toLowerCase().includes(sub.adicionar.toLowerCase())
                );
                if (newProduct) {
                  finalProductId = newProduct.id;
                  finalProductName = newProduct.name;
                }
              }
            }

            const totalQty = kitItem.quantity * item.quantidade;
            
            if (preview.tipo === 'saida') {
              const currentStock = stock.find(s => s.id === finalProductId)?.currentStock || 0;
              if (currentStock < totalQty) {
                throw new Error(`Estoque insuficiente de "${finalProductName}". Necessário: ${totalQty}, Atual: ${currentStock}`);
              }
            }

            const movementRef = doc(collection(db, 'movements'));
            batch.set(movementRef, {
              productId: finalProductId,
              type: preview.tipo,
              quantity: totalQty,
              referenceDate: saleDateTimestamp,
              createdAt: serverTimestamp(),
              saleId: saleId || null // Link to sale if applicable
            });
          }
        } else {
          let product = products.find(p => p.name.toLowerCase().trim() === item.produto.toLowerCase().trim());
          if (!product) {
            product = products.find(p => p.name.toLowerCase().includes(item.produto.toLowerCase()) || 
                                      item.produto.toLowerCase().includes(p.name.toLowerCase()));
          }

          let productId = product?.id;
          if (!productId) {
            throw new Error(`Produto "${item.produto}" não encontrado.`);
          }

          if (preview.tipo === 'saida') {
            const currentStock = stock.find(s => s.id === productId)?.currentStock || 0;
            if (currentStock < item.quantidade) {
              throw new Error(`Estoque insuficiente para "${item.produto}". Necessário: ${item.quantidade}, Atual: ${currentStock}`);
            }
          }

          totalSaleQuantity += item.quantidade;

          const movementRef = doc(collection(db, 'movements'));
          batch.set(movementRef, {
            productId,
            type: preview.tipo,
            quantity: item.quantidade,
            referenceDate: saleDateTimestamp,
            createdAt: serverTimestamp(),
            saleId: saleId || null // Link to sale if applicable
          });
        }
      }

      // 3. Finalize Sale doc if applicable
      if (saleId) {
        batch.set(doc(db, 'sales', saleId), {
          customerName: newSale.customerName,
          value: parseFloat(newSale.value) || 0,
          totalQuantity: totalSaleQuantity,
          itemsDescription: preview.itens.map(i => `${i.quantidade}x ${i.produto}`).join(', '),
          saleDate: saleDateTimestamp,
          createdAt: serverTimestamp()
        });
        setNewSale({ customerName: '', value: '', saleDate: format(new Date(), 'yyyy-MM-dd') });
      }

      await batch.commit();
      setPreview(null);
      setInputText('');
      setActiveTab('vendas');
    } catch (err: any) {
      setError(err.message || "Erro ao salvar movimentações.");
    } finally {
      setIsProcessing(false);
    }
  };

  const saveKit = async () => {
    if (!newKitName || kitItems.length === 0) return;
    try {
      await addDoc(collection(db, 'kits'), {
        name: newKitName.toLowerCase(),
        price: newKitPrice ? parseFloat(newKitPrice) : 0,
        items: kitItems,
        createdAt: serverTimestamp()
      });
      setNewKitName('');
      setNewKitPrice('');
      setKitItems([]);
    } catch (err) {
      setError("Erro ao salvar kit.");
    }
  };

  const saveProduct = async () => {
    if (!newProductName.trim()) return;
    try {
      await addDoc(collection(db, 'products'), {
        name: newProductName.toLowerCase().trim(),
        price: newProductPrice ? parseFloat(newProductPrice) : 0,
        createdAt: serverTimestamp()
      });
      setNewProductName('');
      setNewProductPrice('');
    } catch (err) {
      setError("Erro ao salvar produto.");
    }
  };

  const deleteProduct = async (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;

    // Check if product is in any kit
    const isInKit = kits.some(k => k.items.some(i => i.productId === id));
    if (isInKit) {
      setError("Não é possível excluir um produto que faz parte de um kit.");
      return;
    }
    
    setDeleteConfirm({ id, type: 'product', name: product.name });
  };

  const deleteKit = async (id: string) => {
    const kit = kits.find(k => k.id === id);
    if (!kit) return;
    setDeleteConfirm({ id, type: 'kit', name: kit.name });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === 'campaign') {
        const remainingCampaigns = whatsappCampaigns.filter(campaign => campaign.id !== deleteConfirm.id);
        setWhatsappCampaigns(remainingCampaigns);
        const updatedAt = new Date().toISOString();
        await setDoc(doc(db, 'whatsapp_ai_config', 'main'), {
          campaigns: remainingCampaigns,
          updatedAt,
        }, { merge: true });
        setWhatsappAiSavedAt(updatedAt);
        const nextCampaign = remainingCampaigns[0];
        if (nextCampaign) {
          setSelectedCampaignId(nextCampaign.id);
          setSelectedFlowCampaignId(nextCampaign.id);
          setEditingCampaignId(nextCampaign.status === 'Rascunho' ? nextCampaign.id : null);
        } else {
          setEditingCampaignId(null);
        }
      } else if (deleteConfirm.type === 'product') {
        await deleteDoc(doc(db, 'products', deleteConfirm.id));
      } else if (deleteConfirm.type === 'kit') {
        await deleteDoc(doc(db, 'kits', deleteConfirm.id));
      } else if (deleteConfirm.type === 'supplier') {
        await deleteDoc(doc(db, 'suppliers', deleteConfirm.id));
      } else if (deleteConfirm.type === 'shoppingProduct') {
        await deleteDoc(doc(db, 'shoppingProducts', deleteConfirm.id));
      } else if (deleteConfirm.type === 'bill') {
        await deleteDoc(doc(db, 'bills', deleteConfirm.id));
      }
      setDeleteConfirm(null);
    } catch (err) {
      setError(`Erro ao excluir ${deleteConfirm.type}.`);
    }
  };

  const saveSupplier = async () => {
    if (!newSupplier.name.trim()) return;
    try {
      await addDoc(collection(db, 'suppliers'), {
        ...newSupplier,
        createdAt: serverTimestamp()
      });
      setNewSupplier({ name: '', location: '', contact: '' });
    } catch (err) {
      setError("Erro ao salvar fornecedor.");
    }
  };

  const saveShoppingProduct = async () => {
    if (!newShoppingProduct.name.trim() || !newShoppingProduct.supplierId || !newShoppingProduct.unit) return;
    try {
      await addDoc(collection(db, 'shoppingProducts'), {
        ...newShoppingProduct,
        createdAt: serverTimestamp()
      });
      setNewShoppingProduct({ name: '', supplierId: '', unit: '' });
    } catch (err) {
      setError("Erro ao salvar produto de compra.");
    }
  };

  const finalizeShoppingList = () => {
    const selectedItems = Object.entries(shoppingListItems).filter(([_, qty]) => (qty as number) > 0);
    if (selectedItems.length === 0) return;

    const groupedBySupplier: Record<string, string[]> = {};

    selectedItems.forEach(([id, qty]) => {
      const product = shoppingProducts.find(p => p.id === id);
      if (product) {
        const supplier = suppliers.find(s => s.id === product.supplierId);
        const supplierName = supplier?.name || 'Fornecedor Desconhecido';
        if (!groupedBySupplier[supplierName]) {
          groupedBySupplier[supplierName] = [];
        }
        const unitLabel = product.unit;
        groupedBySupplier[supplierName].push(`- ${product.name} / ${qty}${unitLabel}`);
      }
    });

    const today = format(new Date(), 'dd/MM/yyyy');
    let message = `📋 *LISTA DE COMPRAS - ATELIÊ FIT* (${today})\n\n`;
    Object.entries(groupedBySupplier).forEach(([supplier, items]) => {
      message += `*${supplier}*\n${items.join('\n')}\n\n`;
    });

    setGeneratedList(message);
  };

  const saveBill = async () => {
    if (!newBill.name.trim() || !newBill.value || !newBill.dueDate) return;
    try {
      await addDoc(collection(db, 'bills'), {
        name: newBill.name,
        value: Number(newBill.value),
        paymentCode: newBill.paymentCode,
        dueDate: Timestamp.fromDate(new Date(newBill.dueDate + 'T00:00:00')),
        isPaid: false,
        isRecurring: newBill.isRecurring,
        category: newBill.category || '',
        createdAt: serverTimestamp()
      });
      setNewBill({ name: '', value: '', paymentCode: '', dueDate: '', isRecurring: false, category: '' });
      setBillsSubTab('lista');
    } catch (err) {
      setError("Erro ao salvar conta.");
    }
  };

  const toggleBillStatus = async (bill: Bill) => {
    try {
      await updateDoc(doc(db, 'bills', bill.id), {
        isPaid: !bill.isPaid
      });
    } catch (err) {
      setError("Erro ao atualizar status da conta.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-emerald-600" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-emerald-50 flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center"
        >
          <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Package className="text-emerald-600" size={40} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Workspace Ateliê Fit</h1>
          <p className="text-gray-500 mb-8">Gestão de Estoque Inteligente</p>
          <button 
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 py-4 bg-emerald-600 text-white rounded-2xl font-semibold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
          >
            <LogIn size={20} />
            Entrar com Google
          </button>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={() => setError(null)} />;
  }

  const selectedConversation = whatsappConversations.find(c => c.id === selectedWhatsappConversation) || whatsappConversations[0];
  const editingAgent = whatsappAgentConfigs.find(agent => agent.name === editingWhatsappAgent) || null;
  const selectedCampaign = whatsappCampaigns.find(campaign => campaign.id === selectedCampaignId) || whatsappCampaigns[0];
  const selectedFlowCampaign = whatsappCampaigns.find(campaign => campaign.id === selectedFlowCampaignId) || selectedCampaign;
  const isSelectedCampaignEditing = selectedCampaign?.status === 'Rascunho' || editingCampaignId === selectedCampaign?.id;
  const getSaleOrderNumber = (sale: Sale) => sale.orderNumber || sale.promokitOrderCode || sale.id.slice(0, 6).toUpperCase();
  const getSaleMovements = (sale: Sale) => {
    const orderNumber = getSaleOrderNumber(sale);
    return movements.filter(movement =>
      movement.saleId === sale.id ||
      Boolean(sale.promokitOrderCode && movement.promokitOrderCode === sale.promokitOrderCode) ||
      Boolean(orderNumber && movement.promokitOrderCode === orderNumber)
    );
  };
  const getRecognitionLabel = (recognitionSource?: string) => {
    if (recognitionSource === 'promokit_kit_selection') return 'Escolha enviada pela Promokit';
    if (recognitionSource === 'ai_kit_observation') return 'Lido pela IA nas escolhas do kit';
    if (recognitionSource === 'ai_kit_substitution') return 'Troca interpretada pela IA';
    if (recognitionSource === 'local_kit_composition') return 'Composição local do kit';
    return 'Item lançado no estoque';
  };
  const toggleSaleDetails = (saleId: string) => {
    setExpandedSaleDetails(current => ({ ...current, [saleId]: !current[saleId] }));
  };
  const getAgentConversationStats = (agentName: string) => {
    const active = whatsappConversations.filter(conversation => conversation.agent === agentName).length;
    return {
      active,
      finished: agentName === 'Nina' ? 24 : agentName === 'Caio' ? 11 : agentName === 'Maya' ? 8 : 17,
    };
  };
  const currentTabMeta = activeTab === 'whatsapp'
    ? {
        ...tabMeta.whatsapp,
        title:
          whatsappEnvironment === 'dashboard' ? 'Dashboard do WhatsApp' :
          whatsappEnvironment === 'atendimento' ? 'Atendimento WhatsApp' :
          whatsappEnvironment === 'leads' ? 'Leads Promokit' :
          'Configurações do WhatsApp IA',
        description:
          whatsappEnvironment === 'dashboard' ? 'Indicadores e status do atendimento automatizado.' :
          whatsappEnvironment === 'atendimento' ? 'Fila de conversas, preview completo e opção de assumir atendimento.' :
          whatsappEnvironment === 'leads' ? 'Clientes sincronizados da Promokit com telefone, endereço e histórico.' :
          'Agentes, base comercial, automações e integrações do WhatsApp IA.',
      }
    : tabMeta[activeTab];
  const currentMonthRevenue = sales
    .filter(s => {
      const date = s.saleDate?.toDate();
      return date && date >= startOfMonth(new Date()) && date <= endOfMonth(new Date());
    })
    .reduce((acc, s) => acc + s.value, 0);
  const today = new Date();
  const lowStockItems = stock
    .filter(item => item.currentStock <= 10)
    .sort((a, b) => a.currentStock - b.currentStock);
  const outOfStockItems = stock.filter(item => item.currentStock <= 0);
  const salesToday = sales.filter(sale => {
    const date = sale.saleDate?.toDate();
    return date ? isSameDay(date, today) : false;
  });
  const promokitSalesToday = salesToday.filter(sale => sale.source === 'promokit');
  const recentPromokitSales = sales.filter(sale => sale.source === 'promokit').slice(0, 5);
  const stalledLeads = whatsappLeads.filter(lead => {
    if (!lead.lastOrderAt) return false;
    const date = new Date(lead.lastOrderAt);
    if (Number.isNaN(date.getTime())) return false;
    return date < subDays(today, 15);
  });
  const activeCampaigns = whatsappCampaigns.filter(campaign => campaign.status === 'Finalizada' || campaign.status === 'Pausada');
  const readyCampaigns = whatsappCampaigns.filter(campaign => campaign.status === 'Finalizada');
  const pendingCampaignQueue = campaignQueue.filter(item => item.status === 'pending');
  const failedCampaignQueue = campaignQueue.filter(item => item.status === 'failed');
  const stockReviewMovements = movements
    .filter(movement =>
      movement.source === 'promokit' &&
      (
        movement.recognitionSource === 'local_kit_composition' ||
        movement.recognitionSource === 'ai_kit_observation' ||
        movement.recognitionSource === 'ai_kit_substitution' ||
        !products.some(product => product.id === movement.productId)
      )
    )
    .slice(0, 8);
  const campaignKnowledgeMissing = whatsappCampaigns.filter(campaign =>
    campaign.status !== 'Rascunho' && !campaign.campaignKnowledge.trim()
  );
  const pendingHumanConversations = whatsappConversations.filter(conversation => conversation.score < 50);
  const latestOperationalEvents = operationalEvents.slice(0, 8);
  const operationalIssueEvents = operationalEvents
    .filter(event => operationalEventFilter === 'todos' ? ['error', 'warning'].includes(event.status) : event.status === operationalEventFilter)
    .slice(0, 10);
  const operationalIssueCounts = {
    error: operationalEvents.filter(event => event.status === 'error').length,
    warning: operationalEvents.filter(event => event.status === 'warning').length,
  };
  const productionRecommendations = buildProductionRecommendations(stock, movements, today);
  const selectedCampaignQueue = selectedCampaign
    ? campaignQueue.filter(item => item.campaignId === selectedCampaign.id)
    : [];
  const selectedCampaignQueueStats = {
    pending: selectedCampaignQueue.filter(item => item.status === 'pending').length,
    sent: selectedCampaignQueue.filter(item => item.status === 'sent').length,
    failed: selectedCampaignQueue.filter(item => item.status === 'failed').length,
    skipped: selectedCampaignQueue.filter(item => item.status === 'skipped').length,
  };
  const campaignAudienceSegments = buildCampaignAudienceSegments(whatsappLeads, today);
  const selectedCampaignAudience = campaignAudienceSegments.find(segment => segment.id === campaignAudienceSegment) || campaignAudienceSegments[0];
  const campaignRecipients = selectedCampaignAudience.leads
    .slice(0, 200)
    .map(lead => ({
      name: lead.name || 'Cliente',
      phone: lead.phone || '',
    }));
  const operationalWarnings = [
    ...outOfStockItems.slice(0, 3).map(item => ({
      title: `${item.name} sem estoque`,
      description: 'Evite vender esse item e cadastre produção ou substituição.',
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50',
    })),
    ...campaignKnowledgeMissing.slice(0, 2).map(campaign => ({
      title: `${campaign.name} sem base da campanha`,
      description: 'Inclua cupom, regra, link e contexto para o assistente responder certo.',
      icon: Megaphone,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    })),
    ...pendingHumanConversations.slice(0, 2).map(conversation => ({
      title: `${conversation.customer} pode precisar de humano`,
      description: `${conversation.intent} com confiança ${conversation.score}%.`,
      icon: Headphones,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    })),
    ...failedCampaignQueue.slice(0, 2).map(item => ({
      title: `Falha no disparo: ${item.campaignName}`,
      description: item.lastError || `${item.customerName || item.phone || item.remoteJid} não recebeu a campanha.`,
      icon: Send,
      color: 'text-red-600',
      bg: 'bg-red-50',
    })),
    ...stockReviewMovements.slice(0, 2).map(movement => ({
      title: `Revisar baixa do pedido #${movement.promokitOrderCode || '-'}`,
      description: movement.recognitionSource === 'local_kit_composition'
        ? 'Kit baixado pela composição local porque a escolha da Promokit não veio clara.'
        : movement.recognitionSource === 'ai_kit_observation'
          ? 'Kit personalizado baixado pela leitura da IA sobre as escolhas do pedido.'
          : movement.recognitionSource === 'ai_kit_substitution'
            ? 'Kit baixado com troca interpretada pela IA nas observações.'
            : 'Produto da baixa não foi encontrado no cardápio local.',
      icon: Package,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    })),
  ];
  const getTabIcon = (tab: AppTab) => {
    const iconProps = { size: 18 };
    if (tab === 'operacao') return <Zap {...iconProps} />;
    if (tab === 'dashboard') return <LayoutDashboard {...iconProps} />;
    if (tab === 'estoque') return <Package {...iconProps} />;
    if (tab === 'producao') return <Plus {...iconProps} />;
    if (tab === 'vendas') return <Minus {...iconProps} />;
    if (tab === 'config') return <Store {...iconProps} />;
    if (tab === 'compras') return <ShoppingCart {...iconProps} />;
    if (tab === 'contas') return <CreditCard {...iconProps} />;
    if (tab === 'campanhas') return <Megaphone {...iconProps} />;
    if (tab === 'fluxos') return <Route {...iconProps} />;
    if (tab === 'assistenteCampanhas') return <Brain {...iconProps} />;
    if (tab === 'whatsapp') return <MessageCircle {...iconProps} />;
    return <Settings {...iconProps} />;
  };

  const selectTab = (tab: AppTab) => {
    setActiveTab(tab);
    setPreview(null);
    setInputText('');
  };

  const renderNavButton = (tab: AppTab) => (
    <button
      key={tab}
      onClick={() => selectTab(tab)}
      className={`nav-subitem flex items-center gap-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap md:whitespace-normal w-full ${
        activeTab === tab
          ? 'is-active'
          : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
      }`}
    >
      {getTabIcon(tab)}
      <span className="text-left">{tabMeta[tab].label}</span>
    </button>
  );

  const renderNavGroup = ({
    id,
    label,
    icon: Icon,
    tabs = [],
    children,
  }: {
    id: string;
    label: string;
    icon: React.ElementType;
    tabs?: AppTab[];
    children?: React.ReactNode;
  }) => {
    const isOpen = openNavGroups[id];
    const isActive = tabs.includes(activeTab) || (id === 'whatsapp' && activeTab === 'whatsapp') || (id === 'dashboard' && activeTab === 'dashboard');

    return (
      <div className="nav-group">
        <button
          onClick={() => setOpenNavGroups(current => ({ ...current, [id]: !current[id] }))}
          className={`nav-group-button w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all ${
            isActive ? 'is-active text-gray-900 bg-white' : 'text-gray-500 hover:bg-white/70'
          }`}
        >
          <Icon size={18} />
          <span className="flex-1 text-left">{label}</span>
          <ChevronDown size={15} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="nav-sublist mt-2 space-y-1">
            {tabs.map(renderNavButton)}
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="workspace-shell min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="workspace-sidebar bg-white w-full md:w-72 md:min-h-screen border-b md:border-b-0 md:border-r border-gray-100 flex flex-col sticky top-0 z-20">
        <div className="px-5 py-5">
          <div className="brand-panel flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 rounded-lg shrink-0">
              <Package className="text-emerald-600" size={24} />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-base leading-tight">Workspace Ateliê Fit</h1>
              <p className="text-[11px] text-gray-500 mt-1">Operação inteligente</p>
            </div>
            <button onClick={logout} className="md:hidden ml-auto p-2 text-gray-400 hover:text-red-500 transition-colors">
              <LogOut size={20} />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-4 pb-4 space-y-3 overflow-x-auto md:overflow-x-visible flex md:flex-col no-scrollbar">
          {renderNavGroup({
            id: 'dashboard',
            label: 'Dashboard',
            icon: LayoutDashboard,
            tabs: ['operacao', 'dashboard', 'vendas'],
          })}

          {renderNavGroup({
            id: 'gestao',
            label: 'Gestão',
            icon: Settings,
            tabs: managementTabs,
          })}

          {renderNavGroup({
            id: 'marketing',
            label: 'Marketing',
            icon: Megaphone,
            tabs: marketingTabs,
          })}

          {renderNavGroup({
            id: 'whatsapp',
            label: 'WhatsApp',
            icon: MessageCircle,
            children: whatsappSubTabs.map(subTab => (
              <button
                key={subTab.id}
                onClick={() => {
                  selectTab('whatsapp');
                  setWhatsappEnvironment(subTab.id);
                }}
                className={`nav-subitem w-full flex items-center gap-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'whatsapp' && whatsappEnvironment === subTab.id
                    ? 'is-active'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
                }`}
              >
                <subTab.icon size={15} />
                {subTab.label}
              </button>
            )),
          })}
        </nav>

        <div className="hidden md:block mx-4 mb-4">
          <div className="sidebar-summary">
            <p className="text-[10px] font-black uppercase text-gray-400">Vendas do mês</p>
            <p className="text-2xl font-black mt-1">
              R$ {currentMonthRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-500 mt-1">{sales.length} registro(s) no histórico</p>
          </div>
        </div>

        <div className="hidden md:flex p-4 border-t border-gray-50 items-center justify-around">
          <button 
            onClick={() => {
              setActiveTab('historico');
              setPreview(null);
              setInputText('');
            }}
            className={`p-3 rounded-xl transition-all ${
              activeTab === 'historico' 
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' 
                : 'text-gray-500 hover:bg-gray-50'
            }`}
            title="Histórico"
          >
            <History size={20} />
          </button>
          <button 
            onClick={logout} 
            className="p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
            title="Sair da Conta"
          >
            <LogOut size={20} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={`workspace-main flex-1 w-full ${activeTab === 'whatsapp' && whatsappEnvironment === 'atendimento' ? 'p-3 md:p-5 max-w-none' : 'p-5 md:p-8 lg:p-10 max-w-[1500px] mx-auto'}`}>
        {!(activeTab === 'whatsapp' && whatsappEnvironment === 'atendimento') && (
        <header className="workspace-header mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-gray-900">{currentTabMeta.title}</h1>
        </header>
        )}

        <AnimatePresence mode="wait">
          {activeTab === 'operacao' && (
            <motion.div
              key="operacao"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                  { label: 'Pedidos hoje', value: salesToday.length, note: `${promokitSalesToday.length} via Promokit`, icon: ShoppingCart, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Estoque crítico', value: lowStockItems.length, note: `${outOfStockItems.length} zerado(s)`, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
                  { label: 'Leads parados', value: stalledLeads.length, note: '15+ dias sem compra', icon: UserPlus, color: 'text-amber-600', bg: 'bg-amber-50' },
                  { label: 'Fila de campanhas', value: pendingCampaignQueue.length, note: `${failedCampaignQueue.length} falha(s)`, icon: Megaphone, color: 'text-blue-600', bg: 'bg-blue-50' },
                ].map(card => (
                  <div key={card.label} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${card.bg} shrink-0`}>
                      <card.icon className={card.color} size={24} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 truncate">{card.label}</p>
                      <p className={`text-2xl font-black mt-1 ${card.color}`}>{card.value}</p>
                      <p className="text-xs text-gray-500 mt-1 truncate">{card.note}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-6">
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between gap-3 mb-5">
                      <div>
                        <h2 className="text-xl font-black text-gray-900">Prioridades de hoje</h2>
                        <p className="text-sm text-gray-500 mt-1">Pontos que merecem atenção antes de deixar a automação seguir sozinha.</p>
                      </div>
                      <button
                        onClick={() => selectTab('vendas')}
                        className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-2xl text-sm font-bold hover:bg-emerald-700 transition-colors"
                      >
                        <RefreshCcw size={16} />
                        Ver pedidos
                      </button>
                    </div>

                    {operationalWarnings.length === 0 ? (
                      <div className="p-8 text-center rounded-3xl bg-emerald-50 border border-emerald-100">
                        <CheckCircle2 className="mx-auto text-emerald-600 mb-3" size={34} />
                        <p className="font-black text-emerald-900">Nenhuma prioridade crítica agora.</p>
                        <p className="text-sm text-emerald-700 mt-1">Acompanhe pedidos, campanhas e estoque pelos painéis abaixo.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {operationalWarnings.map((warning, index) => (
                          <div key={`${warning.title}-${index}`} className="flex items-start gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                            <div className={`p-2 rounded-xl ${warning.bg} shrink-0`}>
                              <warning.icon className={warning.color} size={18} />
                            </div>
                            <div>
                              <p className="font-black text-gray-900">{warning.title}</p>
                              <p className="text-sm text-gray-500 mt-1">{warning.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
                      <div>
                        <h2 className="text-xl font-black text-gray-900">Últimos pedidos Promokit</h2>
                        <p className="text-sm text-gray-500 mt-1">Use para conferir se a sincronização está mantendo a operação em dia.</p>
                      </div>
                      <button
                        disabled={isSyncingPromokit}
                        onClick={() => handleSyncPromokitOrders()}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-2xl text-sm font-bold hover:bg-gray-800 transition-colors disabled:opacity-50"
                      >
                        {isSyncingPromokit ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
                        Sincronizar
                      </button>
                    </div>

                    {recentPromokitSales.length === 0 ? (
                      <div className="p-8 rounded-3xl border-2 border-dashed border-gray-200 text-center">
                        <ShoppingCart className="mx-auto text-gray-300 mb-3" size={34} />
                        <p className="font-bold text-gray-500">Nenhum pedido Promokit sincronizado ainda.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {recentPromokitSales.map(sale => (
                          <div key={sale.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-black text-gray-900">{sale.customerName}</p>
                                <span className="text-[10px] font-black uppercase bg-lime-50 text-lime-700 border border-lime-100 px-2 py-1 rounded-lg">
                                  #{getSaleOrderNumber(sale)}
                                </span>
                              </div>
                              <p className="text-sm text-gray-500 mt-1 line-clamp-1">{sale.itemsDescription}</p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="text-sm font-black text-emerald-600">R$ {sale.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                              <p className="text-xs text-gray-400">{sale.saleDate?.toDate().toLocaleDateString('pt-BR')}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
                      <div>
                        <h2 className="text-xl font-black text-gray-900">Erros operacionais</h2>
                        <p className="text-sm text-gray-500 mt-1">Falhas e alertas gerados por Promokit, WhatsApp, campanhas e automações.</p>
                      </div>
                      <div className="flex p-1 bg-gray-100 rounded-2xl">
                        {[
                          ['todos', `Todos ${operationalIssueCounts.error + operationalIssueCounts.warning}`],
                          ['error', `Erros ${operationalIssueCounts.error}`],
                          ['warning', `Alertas ${operationalIssueCounts.warning}`],
                        ].map(([id, label]) => (
                          <button
                            key={id}
                            onClick={() => setOperationalEventFilter(id as 'todos' | 'error' | 'warning')}
                            className={`px-3 py-2 rounded-xl text-xs font-black transition-all ${
                              operationalEventFilter === id ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {operationalIssueEvents.length === 0 ? (
                      <div className="p-8 rounded-3xl bg-emerald-50 border border-emerald-100 text-center">
                        <CheckCircle2 className="mx-auto text-emerald-600 mb-3" size={34} />
                        <p className="font-black text-emerald-900">Sem erros operacionais no filtro atual.</p>
                        <p className="text-sm text-emerald-700 mt-1">Quando uma rotina falhar, ela aparece aqui com origem e contexto.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {operationalIssueEvents.map(event => (
                          <div key={event.id} className={`p-4 rounded-2xl border flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                            event.status === 'error' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'
                          }`}>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${
                                  event.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {event.status === 'error' ? 'erro' : 'alerta'}
                                </span>
                                <span className="text-[10px] font-black uppercase text-gray-400">{event.source || 'sistema'}</span>
                              </div>
                              <p className="font-black text-gray-900 mt-2">{event.title}</p>
                              {event.message && <p className="text-sm text-gray-600 mt-1 line-clamp-2">{event.message}</p>}
                              <p className="text-[10px] font-black uppercase text-gray-400 mt-2">
                                {event.createdAt?.toDate ? event.createdAt.toDate().toLocaleString('pt-BR') : 'sem data'}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                if (event.type.includes('promokit')) selectTab('vendas');
                                else if (event.type.includes('campaign')) selectTab('campanhas');
                                else if (event.type.includes('whatsapp')) {
                                  selectTab('whatsapp');
                                  setWhatsappEnvironment('dashboard');
                                } else selectTab('operacao');
                              }}
                              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-gray-700 rounded-2xl text-sm font-black border border-white hover:border-gray-200 transition-all"
                            >
                              Abrir área
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
                      <div>
                        <h2 className="text-xl font-black text-gray-900">Produção sugerida</h2>
                        <p className="text-sm text-gray-500 mt-1">Sugestão baseada no estoque atual e saídas dos últimos 7 dias.</p>
                      </div>
                      <button
                        onClick={() => selectTab('producao')}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-2xl text-sm font-bold hover:bg-emerald-700 transition-colors"
                      >
                        <Plus size={16} />
                        Registrar produção
                      </button>
                    </div>

                    {productionRecommendations.length === 0 ? (
                      <div className="p-8 rounded-3xl bg-emerald-50 border border-emerald-100 text-center">
                        <CheckCircle2 className="mx-auto text-emerald-600 mb-3" size={34} />
                        <p className="font-black text-emerald-900">Estoque confortável agora.</p>
                        <p className="text-sm text-emerald-700 mt-1">Nenhuma produção urgente pelos critérios atuais.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {productionRecommendations.map(item => (
                          <div key={item.id} className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-black text-gray-900">{item.name}</p>
                                <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${
                                  item.urgency === 'alta' ? 'bg-red-100 text-red-700' :
                                  item.urgency === 'media' ? 'bg-amber-100 text-amber-700' :
                                  'bg-gray-100 text-gray-500'
                                }`}>
                                  {item.urgency}
                                </span>
                              </div>
                              <p className="text-sm text-gray-500 mt-1">
                                Estoque {item.currentStock} un · saiu {item.soldLast7Days} un em 7 dias · meta {item.targetStock} un
                              </p>
                            </div>
                            <div className="text-left md:text-right">
                              <p className="text-xs font-black uppercase text-gray-400">Produzir</p>
                              <p className="text-2xl font-black text-emerald-600">{item.suggestedProduction} un</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
                      <div>
                        <h2 className="text-xl font-black text-gray-900">Baixas para revisar</h2>
                        <p className="text-sm text-gray-500 mt-1">Pedidos em que a automação usou uma regra provável para baixar estoque.</p>
                      </div>
                      <button
                        onClick={() => selectTab('historico')}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-2xl text-sm font-bold hover:bg-gray-200 transition-colors"
                      >
                        <History size={16} />
                        Ver histórico
                      </button>
                    </div>

                    {stockReviewMovements.length === 0 ? (
                      <div className="p-8 rounded-3xl bg-emerald-50 border border-emerald-100 text-center">
                        <CheckCircle2 className="mx-auto text-emerald-600 mb-3" size={34} />
                        <p className="font-black text-emerald-900">Nenhuma baixa incerta agora.</p>
                        <p className="text-sm text-emerald-700 mt-1">Os últimos movimentos da Promokit estão sem alerta de revisão.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {stockReviewMovements.map(movement => {
                          const product = products.find(item => item.id === movement.productId);
                          return (
                            <div key={movement.id} className="p-4 rounded-2xl bg-amber-50 border border-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-black text-amber-950">{product?.name || 'Produto não encontrado'}</p>
                                  <span className="text-[10px] font-black uppercase text-amber-700 bg-white/70 px-2 py-1 rounded-lg">
                                    Pedido #{movement.promokitOrderCode || '-'}
                                  </span>
                                </div>
                                <p className="text-sm text-amber-800 mt-1">
                                  {movement.quantity} un · {movement.recognitionSource === 'local_kit_composition'
                                    ? 'baixado pela composição local do kit'
                                    : movement.recognitionSource === 'ai_kit_observation'
                                      ? 'baixado pela IA a partir das escolhas do kit'
                                      : movement.recognitionSource === 'ai_kit_substitution'
                                        ? 'baixa com troca interpretada pela IA'
                                    : 'baixa sem correspondência clara no cardápio'}
                                </p>
                                {movement.promokitDetails && (
                                  <p className="text-xs text-amber-700 mt-1 line-clamp-2">{movement.promokitDetails}</p>
                                )}
                              </div>
                              <span className="text-[10px] font-black uppercase text-amber-700 bg-white px-3 py-1.5 rounded-xl self-start md:self-auto">
                                revisar
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <h2 className="text-xl font-black text-gray-900">Saúde da automação</h2>
                    <div className="mt-5 space-y-3">
                      {[
                        { label: 'Promokit', value: recentPromokitSales.length ? 'Recebendo pedidos' : 'Aguardando pedidos', status: recentPromokitSales.length ? 'ok' : 'warn' },
                        { label: 'WhatsApp IA', value: whatsappAgentConfigs.some(agent => agent.enabled) ? 'Agentes ativos' : 'Sem agentes ativos', status: whatsappAgentConfigs.some(agent => agent.enabled) ? 'ok' : 'warn' },
                        { label: 'Campanhas', value: pendingCampaignQueue.length ? `${pendingCampaignQueue.length} na fila` : `${readyCampaigns.length} pronta(s)`, status: failedCampaignQueue.length ? 'error' : readyCampaigns.length ? 'ok' : 'warn' },
                        { label: 'Estoque', value: outOfStockItems.length ? 'Itens zerados' : 'Sem ruptura crítica', status: outOfStockItems.length ? 'error' : 'ok' },
                      ].map(item => (
                        <div key={item.label} className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-gray-50">
                          <div>
                            <p className="text-sm font-black text-gray-900">{item.label}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{item.value}</p>
                          </div>
                          <span className={`w-3 h-3 rounded-full ${
                            item.status === 'ok' ? 'bg-emerald-500' :
                            item.status === 'error' ? 'bg-red-500' :
                            'bg-amber-400'
                          }`} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <h2 className="text-xl font-black text-gray-900">Eventos recentes</h2>
                    <p className="text-sm text-gray-500 mt-1">Histórico técnico das rotinas automáticas.</p>
                    <div className="mt-5 space-y-3">
                      {latestOperationalEvents.length === 0 ? (
                        <div className="p-6 rounded-3xl bg-gray-50 text-center">
                          <Activity className="mx-auto text-gray-300 mb-3" size={30} />
                          <p className="text-sm font-bold text-gray-500">Nenhum evento registrado ainda.</p>
                        </div>
                      ) : (
                        latestOperationalEvents.map(event => (
                          <div key={event.id} className="flex gap-3">
                            <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${
                              event.status === 'success' ? 'bg-emerald-500' :
                              event.status === 'error' ? 'bg-red-500' :
                              event.status === 'warning' ? 'bg-amber-400' :
                              'bg-blue-500'
                            }`} />
                            <div className="min-w-0">
                              <p className="text-sm font-black text-gray-900 truncate">{event.title}</p>
                              {event.message && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{event.message}</p>}
                              <p className="text-[10px] uppercase font-black text-gray-400 mt-1">
                                {event.source || 'sistema'} · {event.createdAt?.toDate ? event.createdAt.toDate().toLocaleString('pt-BR') : 'agora'}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
                <div className="flex items-center gap-2 bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
                  <Calendar size={18} className="text-gray-400 ml-2" />
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-transparent border-none text-sm focus:ring-0 text-gray-600"
                  />
                  <span className="text-gray-300">|</span>
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-transparent border-none text-sm focus:ring-0 text-gray-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="p-3 bg-emerald-50 rounded-2xl shrink-0">
                    <Package className="text-emerald-600" size={24} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5 truncate">Estoque Total</p>
                    <p className="text-xl sm:text-2xl font-black text-gray-900 flex items-baseline gap-1">
                      {stock.reduce((acc, item) => acc + item.currentStock, 0)}
                      <span className="text-[10px] font-bold text-gray-400 uppercase">un</span>
                    </p>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="p-3 bg-blue-50 rounded-2xl shrink-0">
                    <Minus className="text-blue-600" size={24} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5 truncate">Vendas (Mês)</p>
                    <p className="text-xl sm:text-2xl font-black text-blue-600 truncate">
                      R$ {sales
                        .filter(s => {
                          const date = s.saleDate?.toDate();
                          if (!date) return false;
                          const now = new Date();
                          return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                        })
                        .reduce((acc, s) => acc + s.value, 0)
                        .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4 sm:col-span-2 lg:col-span-1">
                  <div className="p-3 bg-emerald-50 rounded-2xl shrink-0">
                    <ShoppingCart className="text-emerald-600" size={24} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5 truncate">Pedidos (Mês)</p>
                    <p className="text-xl sm:text-2xl font-black text-emerald-600 flex items-baseline gap-1">
                      {sales.filter(s => {
                        const date = s.saleDate?.toDate();
                        if (!date) return false;
                        const now = new Date();
                        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                      }).length}
                      <span className="text-[10px] font-bold text-gray-400 uppercase">pedidos</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-gray-900">Volume de Pedidos por Dia</h3>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                    <span className="text-xs text-gray-500 font-medium">Pedidos</span>
                  </div>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={eachDayOfInterval({
                        start: startOfDay(new Date(startDate + 'T00:00:00')),
                        end: endOfDay(new Date(endDate + 'T23:59:59'))
                      }).map(day => {
                        const dayStr = format(day, 'yyyy-MM-dd');
                        const dayOrders = sales
                          .filter(s => {
                            const sDate = s.saleDate?.toDate();
                            return sDate && format(sDate, 'yyyy-MM-dd') === dayStr;
                          }).length;
                        return {
                          name: format(day, 'dd/MM', { locale: ptBR }),
                          pedidos: dayOrders
                        };
                      })}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#9ca3af', fontSize: 11 }}
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#9ca3af', fontSize: 11 }}
                      />
                      <Tooltip 
                        cursor={{ fill: '#f9fafb' }}
                        contentStyle={{ 
                          borderRadius: '12px', 
                          border: 'none', 
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                          padding: '12px',
                          fontSize: '12px'
                        }}
                      />
                      <Bar 
                        dataKey="pedidos" 
                        fill="#10b981" 
                        radius={[4, 4, 0, 0]} 
                        barSize={24}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'estoque' && (
            <motion.div 
              key="estoque"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">Valor Total em Estoque</p>
                  <p className="text-2xl font-black text-emerald-600">
                    R$ {stock.reduce((acc, item) => acc + (item.currentStock * (item.price || 0)), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">Total de Marmitas</p>
                  <p className="text-2xl font-black text-gray-900">
                    {stock.reduce((acc, item) => acc + item.currentStock, 0)} <span className="text-sm font-normal text-gray-400">unidades</span>
                  </p>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Marmitas em Estoque</h2>
                {stock.length === 0 ? (
                  <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-gray-200">
                    <Package className="mx-auto text-gray-300 mb-4" size={48} />
                    <p className="text-gray-500">Nenhum produto cadastrado.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {stock.map(item => (
                      <div key={item.id} className="bg-white p-5 rounded-2xl shadow-sm flex items-center justify-between border border-gray-100">
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-emerald-50 rounded-lg">
                            <Package className="text-emerald-600" size={20} />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 capitalize">{item.name}</h3>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-emerald-600">
                                R$ {item.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                Total: R$ {(item.currentStock * (item.price || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className={`text-xl font-bold ${item.currentStock > 5 ? 'text-emerald-600' : 'text-orange-500'}`}>
                          {item.currentStock} <span className="text-sm font-normal text-gray-400">un</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Kits Disponíveis (Montáveis)</h2>
                {kits.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">Nenhum kit cadastrado.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {kits.map(kit => {
                      // Calculate how many kits can be made
                      const possibleKits = kit.items.reduce((min, item) => {
                        const productStock = stock.find(s => s.id === item.productId)?.currentStock || 0;
                        const canMake = Math.floor(productStock / item.quantity);
                        return Math.min(min, canMake);
                      }, Infinity);

                      const displayKits = possibleKits === Infinity ? 0 : possibleKits;

                      return (
                        <div key={kit.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="font-bold text-gray-900 capitalize">{kit.name}</h3>
                              <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg">
                                R$ {kit.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="space-y-1 mb-4">
                              {kit.items.slice(0, 3).map((item, idx) => {
                                const prod = products.find(p => p.id === item.productId);
                                return (
                                  <p key={idx} className="text-[10px] text-gray-400 truncate">
                                    • {item.quantity}x {prod?.name}
                                  </p>
                                );
                              })}
                              {kit.items.length > 3 && <p className="text-[10px] text-gray-400">...</p>}
                            </div>
                          </div>
                          <div className="pt-4 border-t border-gray-50 flex items-end justify-between">
                            <span className="text-xs text-gray-400">Disponível:</span>
                            <span className={`text-2xl font-black ${displayKits > 0 ? 'text-emerald-600' : 'text-red-400'}`}>
                              {displayKits} <span className="text-xs font-normal">kits</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'producao' && (
            <motion.div 
              key="producao"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                    <Plus size={20} />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Registrar Produção</h2>
                </div>
                
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ex: Fiz 10 parmegiana e 5 escondidinho..."
                  className="w-full h-32 p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all resize-none text-gray-700"
                />

                <button
                  disabled={isProcessing || !inputText.trim()}
                  onClick={() => handleProcessIA('entrada')}
                  className="w-full mt-4 flex items-center justify-center gap-2 py-4 bg-gray-900 text-white rounded-2xl font-semibold hover:bg-black transition-all disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Brain size={20} />}
                  Processar com IA
                </button>
              </div>

              {preview && preview.tipo === 'entrada' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-emerald-50 p-6 rounded-3xl border-2 border-emerald-200"
                >
                  <h3 className="font-bold text-emerald-900 mb-4 flex items-center gap-2">
                    <Check size={20} /> Confirmar Lançamento
                  </h3>
                  <div className="space-y-3 mb-6">
                    {preview.itens.map((item, idx) => {
                      const kit = item.isKit ? kits.find(k => 
                        k.name.toLowerCase().trim() === item.produto.toLowerCase().trim() ||
                        k.name.toLowerCase().includes(item.produto.toLowerCase()) ||
                        item.produto.toLowerCase().includes(k.name.toLowerCase())
                      ) : null;
                      
                      return (
                        <div key={idx} className="bg-white/50 p-4 rounded-2xl border border-emerald-100">
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                              <span className="capitalize text-emerald-800 font-bold">{item.produto}</span>
                              {item.isKit && <span className="text-[10px] bg-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full font-bold uppercase">Kit</span>}
                            </div>
                            <span className="font-bold text-emerald-900">{item.quantidade} un</span>
                          </div>

                          {item.isKit && kit && (
                            <div className="mt-2 pl-4 border-l-2 border-emerald-200 space-y-1">
                              {kit.items.map((kitItem, kIdx) => {
                                const originalProd = products.find(p => p.id === kitItem.productId);
                                const sub = item.substituicoes?.find(s => 
                                  originalProd?.name.toLowerCase().includes(s.remover.toLowerCase()) ||
                                  s.remover.toLowerCase().includes(originalProd?.name.toLowerCase() || '')
                                );
                                
                                return (
                                  <div key={kIdx} className="text-xs flex items-center gap-2">
                                    <ChevronRight size={12} className="text-emerald-400" />
                                    {sub ? (
                                      <div className="flex items-center gap-1">
                                        <span className="line-through text-gray-400">{originalProd?.name}</span>
                                        <span className="text-emerald-600 font-bold">→ {sub.adicionar}</span>
                                      </div>
                                    ) : (
                                      <span className="text-gray-600">{originalProd?.name}</span>
                                    )}
                                    <span className="text-gray-400 font-medium">({kitItem.quantity * item.quantidade} un)</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setPreview(null)}
                      className="flex-1 py-3 bg-white text-gray-600 rounded-xl font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={confirmMovements}
                      className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
                    >
                      Confirmar
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'vendas' && (
            <motion.div 
              key="vendas"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600">
                      <RefreshCcw size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Sincronização Promokit</h2>
                      <p className="text-sm text-gray-500">Pedidos novos viram venda e baixam o estoque pelos itens enviados no pedido.</p>
                    </div>
                  </div>
                  <button
                    disabled={isSyncingPromokit}
                    onClick={() => handleSyncPromokitOrders()}
                    className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-2xl font-semibold hover:bg-emerald-700 transition-all disabled:opacity-50"
                  >
                    {isSyncingPromokit ? <Loader2 className="animate-spin" size={20} /> : <RefreshCcw size={20} />}
                    Buscar novos pedidos
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="bg-gray-50 p-4 rounded-2xl">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">Pedidos Promokit</p>
                    <p className="text-2xl font-black text-gray-900">
                      {sales.filter(sale => sale.source === 'promokit').length}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">já lançados em vendas</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">Baixa de estoque</p>
                    <p className="text-2xl font-black text-emerald-600">IA</p>
                    <p className="text-xs text-gray-500 mt-1">kits usam marmitas do pedido</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">Último código</p>
                    <input 
                      type="text"
                      value={promokitLastOrderCode}
                      onChange={(e) => setPromokitLastOrderCode(e.target.value)}
                      placeholder="Automático"
                      className="w-full mt-2 p-3 bg-white rounded-xl border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    />
                  </div>
                </div>

                {promokitSyncResult && (
                  <div className="mt-5 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold mb-2">
                      <CheckCircle2 size={18} />
                      Sincronização concluída
                    </div>
                    <p className="text-sm text-emerald-700">
                      {promokitSyncResult.count} pedido(s) lido(s). Próximo código: {promokitSyncResult.nextLastOrderCode}.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {promokitSyncResult.processedSales.map(item => (
                        <span key={item.code} className="text-xs bg-white text-emerald-700 border border-emerald-100 px-3 py-1 rounded-lg font-bold">
                          #{item.code} {item.createdSale ? 'lançado' : 'já existia'} · {item.movementCount} baixa(s)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Como a baixa funciona</h3>
                <p className="text-sm text-gray-500">
                  Quando o pedido vier como kit, o sistema procura as marmitas escolhidas dentro do próprio pedido da Promokit.
                  Se encontrar, baixa essas marmitas no estoque. Se não encontrar, usa a composição do kit cadastrada no cardápio.
                </p>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Últimos pedidos</h2>
                  <p className="text-sm text-gray-500">Pedido mais recente sempre no topo.</p>
                </div>
              </div>

              {sales.length === 0 ? (
                <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-gray-200">
                  <DollarSign className="mx-auto text-gray-300 mb-4" size={48} />
                  <p className="text-gray-500">Nenhuma venda registrada.</p>
                </div>
              ) : (
                sales.map(sale => {
                  const saleMovements = getSaleMovements(sale);
                  const isExpanded = Boolean(expandedSaleDetails[sale.id]);

                  return (
                    <div key={sale.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <button
                          type="button"
                          onClick={() => toggleSaleDetails(sale.id)}
                          className="flex items-center gap-4 text-left flex-1 min-w-0"
                        >
                          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                            <UserPlus size={24} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-gray-900">{sale.customerName}</h3>
                            <p className="text-xs text-gray-400 flex items-center gap-1">
                              <Calendar size={12} /> {sale.saleDate?.toDate().toLocaleDateString('pt-BR')}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg border border-emerald-100">
                                Pedido #{getSaleOrderNumber(sale)}
                              </span>
                              {sale.source === 'promokit' && (
                                <span className="text-[10px] font-black uppercase tracking-wider bg-lime-50 text-lime-700 px-2.5 py-1 rounded-lg border border-lime-100">
                                  Promokit
                                </span>
                              )}
                              <span className="text-[10px] font-black uppercase tracking-wider bg-gray-50 text-gray-500 px-2.5 py-1 rounded-lg border border-gray-100">
                                {saleMovements.length} baixa(s)
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1 italic line-clamp-1">"{sale.itemsDescription}"</p>
                          </div>
                        </button>

                        <div className="flex items-center justify-between sm:justify-end gap-4">
                          <div className="text-right">
                            <p className="text-xs font-bold text-gray-400 uppercase">Valor</p>
                            <p className="text-xl font-black text-emerald-600">
                              R$ {sale.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleSaleDetails(sale.id)}
                            className="w-10 h-10 rounded-2xl bg-gray-50 text-gray-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center justify-center"
                            aria-label={isExpanded ? 'Recolher detalhes do pedido' : 'Abrir detalhes do pedido'}
                          >
                            <ChevronDown size={18} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                          <button 
                            onClick={async () => {
                              const hasLinkedMovements = movements.some(m => m.saleId === sale.id);
                              const confirmMsg = hasLinkedMovements 
                                ? 'Deseja excluir este registro de venda? O estoque será restaurado automaticamente.'
                                : 'Deseja excluir este registro de venda? (AVISO: Esta venda é antiga e o estoque NÃO será restaurado automaticamente)';
                              
                              if (confirm(confirmMsg)) {
                                try {
                                  const batch = writeBatch(db);
                                  batch.delete(doc(db, 'sales', sale.id));
                                  
                                  const linkedMovements = movements.filter(m => m.saleId === sale.id);
                                  linkedMovements.forEach(m => {
                                    batch.delete(doc(db, 'movements', m.id));
                                  });
                                  
                                  await batch.commit();
                                } catch (err) {
                                  console.error("Erro ao deletar venda:", err);
                                }
                              }
                            }}
                            className="w-10 h-10 rounded-2xl bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100 transition-colors flex items-center justify-center"
                            aria-label="Excluir venda"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-6 pb-6">
                              <div className="border-t border-gray-100 pt-4">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                  <h4 className="text-sm font-black text-gray-900">Marmitas do pedido</h4>
                                  <span className="text-xs font-bold text-gray-400">{sale.totalQuantity || saleMovements.length} un no registro</span>
                                </div>

                                {saleMovements.length === 0 ? (
                                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100">
                                    <p className="text-sm font-bold text-amber-900">Sem baixa detalhada vinculada.</p>
                                    <p className="text-xs text-amber-700 mt-1">
                                      Esse pedido pode ter sido lançado antes do detalhamento de kits, ou chegou sem marmitas claras da Promokit.
                                    </p>
                                    <p className="text-xs text-amber-700 mt-2">{sale.itemsDescription}</p>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                    {saleMovements.map(movement => {
                                      const product = products.find(item => item.id === movement.productId);
                                      return (
                                        <div key={movement.id} className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <p className="text-sm font-black text-gray-900">{product?.name || movement.promokitSelectedName || 'Marmita não encontrada'}</p>
                                              <p className="text-xs text-gray-500 mt-1">{getRecognitionLabel(movement.recognitionSource)}</p>
                                            </div>
                                            <span className="text-sm font-black text-emerald-700 bg-white border border-emerald-100 px-2.5 py-1 rounded-xl">
                                              {movement.quantity} un
                                            </span>
                                          </div>
                                          {movement.promokitSelectedName && product?.name && movement.promokitSelectedName !== product.name && (
                                            <p className="text-xs text-gray-500 mt-2">Nome recebido: {movement.promokitSelectedName}</p>
                                          )}
                                          {movement.promokitDetails && (
                                            <p className="text-xs text-gray-500 mt-2 line-clamp-3">Detalhes: {movement.promokitDetails}</p>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}

          {activeTab === 'historico' && (
            <motion.div 
              key="historico"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Histórico Recente</h2>
              {movements.length === 0 ? (
                <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-gray-200">
                  <History className="mx-auto text-gray-300 mb-4" size={48} />
                  <p className="text-gray-500">Nenhuma movimentação registrada.</p>
                </div>
              ) : (
                movements.map(m => {
                  const product = products.find(p => p.id === m.productId);
                  return (
                    <div key={m.id} className="bg-white p-4 rounded-2xl shadow-sm flex items-center gap-4 border border-gray-100">
                      <div className={`p-2 rounded-lg ${m.type === 'entrada' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                        {m.type === 'entrada' ? <Plus size={18} /> : <Minus size={18} />}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 capitalize">{product?.name || 'Produto Removido'}</h3>
                        <p className="text-xs text-gray-400">
                          {(m.referenceDate || m.createdAt)?.toDate().toLocaleString('pt-BR', { 
                            day: '2-digit', 
                            month: '2-digit', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </p>
                      </div>
                      <div className={`font-bold ${m.type === 'entrada' ? 'text-blue-600' : 'text-red-600'}`}>
                        {m.type === 'entrada' ? '+' : '-'}{m.quantity}
                      </div>
                      <button 
                        onClick={async () => {
                          if (confirm('Deseja excluir este lançamento? O estoque será recalculado automaticamente.')) {
                            try {
                              await deleteDoc(doc(db, 'movements', m.id));
                            } catch (err) {
                              console.error("Erro ao deletar lançamento:", err);
                              alert("Falha ao remover o lançamento.");
                            }
                          }
                        }}
                        className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                        title="Excluir lançamento"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}

          {activeTab === 'config' && (
            <motion.div 
              key="config"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Sub-tabs for Config */}
              <div className="flex p-1 bg-gray-100 rounded-2xl w-full max-w-2xl mx-auto">
                {(['produtos', 'kits', 'lista'] as const).map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setConfigSubTab(sub)}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                      configSubTab === sub 
                        ? 'bg-white text-emerald-600 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {sub === 'produtos' && 'Adicionar Produtos'}
                    {sub === 'kits' && 'Criar Kits'}
                    {sub === 'lista' && 'Produtos Cadastrados'}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {configSubTab === 'produtos' && (
                  <motion.section 
                    key="add-products"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100"
                  >
                    <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <Package className="text-emerald-600" size={24} /> Cadastrar Marmita/Salgado
                    </h2>
                    
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input 
                        type="text"
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                        placeholder="Nome da Marmita"
                        className="flex-1 p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <input 
                        type="number"
                        value={newProductPrice}
                        onChange={(e) => setNewProductPrice(e.target.value)}
                        placeholder="Valor R$"
                        className="w-full sm:w-32 p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button 
                        onClick={saveProduct}
                        disabled={!newProductName.trim()}
                        className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                      >
                        Adicionar
                      </button>
                    </div>
                  </motion.section>
                )}

                {configSubTab === 'kits' && (
                  <motion.section 
                    key="create-kits"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100"
                  >
                    <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <Plus className="text-emerald-600" size={24} /> Criar Novo Kit
                    </h2>
                    
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Nome do Kit</label>
                          <input 
                            type="text"
                            value={newKitName}
                            onChange={(e) => setNewKitName(e.target.value)}
                            placeholder="Ex: Kit Maromba 10 un"
                            className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Valor de Venda (R$)</label>
                          <input 
                            type="number"
                            value={newKitPrice}
                            onChange={(e) => setNewKitPrice(e.target.value)}
                            placeholder="0,00"
                            className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Adicionar Itens ao Kit</label>
                        <div className="flex gap-2 mb-4">
                          <select 
                            className="flex-1 p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                            id="productSelect"
                          >
                            <option value="">Selecione um produto...</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          <input 
                            type="number" 
                            id="qtyInput"
                            placeholder="Qtd"
                            className="w-24 p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <button 
                            onClick={() => {
                              const pId = (document.getElementById('productSelect') as HTMLSelectElement).value;
                              const qty = parseInt((document.getElementById('qtyInput') as HTMLInputElement).value);
                              if (pId && qty > 0) {
                                setKitItems([...kitItems, { productId: pId, quantity: qty }]);
                              }
                            }}
                            className="p-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-colors"
                          >
                            <Plus size={24} />
                          </button>
                        </div>

                        <div className="space-y-2">
                          {kitItems.map((item, idx) => {
                            const prod = products.find(p => p.id === item.productId);
                            return (
                              <div key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl">
                                <span className="capitalize text-gray-700">{prod?.name}</span>
                                <div className="flex items-center gap-3">
                                  <span className="font-bold text-gray-900">{item.quantity} un</span>
                                  <button 
                                    onClick={() => setKitItems(kitItems.filter((_, i) => i !== idx))}
                                    className="text-red-400 hover:text-red-600"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <button 
                        disabled={!newKitName || kitItems.length === 0}
                        onClick={saveKit}
                        className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black transition-all disabled:opacity-50"
                      >
                        Salvar Kit no Cardápio
                      </button>
                    </div>
                  </motion.section>
                )}

                {configSubTab === 'lista' && (
                  <motion.div 
                    key="list-all"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-8"
                  >
                    {/* Products List */}
                    <section className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                      <h2 className="text-xl font-bold text-gray-900 mb-6">Marmitas e Salgados</h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {products.map(p => (
                          <div key={p.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                            <div className="flex flex-col">
                              <span className="capitalize text-gray-700 font-medium">{p.name}</span>
                              <span className="text-xs font-bold text-emerald-600">R$ {p.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <button 
                              onClick={() => deleteProduct(p.id)}
                              className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* Kits List */}
                    <section className="space-y-4">
                      <h2 className="text-xl font-bold text-gray-900">Kits Cadastrados</h2>
                      {kits.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">Nenhum kit cadastrado.</p>
                      ) : (
                        kits.map(kit => (
                          <div key={kit.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex flex-col">
                                <h3 className="font-bold text-gray-900 text-lg capitalize">{kit.name}</h3>
                                <span className="text-xs font-bold text-emerald-600">R$ {kit.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <button 
                                onClick={() => deleteKit(kit.id)}
                                className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {kit.items.map((item, idx) => {
                                const prod = products.find(p => p.id === item.productId);
                                return (
                                  <div key={idx} className="flex items-center gap-2 text-sm text-gray-500">
                                    <ChevronRight size={14} className="text-emerald-500" />
                                    <span className="capitalize">{prod?.name}</span>
                                    <span className="font-bold text-gray-700">({item.quantity} un)</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      )}
                    </section>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'compras' && (
            <motion.div 
              key="compras"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Sub-tabs for Shopping */}
              <div className="flex p-1 bg-gray-100 rounded-2xl w-full max-w-2xl mx-auto">
                {(['lista', 'produtos', 'fornecedores'] as const).map((sub) => (
                  <button
                    key={sub}
                    onClick={() => {
                      setShoppingSubTab(sub);
                      setGeneratedList(null);
                    }}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                      shoppingSubTab === sub 
                        ? 'bg-white text-emerald-600 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {sub === 'lista' && 'Criar Lista'}
                    {sub === 'produtos' && 'Produtos'}
                    {sub === 'fornecedores' && 'Fornecedores'}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {shoppingSubTab === 'fornecedores' && (
                  <motion.section 
                    key="shopping-suppliers"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-6"
                  >
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                        <UserPlus className="text-emerald-600" size={24} /> Cadastrar Fornecedor
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input 
                          type="text"
                          value={newSupplier.name}
                          onChange={(e) => setNewSupplier({...newSupplier, name: e.target.value})}
                          placeholder="Nome"
                          className="p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <input 
                          type="text"
                          value={newSupplier.location}
                          onChange={(e) => setNewSupplier({...newSupplier, location: e.target.value})}
                          placeholder="Local"
                          className="p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <input 
                          type="text"
                          value={newSupplier.contact}
                          onChange={(e) => setNewSupplier({...newSupplier, contact: e.target.value})}
                          placeholder="Contato"
                          className="p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <button 
                        onClick={saveSupplier}
                        className="w-full mt-4 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all"
                      >
                        Salvar Fornecedor
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {suppliers.map(s => (
                        <div key={s.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
                          <div>
                            <h3 className="font-bold text-gray-900">{s.name}</h3>
                            <p className="text-xs text-gray-400">{s.location} • {s.contact}</p>
                          </div>
                          <button 
                            onClick={() => setDeleteConfirm({ id: s.id, type: 'supplier', name: s.name })}
                            className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.section>
                )}

                {shoppingSubTab === 'produtos' && (
                  <motion.section 
                    key="shopping-products"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-6"
                  >
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                        <Package className="text-emerald-600" size={24} /> Cadastrar Produto de Compra
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input 
                          type="text"
                          value={newShoppingProduct.name}
                          onChange={(e) => setNewShoppingProduct({...newShoppingProduct, name: e.target.value})}
                          placeholder="Nome do Produto"
                          className="p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <select 
                          value={newShoppingProduct.supplierId}
                          onChange={(e) => setNewShoppingProduct({...newShoppingProduct, supplierId: e.target.value})}
                          className="p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">Selecione o Fornecedor...</option>
                          {suppliers.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <select 
                          value={newShoppingProduct.unit}
                          onChange={(e) => setNewShoppingProduct({...newShoppingProduct, unit: e.target.value})}
                          className="p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">Unidade de Medida...</option>
                          <option value="unidade">Unidade</option>
                          <option value="caixa">Caixa</option>
                          <option value="kg">Kg</option>
                          <option value="g">Grama</option>
                          <option value="litro">Litro</option>
                          <option value="pacote">Pacote</option>
                          <option value="mileiro">Mileiro</option>
                        </select>
                      </div>
                      <button 
                        onClick={saveShoppingProduct}
                        className="w-full mt-4 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all"
                      >
                        Salvar Produto
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {shoppingProducts.map(p => {
                        const supplier = suppliers.find(s => s.id === p.supplierId);
                        return (
                          <div key={p.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
                            <div>
                              <h3 className="font-bold text-gray-900">{p.name}</h3>
                              <p className="text-xs text-gray-400">Fornecedor: {supplier?.name || 'N/A'} • Un: {p.unit === 'g' ? 'gramas' : p.unit}</p>
                            </div>
                            <button 
                              onClick={() => setDeleteConfirm({ id: p.id, type: 'shoppingProduct', name: p.name })}
                              className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </motion.section>
                )}

                {shoppingSubTab === 'lista' && (
                  <motion.section 
                    key="shopping-list"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-6"
                  >
                    {!generatedList ? (
                      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-6">
                          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <FileText className="text-emerald-600" size={24} /> Criar Lista de Compras
                          </h2>
                          <button 
                            onClick={() => setShoppingListItems({})}
                            className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors"
                          >
                            Limpar Seleção
                          </button>
                        </div>

                        <div className="space-y-8 mb-8">
                          {shoppingProducts.length === 0 ? (
                            <p className="text-center py-8 text-gray-400">Nenhum produto cadastrado para compras.</p>
                          ) : (
                            suppliers.map(supplier => {
                              const supplierProducts = shoppingProducts.filter(p => p.supplierId === supplier.id);
                              if (supplierProducts.length === 0) return null;

                              return (
                                <div key={supplier.id} className="space-y-3">
                                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 px-2">
                                    <Store size={14} className="text-emerald-500" /> {supplier.name}
                                  </h3>
                                  <div className="grid grid-cols-1 gap-2">
                                    {supplierProducts.map(p => (
                                      <div key={p.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                        <div className="flex flex-col">
                                          <p className="font-bold text-gray-900">{p.name}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <button 
                                            onClick={() => setShoppingListItems({
                                              ...shoppingListItems,
                                              [p.id]: Math.max(0, (shoppingListItems[p.id] || 0) - 1)
                                            })}
                                            className="p-2 bg-white rounded-lg text-gray-400 hover:text-emerald-600 shadow-sm"
                                          >
                                            <Minus size={16} />
                                          </button>
                                          <div className="flex flex-col items-center min-w-[64px]">
                                            <span className="text-lg font-black text-gray-900 leading-none">
                                              {shoppingListItems[p.id] || 0}
                                            </span>
                                            <span className="text-[10px] font-bold text-emerald-600 uppercase mt-0.5">
                                              {p.unit === 'g' ? 'gramas' : p.unit}
                                            </span>
                                          </div>
                                          <button 
                                            onClick={() => setShoppingListItems({
                                              ...shoppingListItems,
                                              [p.id]: (shoppingListItems[p.id] || 0) + 1
                                            })}
                                            className="p-2 bg-white rounded-lg text-gray-400 hover:text-emerald-600 shadow-sm"
                                          >
                                            <Plus size={16} />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>

                        <button 
                          onClick={finalizeShoppingList}
                          disabled={Object.values(shoppingListItems).every(v => v === 0)}
                          className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <Check size={20} /> Finalizar Lista
                        </button>
                      </div>
                    ) : (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-emerald-50 p-8 rounded-3xl border-2 border-emerald-200 relative"
                      >
                        <div className="flex items-center justify-between mb-6">
                          <h3 className="font-bold text-emerald-900 flex items-center gap-2">
                            <Check size={20} /> Lista Gerada
                          </h3>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(generatedList);
                              // Simple toast-like feedback could be added here
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-white text-emerald-600 rounded-xl text-xs font-bold shadow-sm hover:bg-emerald-100 transition-all"
                          >
                            <Copy size={14} /> Copiar Texto
                          </button>
                        </div>
                        <pre className="whitespace-pre-wrap font-sans text-emerald-800 leading-relaxed">
                          {generatedList}
                        </pre>
                        <button 
                          onClick={() => setGeneratedList(null)}
                          className="w-full mt-8 py-3 bg-white text-emerald-600 rounded-xl font-bold border border-emerald-200 hover:bg-emerald-100 transition-all"
                        >
                          Voltar e Editar
                        </button>
                      </motion.div>
                    )}
                  </motion.section>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'contas' && (
            <motion.div 
              key="contas"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex p-1 bg-gray-100 rounded-2xl w-full max-w-2xl mx-auto overflow-x-auto no-scrollbar">
                {(['lista', 'pagas', 'cadastrar'] as const).map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setBillsSubTab(sub)}
                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                      billsSubTab === sub 
                        ? 'bg-white text-emerald-600 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {sub === 'lista' ? 'Contas a Pagar' : sub === 'pagas' ? 'Contas Pagas' : 'Cadastrar Conta'}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {billsSubTab === 'cadastrar' && (
                  <motion.section 
                    key="cadastrar-conta"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="max-w-2xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6"
                  >
                    <h2 className="text-xl font-bold text-gray-900 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wallet className="text-emerald-600" size={24} /> Nova Conta
                      </div>
                      <label className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-100 transition-all border border-emerald-100">
                        {isAnalyzingBill ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Camera size={16} />
                        )}
                        {isAnalyzingBill ? 'Analisando...' : 'Ler com Foto (IA)'}
                        <input 
                          type="file" 
                          accept="image/*" 
                          capture="environment" 
                          className="hidden" 
                          onChange={handleBillImageUpload}
                          disabled={isAnalyzingBill}
                        />
                      </label>
                    </h2>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 ml-2 uppercase">Nome do Fornecedor / Conta</label>
                        <input 
                          type="text"
                          value={newBill.name}
                          onChange={(e) => setNewBill({...newBill, name: e.target.value})}
                          placeholder="Ex: Aluguel, Energia, Fornecedor X"
                          className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 ml-2 uppercase">Categoria / Estilo de Mercadoria</label>
                        <input 
                          type="text"
                          value={newBill.category}
                          onChange={(e) => setNewBill({...newBill, category: e.target.value})}
                          placeholder="Ex: Alimentos, Embalagens, Impostos"
                          className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-400 ml-2">VALOR (R$)</label>
                          <input 
                            type="number"
                            value={newBill.value}
                            onChange={(e) => setNewBill({...newBill, value: e.target.value})}
                            placeholder="0,00"
                            className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-400 ml-2">VENCIMENTO</label>
                          <input 
                            type="date"
                            value={newBill.dueDate}
                            onChange={(e) => setNewBill({...newBill, dueDate: e.target.value})}
                            className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 ml-2">BOLETO OU PIX (OPCIONAL)</label>
                        <textarea 
                          value={newBill.paymentCode}
                          onChange={(e) => setNewBill({...newBill, paymentCode: e.target.value})}
                          placeholder="Cole aqui o código do boleto ou a chave PIX"
                          className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500 h-24 resize-none"
                        />
                      </div>
                      <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-colors">
                        <input 
                          type="checkbox"
                          checked={newBill.isRecurring}
                          onChange={(e) => setNewBill({...newBill, isRecurring: e.target.checked})}
                          className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                          <Repeat size={16} className="text-emerald-600" /> Conta Recorrente (Mensal)
                        </div>
                      </label>
                    </div>
                    <button 
                      onClick={saveBill}
                      className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                    >
                      Salvar Conta
                    </button>
                  </motion.section>
                )}

                {billsSubTab === 'lista' && (
                  <motion.section 
                    key="lista-contas"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-4"
                  >
                    {bills.filter(b => !b.isPaid).length === 0 ? (
                      <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                        <Check size={48} className="mx-auto text-emerald-200 mb-4" />
                        <p className="text-gray-400 font-medium">Tudo em dia! Nenhuma conta pendente.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {bills.filter(b => !b.isPaid).map(bill => {
                          const dueDate = bill.dueDate.toDate();
                          const isOverdue = dueDate < startOfDay(new Date());
                          
                          return (
                            <div 
                              key={bill.id} 
                              className={`bg-white p-6 rounded-3xl shadow-sm border transition-all ${
                                isOverdue ? 'border-red-200 bg-red-50' : 'border-gray-100'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-start gap-4">
                                  <div className={`p-3 rounded-2xl ${isOverdue ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
                                    {isOverdue ? <AlertTriangle size={24} /> : <Clock size={24} />}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h3 className="font-bold text-gray-900">{bill.name}</h3>
                                      {bill.isRecurring && <Repeat size={14} className="text-emerald-500" />}
                                      {bill.category && (
                                        <span className="px-2 py-0.5 bg-gray-100 text-[10px] font-bold text-gray-500 rounded-full uppercase tracking-tighter transition-all">
                                          {bill.category}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-lg font-black text-emerald-600">
                                      {bill.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </p>
                                    <p className={`text-xs font-bold ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                                      Vencimento: {format(dueDate, 'dd/MM/yyyy')}
                                      {isOverdue && ' (ATRASADA)'}
                                    </p>
                                    {bill.paymentCode && (
                                      <button 
                                        onClick={() => navigator.clipboard.writeText(bill.paymentCode)}
                                        className="mt-2 flex items-center gap-2 text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-all uppercase"
                                      >
                                        <Copy size={12} /> Copiar Código de Barras
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  {bill.paymentCode && (
                                    <button 
                                      onClick={() => {
                                        navigator.clipboard.writeText(bill.paymentCode);
                                      }}
                                      className="p-3 bg-gray-50 text-gray-500 rounded-2xl hover:bg-emerald-50 hover:text-emerald-600 transition-all flex items-center gap-2 text-xs font-bold"
                                      title="Copiar Código"
                                    >
                                      <Copy size={16} /> Copiar Código
                                    </button>
                                  )}
                                  <button 
                                    onClick={() => toggleBillStatus(bill)}
                                    className="px-6 py-3 bg-gray-900 text-white rounded-2xl font-bold text-sm hover:bg-black transition-all"
                                  >
                                    Marcar como Paga
                                  </button>
                                  <button 
                                    onClick={() => setDeleteConfirm({ id: bill.id, type: 'bill', name: bill.name })}
                                    className="p-3 text-gray-300 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 size={20} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.section>
                )}

                {billsSubTab === 'pagas' && (
                  <motion.section 
                    key="contas-pagas"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-4"
                  >
                    {bills.filter(b => b.isPaid).length === 0 ? (
                      <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                        <CreditCard size={48} className="mx-auto text-gray-200 mb-4" />
                        <p className="text-gray-400 font-medium">Nenhuma conta paga ainda.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {bills.filter(b => b.isPaid).map(bill => {
                          const dueDate = bill.dueDate.toDate();
                          
                          return (
                            <div 
                              key={bill.id} 
                              className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 opacity-75"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-start gap-4">
                                  <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-600">
                                    <Check size={24} />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h3 className="font-bold text-gray-900 line-through">{bill.name}</h3>
                                      {bill.isRecurring && <Repeat size={14} className="text-emerald-500" />}
                                      {bill.category && (
                                        <span className="px-2 py-0.5 bg-gray-100 text-[10px] font-bold text-gray-500 rounded-full uppercase tracking-tighter">
                                          {bill.category}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-lg font-black text-gray-400">
                                      {bill.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </p>
                                    <p className="text-xs font-bold text-gray-400">
                                      Vencimento: {format(dueDate, 'dd/MM/yyyy')} (PAGA)
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => toggleBillStatus(bill)}
                                    className="px-6 py-3 bg-emerald-50 text-emerald-600 rounded-2xl font-bold text-sm hover:bg-emerald-100 transition-all"
                                  >
                                    Estornar
                                  </button>
                                  <button 
                                    onClick={() => setDeleteConfirm({ id: bill.id, type: 'bill', name: bill.name })}
                                    className="p-3 text-gray-300 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 size={20} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.section>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'campanhas' && (
            <motion.div
              key="campanhas"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-5"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black text-gray-900">Campanhas</h2>
                  <p className="text-sm text-gray-500 mt-1">Mensagens para disparar no WhatsApp para uma lista de clientes.</p>
                </div>
                <button
                  onClick={handleAddWhatsappCampaign}
                  className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-black hover:bg-emerald-700 transition-all"
                >
                  <Plus size={18} />
                  Nova campanha
                </button>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-gray-100">
                    <p className="text-xs font-black uppercase text-gray-400">Campanhas salvas</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {whatsappCampaigns.map(campaign => (
                      <button
                        key={campaign.id}
                        onClick={() => {
                          setSelectedCampaignId(campaign.id);
                          if (campaign.status === 'Rascunho') setEditingCampaignId(campaign.id);
                        }}
                        className={`w-full text-left p-4 transition-all ${
                          selectedCampaign?.id === campaign.id ? 'bg-emerald-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-black text-gray-900">{campaign.name}</p>
                          <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase ${
                            campaign.status === 'Finalizada' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                          }`}>{campaign.status}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{campaign.audience}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedCampaign && (
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase text-gray-400">Campanha selecionada</p>
                        <h3 className="text-2xl font-black text-gray-900 mt-1">{selectedCampaign.name}</h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => deleteWhatsappCampaign(selectedCampaign.id)}
                          className="px-4 py-2.5 bg-red-50 text-red-600 rounded-2xl text-sm font-black hover:bg-red-100 transition-all"
                        >
                          Excluir
                        </button>
                        {selectedCampaign.status !== 'Rascunho' && editingCampaignId !== selectedCampaign.id && (
                          <button
                            onClick={() => setEditingCampaignId(selectedCampaign.id)}
                            className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-2xl text-sm font-black hover:bg-gray-200 transition-all"
                          >
                            Editar
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelectedFlowCampaignId(selectedCampaign.id);
                            selectTab('fluxos');
                          }}
                          className="px-4 py-2.5 bg-emerald-600 text-white rounded-2xl text-sm font-black hover:bg-emerald-700 transition-all"
                        >
                          Abrir fluxo
                        </button>
                      </div>
                    </div>

                    {isSelectedCampaignEditing ? (
                      <>
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_170px] gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Nome da campanha</p>
                          <input value={selectedCampaign.name} onChange={(event) => handleWhatsappCampaignChange(selectedCampaign.id, 'name', event.target.value)} className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-emerald-500" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Status</p>
                          <select value={selectedCampaign.status} onChange={(event) => handleWhatsappCampaignChange(selectedCampaign.id, 'status', event.target.value)} className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none">
                            <option>Rascunho</option>
                            <option>Finalizada</option>
                            <option>Pausada</option>
                          </select>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Agente da campanha</p>
                          <select value={selectedCampaign.campaignAgent} onChange={(event) => handleWhatsappCampaignChange(selectedCampaign.id, 'campaignAgent', event.target.value)} className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none">
                            {whatsappAgentConfigs.map(agent => <option key={agent.name} value={agent.name}>{agent.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Público</p>
                          <input value={selectedCampaign.audience} onChange={(event) => handleWhatsappCampaignChange(selectedCampaign.id, 'audience', event.target.value)} className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-emerald-500" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Objetivo</p>
                          <input value={selectedCampaign.objective} onChange={(event) => handleWhatsappCampaignChange(selectedCampaign.id, 'objective', event.target.value)} className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-emerald-500" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Cupom</p>
                          <input value={selectedCampaign.couponCode} onChange={(event) => handleWhatsappCampaignChange(selectedCampaign.id, 'couponCode', event.target.value.toUpperCase())} placeholder="ATELIE10" className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-emerald-500" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Regra do cupom ou condição</p>
                          <input value={selectedCampaign.couponDetails} onChange={(event) => handleWhatsappCampaignChange(selectedCampaign.id, 'couponDetails', event.target.value)} placeholder="Ex: 10% para pedidos acima de R$ 100 até sexta" className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-emerald-500" />
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Mensagem do disparo</p>
                      <textarea value={selectedCampaign.initialMessage} onChange={(event) => handleWhatsappCampaignChange(selectedCampaign.id, 'initialMessage', event.target.value)} rows={4} className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Base de conhecimento da campanha</p>
                        <textarea
                          value={selectedCampaign.campaignKnowledge}
                          onChange={(event) => handleWhatsappCampaignChange(selectedCampaign.id, 'campaignKnowledge', event.target.value)}
                          rows={5}
                          placeholder="Cupom, validade, regra de uso, link do cardápio, público, objeções e informações que o assistente deve usar."
                          className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                        />
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button onClick={() => setEditingCampaignId(null)} className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-600 rounded-2xl text-sm font-black hover:bg-gray-200 transition-all">
                          <FileText size={17} />
                          Fechar edição
                        </button>
                        <button onClick={() => { handleWhatsappCampaignChange(selectedCampaign.id, 'status', 'Finalizada'); setEditingCampaignId(null); }} className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-black hover:bg-emerald-700 transition-all">
                          <Check size={17} />
                          Finalizar campanha
                        </button>
                      </div>
                      </>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="p-4 bg-gray-50 rounded-2xl"><p className="text-[10px] font-black uppercase text-gray-400">Status</p><p className="font-black text-gray-900 mt-1">{selectedCampaign.status}</p></div>
                          <div className="p-4 bg-gray-50 rounded-2xl"><p className="text-[10px] font-black uppercase text-gray-400">Público</p><p className="font-black text-gray-900 mt-1">{selectedCampaign.audience}</p></div>
                          <div className="p-4 bg-gray-50 rounded-2xl"><p className="text-[10px] font-black uppercase text-gray-400">Agente</p><p className="font-black text-gray-900 mt-1">{selectedCampaign.campaignAgent}</p></div>
                        </div>
                        {selectedCampaign.couponCode && (
                          <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
                            <p className="text-[10px] font-black uppercase text-emerald-700">Cupom</p>
                            <p className="text-lg font-black text-emerald-900 mt-1">{selectedCampaign.couponCode}</p>
                            <p className="text-sm text-emerald-700 mt-1">{selectedCampaign.couponDetails}</p>
                          </div>
                        )}
                        <div className="p-5 bg-gray-50 rounded-2xl">
                          <p className="text-[10px] font-black uppercase text-gray-400">Mensagem</p>
                          <p className="text-sm text-gray-700 mt-2">{selectedCampaign.initialMessage}</p>
                        </div>
                        <div className="p-5 bg-gray-50 rounded-2xl">
                          <p className="text-[10px] font-black uppercase text-gray-400">Base da campanha</p>
                          <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">{selectedCampaign.campaignKnowledge || 'Nenhuma base específica cadastrada.'}</p>
                        </div>
                        <p className="text-xs text-gray-500">Campanhas finalizadas são disparadas e continuadas pela aba Fluxos.</p>
                      </div>
                    )}

                    <div className="p-5 bg-gray-50 rounded-3xl border border-gray-100 space-y-4">
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-black uppercase text-emerald-700">Fila segura de disparo</p>
                          <h4 className="text-lg font-black text-gray-900 mt-1">Preparar campanha para envio controlado</h4>
                          <p className="text-sm text-gray-500 mt-1">
                            A campanha entra em fila por cliente. O envio acontece em lotes, com status individual e proteção contra duplicidade.
                          </p>
                        </div>
                        <div className="grid grid-cols-4 gap-2 min-w-full lg:min-w-[360px]">
                          {[
                            ['Fila', selectedCampaignQueueStats.pending, 'text-blue-600'],
                            ['Enviado', selectedCampaignQueueStats.sent, 'text-emerald-600'],
                            ['Falha', selectedCampaignQueueStats.failed, 'text-red-600'],
                            ['Pulou', selectedCampaignQueueStats.skipped, 'text-gray-500'],
                          ].map(([label, value, color]) => (
                            <div key={String(label)} className="bg-white rounded-2xl p-3 text-center border border-gray-100">
                              <p className={`text-lg font-black ${color}`}>{value}</p>
                              <p className="text-[10px] font-black uppercase text-gray-400">{label}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
                        {campaignAudienceSegments.map(segment => (
                          <button
                            key={segment.id}
                            onClick={() => setCampaignAudienceSegment(segment.id)}
                            className={`text-left p-3 rounded-2xl border transition-all ${
                              campaignAudienceSegment === segment.id
                                ? 'bg-emerald-50 border-emerald-200 ring-2 ring-emerald-100'
                                : 'bg-white border-gray-100 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-black text-gray-900">{segment.label}</p>
                              <span className="text-xs font-black text-emerald-600">{segment.leads.length}</span>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-1 leading-snug">{segment.description}</p>
                          </button>
                        ))}
                      </div>

                      <div className="bg-white rounded-2xl border border-gray-100 p-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-black text-gray-900">Público selecionado: {selectedCampaignAudience.label}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {campaignRecipients.length} lead(s) com telefone serão preparados para esta campanha.
                            </p>
                          </div>
                          <p className="text-[10px] font-black uppercase text-gray-400">Limite atual: 200 por preparação</p>
                        </div>
                        {selectedCampaignAudience.leads.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedCampaignAudience.leads.slice(0, 6).map(lead => (
                              <span key={lead.id} className="text-xs font-bold bg-gray-50 text-gray-600 border border-gray-100 px-3 py-1.5 rounded-xl">
                                {lead.name || 'Cliente'} · {getLeadInactiveDays(lead) ?? '-'}d
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Agendar a partir de</p>
                          <input
                            type="datetime-local"
                            value={campaignSchedule}
                            onChange={(event) => setCampaignSchedule(event.target.value)}
                            className="w-full bg-white rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <button
                          disabled={isQueueingCampaign || selectedCampaign.status !== 'Finalizada' || campaignRecipients.length === 0}
                          onClick={handleQueueSelectedCampaign}
                          className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-black hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isQueueingCampaign ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                          Enfileirar {campaignRecipients.length} lead(s)
                        </button>
                        <button
                          disabled={isProcessingCampaignQueue || pendingCampaignQueue.length === 0}
                          onClick={handleProcessCampaignQueue}
                          className="flex items-center justify-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-2xl text-sm font-black hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessingCampaignQueue ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
                          Processar lote
                        </button>
                      </div>

                      {selectedCampaign.status !== 'Finalizada' && (
                        <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
                          Finalize a campanha antes de enfileirar disparos.
                        </p>
                      )}

                      {campaignQueueResult && (
                        <div className="bg-white border border-gray-100 rounded-2xl p-4">
                          <p className="text-sm font-black text-gray-900">Resultado da fila</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {campaignQueueResult.queuedCount !== undefined && `${campaignQueueResult.queuedCount} enfileirado(s), ${campaignQueueResult.skippedCount || 0} pulado(s).`}
                            {campaignQueueResult.sentCount !== undefined && `${campaignQueueResult.sentCount} enviado(s), ${campaignQueueResult.failedCount || 0} falha(s).`}
                          </p>
                        </div>
                      )}

                      {selectedCampaignQueue.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                          <div className="grid grid-cols-1 divide-y divide-gray-100 max-h-72 overflow-y-auto">
                            {selectedCampaignQueue.slice(0, 12).map(item => (
                              <div key={item.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-black text-gray-900 truncate">{item.customerName || item.phone || item.remoteJid}</p>
                                  <p className="text-xs text-gray-500 truncate">{item.messageText}</p>
                                </div>
                                <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg self-start sm:self-auto ${
                                  item.status === 'sent' ? 'bg-emerald-100 text-emerald-700' :
                                  item.status === 'failed' ? 'bg-red-100 text-red-700' :
                                  item.status === 'pending' ? 'bg-blue-100 text-blue-700' :
                                  item.status === 'sending' ? 'bg-amber-100 text-amber-700' :
                                  'bg-gray-100 text-gray-500'
                                }`}>
                                  {item.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'fluxos' && (
            <motion.div
              key="fluxos"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-5"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black text-gray-900">Fluxos</h2>
                  <p className="text-sm text-gray-500 mt-1">Defina qual agente assume respostas de campanha e quando ele transfere para vendas ou suporte.</p>
                </div>
                <button
                  onClick={handleSaveWhatsappAiConfig}
                  className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-black hover:bg-emerald-700 transition-all"
                >
                  <Check size={18} />
                  Salvar fluxo
                </button>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-3">
                  <p className="text-xs font-black uppercase text-gray-400">Campanhas no fluxo</p>
                  {whatsappCampaigns.map(campaign => (
                    <button
                      key={campaign.id}
                      onClick={() => setSelectedFlowCampaignId(campaign.id)}
                      className={`w-full text-left p-4 rounded-2xl transition-all ${
                        selectedFlowCampaign?.id === campaign.id ? 'bg-emerald-50 ring-2 ring-emerald-100' : 'bg-gray-50 hover:bg-emerald-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-black text-gray-900">{campaign.name}</p>
                        <span className="text-[10px] font-black uppercase text-gray-400">{campaign.status}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{campaign.audience}</p>
                      <p className="text-xs font-bold text-emerald-700 mt-2">Agente: {campaign.campaignAgent}</p>
                    </button>
                  ))}
                  <button
                    onClick={() => selectTab('campanhas')}
                    className="w-full px-4 py-3 rounded-2xl bg-gray-100 text-gray-600 text-sm font-black hover:bg-gray-200 transition-all"
                  >
                    Criar nova campanha
                  </button>
                </div>

                {selectedFlowCampaign && (
                <div className="space-y-4">
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase text-emerald-700">Fluxo da campanha</p>
                        <h3 className="text-2xl font-black text-gray-900 mt-1">{selectedFlowCampaign.name}</h3>
                        <p className="text-sm text-gray-500 mt-2 max-w-2xl">
                          A campanha dispara a primeira mensagem. Qualquer resposta do cliente entra para o agente de campanha interpretar a intenção.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedCampaignId(selectedFlowCampaign.id);
                          selectTab('campanhas');
                        }}
                        className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-2xl text-sm font-black hover:bg-gray-200 transition-all"
                      >
                        Editar campanha
                      </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mt-6">
                      {[
                        ['1', 'Campanha', selectedFlowCampaign.name],
                        ['2', 'Resposta recebida', 'Qualquer mensagem do cliente'],
                        ['3', 'Agente de campanha', selectedFlowCampaign.campaignAgent],
                        ['4', 'Passagem', selectedFlowCampaign.handoffAgent],
                      ].map(([step, title, text]) => (
                        <div key={step} className="relative p-4 bg-gray-50 rounded-2xl border border-gray-100">
                          <span className="w-8 h-8 rounded-xl bg-emerald-600 text-white text-sm font-black flex items-center justify-center">{step}</span>
                          <p className="text-[10px] font-black uppercase text-gray-400 mt-3">{title}</p>
                          <p className="text-sm font-black text-gray-900 mt-1">{text}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-[1fr_0.9fr] gap-4">
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                      <h3 className="text-lg font-black text-gray-900">Agente que responde a campanha</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Agente da campanha</p>
                          <select
                            value={selectedFlowCampaign.campaignAgent}
                            onChange={(event) => handleWhatsappCampaignChange(selectedFlowCampaign.id, 'campaignAgent', event.target.value)}
                            className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none"
                          >
                            {whatsappAgentConfigs.map(agent => <option key={agent.name} value={agent.name}>{agent.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Passar para vendas</p>
                          <select
                            value={selectedFlowCampaign.handoffAgent}
                            onChange={(event) => handleWhatsappCampaignChange(selectedFlowCampaign.id, 'handoffAgent', event.target.value)}
                            className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none"
                          >
                            {whatsappAgentConfigs.map(agent => <option key={agent.name} value={agent.name}>{agent.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Como reconhecer resposta desta campanha</p>
                        <textarea
                          value={selectedFlowCampaign.responseRecognition}
                          onChange={(event) => handleWhatsappCampaignChange(selectedFlowCampaign.id, 'responseRecognition', event.target.value)}
                          rows={4}
                          className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-gray-400 mb-1">O que o agente deve fazer quando alguém responder</p>
                        <textarea
                          value={selectedFlowCampaign.responseInstructions}
                          onChange={(event) => handleWhatsappCampaignChange(selectedFlowCampaign.id, 'responseInstructions', event.target.value)}
                          rows={5}
                          className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Quando passar para outro agente</p>
                        <textarea
                          value={selectedFlowCampaign.handoffRules}
                          onChange={(event) => handleWhatsappCampaignChange(selectedFlowCampaign.id, 'handoffRules', event.target.value)}
                          rows={5}
                          className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                        <h3 className="text-lg font-black text-gray-900">Mensagem e cupom</h3>
                        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                          <p className="text-[10px] font-black uppercase text-emerald-700">Disparo</p>
                          <p className="text-sm font-bold text-emerald-950 mt-2">{selectedFlowCampaign.initialMessage}</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Cupom</p>
                            <input
                              value={selectedFlowCampaign.couponCode}
                              onChange={(event) => handleWhatsappCampaignChange(selectedFlowCampaign.id, 'couponCode', event.target.value.toUpperCase())}
                              placeholder="ATELIE10"
                              className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Regra</p>
                            <input
                              value={selectedFlowCampaign.couponDetails}
                              onChange={(event) => handleWhatsappCampaignChange(selectedFlowCampaign.id, 'couponDetails', event.target.value)}
                              className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                        <h3 className="text-lg font-black text-gray-900">Base da campanha para o assistente</h3>
                        <p className="text-sm text-gray-500 mt-1">Essa base é usada junto com a base geral do assistente de campanhas.</p>
                        <textarea
                          value={selectedFlowCampaign.campaignKnowledge}
                          onChange={(event) => handleWhatsappCampaignChange(selectedFlowCampaign.id, 'campaignKnowledge', event.target.value)}
                          rows={6}
                          className="mt-4 w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                        />
                      </div>

                  {selectedFlowCampaign && (
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-3">
                      <label className="flex items-center gap-2 text-sm font-black text-gray-700">
                        <input
                          type="checkbox"
                          checked={selectedFlowCampaign.randomizerEnabled}
                          onChange={(event) => handleWhatsappCampaignChange(selectedFlowCampaign.id, 'randomizerEnabled', event.target.checked)}
                          className="w-4 h-4 accent-emerald-600"
                        />
                        Randomizar mensagens
                      </label>
                      <p className="text-xs text-gray-500">As variações usam a mensagem da campanha como base e mantêm o mesmo objetivo.</p>
                      {(selectedFlowCampaign.messageVariants || [selectedFlowCampaign.initialMessage]).map((variant, index) => (
                        <div key={`${selectedFlowCampaign.id}-variant-${index}`} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-black uppercase text-gray-400">
                              {index === 0 ? 'Mensagem principal' : `Variação ${index + 1}`}
                            </p>
                            {index > 0 && (
                              <button
                                onClick={() => handleDeleteWhatsappCampaignVariant(selectedFlowCampaign.id, index)}
                                className="text-[10px] font-black text-red-500 hover:text-red-600"
                              >
                                Remover
                              </button>
                            )}
                          </div>
                          <textarea
                            value={variant}
                            onChange={(event) => handleWhatsappCampaignVariantChange(selectedFlowCampaign.id, index, event.target.value)}
                            rows={3}
                            className="w-full bg-gray-50 rounded-2xl px-3 py-2 text-xs text-gray-700 border border-gray-100 outline-none resize-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      ))}
                      <button
                        onClick={() => handleAddWhatsappCampaignVariant(selectedFlowCampaign.id)}
                        className="w-full px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-black hover:bg-gray-200 transition-all"
                      >
                        Gerar variação relacionada
                      </button>
                    </div>
                  )}
                    </div>
                  </div>
                </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'assistenteCampanhas' && (
            <motion.div
              key="assistente-campanhas"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-5"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black text-gray-900">Assistente de campanhas</h2>
                  <p className="text-sm text-gray-500 mt-1">Agente responsável por interpretar respostas das campanhas e responder antes de transferir.</p>
                </div>
                <button onClick={handleSaveWhatsappAiConfig} disabled={isSavingWhatsappAi} className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-black hover:bg-emerald-700 transition-all disabled:opacity-60">
                  {isSavingWhatsappAi ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  Salvar assistente
                </button>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[0.8fr_1.2fr] gap-4">
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                  <h3 className="text-lg font-black text-gray-900">Identidade do agente</h3>
                  <div>
                    <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Nome</p>
                    <input value={whatsappCampaignAssistant.name} onChange={(event) => handleWhatsappCampaignAssistantChange('name', event.target.value)} className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Tom de atendimento</p>
                    <input value={whatsappCampaignAssistant.tone} onChange={(event) => handleWhatsappCampaignAssistantChange('tone', event.target.value)} className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <p className="text-[10px] font-black uppercase text-emerald-700">Como ele entra na conversa</p>
                    <p className="text-sm text-emerald-800 mt-2">Quando houver resposta a uma campanha, ele usa a campanha de origem, a base específica e a base geral abaixo para decidir a melhor resposta.</p>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                  <h3 className="text-lg font-black text-gray-900">Regras de inteligência</h3>
                  <div>
                    <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Como reconhecer resposta de campanha</p>
                    <textarea value={whatsappCampaignAssistant.responseRecognition} onChange={(event) => handleWhatsappCampaignAssistantChange('responseRecognition', event.target.value)} rows={4} className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Prompt principal</p>
                    <textarea value={whatsappCampaignAssistant.prompt} onChange={(event) => handleWhatsappCampaignAssistantChange('prompt', event.target.value)} rows={6} className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Regras padrão de passagem</p>
                    <textarea value={whatsappCampaignAssistant.defaultHandoffRules} onChange={(event) => handleWhatsappCampaignAssistantChange('defaultHandoffRules', event.target.value)} rows={4} className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none" />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <h3 className="text-lg font-black text-gray-900">Base de conhecimento geral do assistente</h3>
                <p className="text-sm text-gray-500 mt-1">Essa base vale para todas as campanhas. A base específica de cada campanha complementa estas instruções.</p>
                <textarea value={whatsappCampaignAssistant.knowledge} onChange={(event) => handleWhatsappCampaignAssistantChange('knowledge', event.target.value)} rows={8} className="mt-4 w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none" />
              </div>
            </motion.div>
          )}

          {activeTab === 'whatsapp' && (
            <motion.div
              key="whatsapp"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={whatsappEnvironment === 'atendimento' ? 'whatsapp-full-workspace' : 'space-y-8'}
            >
              {whatsappEnvironment !== 'atendimento' && (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <MessageCircle className="text-emerald-600" size={26} />
                    WhatsApp IA
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">Atendimento com Evolution API, ChatGPT e agentes por intenção.</p>
                </div>
                <div className="flex gap-2">
                  <button className="flex items-center gap-2 px-4 py-3 bg-white border border-gray-100 rounded-2xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all shadow-sm">
                    <PlugZap size={18} />
                    Testar Evolution
                  </button>
                  <button
                    onClick={handleSaveWhatsappAiConfig}
                    disabled={isSavingWhatsappAi}
                    className="flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-60"
                  >
                    {isSavingWhatsappAi ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                    {isSavingWhatsappAi ? 'Salvando' : 'Salvar'}
                  </button>
                </div>
              </div>
              )}
              {whatsappEnvironment !== 'atendimento' && whatsappAiSavedAt && (
                <p className="text-xs text-gray-400 -mt-4">
                  Configuração salva em {format(new Date(whatsappAiSavedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              )}

              {whatsappEnvironment === 'dashboard' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Instância', value: 'AtelieFit-01', note: 'Conectada', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Conversas hoje', value: '38', note: '12 oportunidades', icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50' },
                  { label: 'Tempo médio', value: '42s', note: 'Primeira resposta', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
                  { label: 'Agentes ativos', value: '3/4', note: '1 em revisão', icon: Brain, color: 'text-purple-600', bg: 'bg-purple-50' },
                ].map(item => (
                  <div key={item.label} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className={`p-3 ${item.bg} rounded-2xl shrink-0`}>
                      <item.icon className={item.color} size={22} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">{item.label}</p>
                      <p className="text-2xl font-black text-gray-900">{item.value}</p>
                      <p className="text-xs text-gray-400">{item.note}</p>
                    </div>
                  </div>
                ))}
              </div>
              )}

              {whatsappEnvironment === 'dashboard' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { id: 'dashboard', label: 'Dashboard', note: 'Status geral e indicadores', icon: LayoutDashboard },
                  { id: 'atendimento', label: 'Atendimento', note: 'Conversas e assumir chat', icon: MessageCircle },
                  { id: 'configuracoes', label: 'Configurações', note: 'Agentes, base e integrações', icon: Settings },
                ].map(environment => (
                  <button
                    key={environment.id}
                    onClick={() => setWhatsappEnvironment(environment.id as WhatsAppEnvironment)}
                    className={`text-left bg-white p-4 rounded-2xl border transition-all shadow-sm ${
                      whatsappEnvironment === environment.id
                        ? 'border-emerald-200 ring-2 ring-emerald-100'
                        : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <environment.icon className={whatsappEnvironment === environment.id ? 'text-emerald-600' : 'text-gray-400'} size={18} />
                      <span className="text-sm font-bold text-gray-900">{environment.label}</span>
                    </div>
                    <p className="text-xs text-gray-400">{environment.note}</p>
                  </button>
                ))}
              </div>
              )}

              {whatsappEnvironment === 'atendimento' && (
                <div className="whatsapp-chat-shell bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="chat-topbar p-4 md:p-5 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase text-emerald-700 tracking-wider">Atendimento WhatsApp</p>
                      <h3 className="text-xl md:text-2xl font-black text-gray-900">Conversas e assumir atendimento</h3>
                      <p className="text-sm text-gray-500">Fila de atendimento, intenção detectada e passagem para humano.</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setWhatsappEnvironment('dashboard')} className="px-4 py-2.5 bg-gray-50 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-100 transition-all">
                        Dashboard
                      </button>
                      <button onClick={() => setWhatsappEnvironment('configuracoes')} className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all">
                        Configurações
                      </button>
                    </div>
                  </div>
                  <div className="whatsapp-chat-grid grid grid-cols-1 lg:grid-cols-[380px_1fr]">
                    <div className="chat-list border-b lg:border-b-0 lg:border-r border-gray-100">
                      {whatsappConversations.map(conversation => (
                        <button
                          key={conversation.id}
                          onClick={() => setSelectedWhatsappConversation(conversation.id)}
                          className={`w-full p-4 text-left border-b border-gray-50 hover:bg-gray-50 transition-all ${
                            selectedWhatsappConversation === conversation.id ? 'bg-emerald-50' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-gray-900 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                              {conversation.customer.slice(0, 1)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-bold text-gray-900 truncate">{conversation.customer}</p>
                                <span className="text-[10px] text-gray-400">{conversation.time}</span>
                              </div>
                              <p className="text-xs text-gray-500 truncate mt-1">{conversation.intent}</p>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-[10px] font-bold bg-white text-gray-500 px-2 py-1 rounded-lg border border-gray-100">{conversation.agent}</span>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                                  conversation.score < 50 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {conversation.score}%
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="chat-panel flex flex-col bg-gray-50">
                      <div className="p-4 bg-white border-b border-gray-100 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-gray-900">{selectedConversation.customer}</p>
                          <p className="text-xs text-gray-500">Em atendimento com {selectedConversation.agent}</p>
                        </div>
                        <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-100 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">
                          <Headphones size={16} />
                          Assumir
                        </button>
                      </div>
                      <div className="flex-1 p-5 space-y-3">
                        {selectedConversation.messages.map((message, index) => (
                          <div key={`${message.from}-${index}`} className={`flex ${message.from === 'agent' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                              message.from === 'agent'
                                ? 'bg-emerald-600 text-white rounded-br-sm'
                                : 'bg-white text-gray-700 rounded-bl-sm border border-gray-100'
                            }`}>
                              {message.text}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="p-4 bg-white border-t border-gray-100 flex gap-2">
                        <input
                          value="Posso te mandar duas opções de kit com calorias e valores?"
                          readOnly
                          className="flex-1 bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-600 border-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center hover:bg-emerald-700">
                          <Send size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {whatsappEnvironment === 'leads' && (
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase text-emerald-700 tracking-wider">Leads Promokit</p>
                      <h3 className="text-xl font-black text-gray-900">Clientes sincronizados</h3>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <p className="text-sm text-gray-500">{whatsappLeads.length} cliente(s) encontrados</p>
                      <button
                        onClick={handleSyncPromokitLeads}
                        disabled={isSyncingPromokit}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-2xl text-sm font-black hover:bg-emerald-700 transition-all disabled:opacity-60"
                      >
                        {isSyncingPromokit ? <Loader2 className="animate-spin" size={17} /> : <RefreshCcw size={17} />}
                        Sincronizar leads
                      </button>
                    </div>
                  </div>
                  {whatsappLeads.length === 0 ? (
                    <div className="p-12 text-center">
                      <UserPlus className="mx-auto text-gray-300 mb-4" size={42} />
                      <p className="text-gray-500 font-bold">Nenhum lead sincronizado ainda.</p>
                      <p className="text-sm text-gray-400 mt-1">Rode a sincronização da Promokit para popular esta lista.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {whatsappLeads.map(lead => (
                        <div key={lead.id} className="p-5 grid grid-cols-1 xl:grid-cols-[1.2fr_1fr_1fr_140px] gap-4 xl:items-center">
                          <div>
                            <h4 className="font-black text-gray-900">{lead.name || 'Cliente sem nome'}</h4>
                            <p className="text-sm text-gray-500 mt-1">{lead.phone || 'Telefone não informado'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase text-gray-400">Endereço</p>
                            <p className="text-sm text-gray-600">
                              {lead.address?.logradouro ? `${lead.address.logradouro}, ${lead.address.numero || 's/n'} - ${lead.address.bairro || ''}` : 'Endereço não informado'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase text-gray-400">Último pedido</p>
                            <p className="text-sm font-bold text-gray-900">#{lead.lastOrderCode || '-'}</p>
                            <p className="text-xs text-gray-500">
                              {lead.lastOrderAt ? new Date(lead.lastOrderAt).toLocaleDateString('pt-BR') : 'Sem data'}
                            </p>
                          </div>
                          <div className="text-left xl:text-right">
                            <p className="text-[10px] font-black uppercase text-gray-400">Total</p>
                            <p className="text-lg font-black text-emerald-600">
                              R$ {(lead.lastOrderTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs text-gray-500">{lead.orderCount || 0} compra(s)</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {whatsappEnvironment === 'configuracoes' && (
                <div className="space-y-4">
                  <div className="config-tabs bg-white p-2 rounded-3xl border border-gray-100 shadow-sm flex flex-wrap gap-2">
                    {whatsappConfigTabs.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setWhatsappConfigTab(tab.id)}
                        className={`config-tab-button flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-black transition-all ${
                          whatsappConfigTab === tab.id
                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100'
                            : 'text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <tab.icon size={17} />
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {whatsappConfigTab === 'agentes' && (
                  <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase text-emerald-700 tracking-wider">Agentes</p>
                        <h3 className="text-xl font-black text-gray-900">Lista de agentes</h3>
                      </div>
                      <p className="text-sm text-gray-500">Clique em configurar para editar objetivo, prompt e tom de voz.</p>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {whatsappAgentConfigs.map(agent => {
                        const stats = getAgentConversationStats(agent.name);
                        return (
                        <div key={agent.name} className="p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-lg font-black text-gray-900">{agent.name}</h4>
                              <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg ${agent.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                {agent.enabled ? 'Ativo' : 'Revisão'}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mt-1">{agent.role}</p>
                            <p className="text-sm text-gray-500 mt-2 max-w-xl">{agent.tone}</p>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-[140px_150px_130px] gap-3 xl:min-w-[460px]">
                            <div className="bg-gray-50 rounded-2xl p-3">
                              <p className="text-[10px] font-black uppercase text-gray-400">Ativas</p>
                              <p className="text-xl font-black text-gray-900">{stats.active}</p>
                            </div>
                            <div className="bg-gray-50 rounded-2xl p-3">
                              <p className="text-[10px] font-black uppercase text-gray-400">Finalizadas</p>
                              <p className="text-xl font-black text-gray-900">{stats.finished}</p>
                            </div>
                            <button
                              onClick={() => setEditingWhatsappAgent(agent.name)}
                              className="col-span-2 md:col-span-1 px-4 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-black hover:bg-emerald-700 transition-all"
                            >
                              Configurar
                            </button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                  )}

                  {whatsappConfigTab === 'agentes' && (
                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Route className="text-emerald-600" size={20} />
                      Roteamento de intenção
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        { title: 'Entrada', text: 'Lia entende saudação, urgência, bairro e intenção inicial.' },
                        { title: 'Compra', text: 'Dúvidas de cardápio, preço e entrega seguem para Nina.' },
                        { title: 'Problema', text: 'Atraso, reclamação ou cancelamento seguem para Caio e podem chamar humano.' },
                      ].map(rule => (
                        <div key={rule.title} className="p-4 bg-gray-50 rounded-2xl">
                          <p className="font-bold text-gray-900">{rule.title}</p>
                          <p className="text-sm text-gray-500 mt-1">{rule.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  )}
                </div>
              )}

              {whatsappEnvironment === 'configuracoes' && whatsappConfigTab === 'base' && (
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.1fr] gap-4">
                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Store className="text-emerald-600" size={20} />
                      Cardápio do estoque
                    </h3>
                    <div className="grid grid-cols-1 gap-3 max-h-[520px] overflow-auto pr-1">
                      {stock.map(item => (
                        <div key={item.id} className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-2xl">
                          <div>
                            <p className="font-bold text-gray-900 capitalize">{item.name}</p>
                            <p className="text-xs text-gray-400">Marmita · Estoque {item.currentStock} un</p>
                          </div>
                          <span className="text-sm font-black text-emerald-600">
                            R$ {item.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                      {kits.map(kit => (
                        <div key={kit.id} className="flex items-center justify-between gap-4 p-4 bg-emerald-50 rounded-2xl">
                          <div>
                            <p className="font-bold text-gray-900 capitalize">{kit.name}</p>
                            <p className="text-xs text-gray-500">Kit · {kit.items.length} item(ns) na composição</p>
                          </div>
                          <span className="text-sm font-black text-emerald-600">
                            R$ {(kit.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-4">
                      Esta base é gerada automaticamente a partir de marmitas e kits cadastrados.
                    </p>
                  </div>

                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Tag className="text-emerald-600" size={20} />
                      Base complementar por agente
                    </h3>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {whatsappAgentConfigs.map(agent => (
                        <button
                          key={agent.name}
                          onClick={() => setSelectedAgentKnowledge(agent.name)}
                          className={`px-4 py-2 rounded-xl text-sm font-black transition-all ${
                            selectedAgentKnowledge === agent.name ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          {agent.name}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-4">
                      {whatsappKnowledgeSections.map(section => (
                        <div key={section.key}>
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase">{section.title}</p>
                            <p className="text-xs text-gray-500 mb-2">{section.description}</p>
                          </div>
                          <textarea
                            value={(whatsappAgentKnowledge[selectedAgentKnowledge] || defaultWhatsappKnowledge)[section.key]}
                            onChange={(event) => handleWhatsappAgentKnowledgeChange(selectedAgentKnowledge, section.key, event.target.value)}
                            placeholder={section.placeholder}
                            rows={4}
                            className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {whatsappEnvironment === 'configuracoes' && whatsappConfigTab === 'automacoes' && (
                <div className="space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-black text-gray-900">Automações configuráveis</h3>
                      <p className="text-sm text-gray-500">Rode primeiro em simulação; o envio real pode ser liberado depois.</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        onClick={handleRunWhatsappAutomations}
                        disabled={isRunningAutomations}
                        className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-black hover:bg-emerald-700 transition-all disabled:opacity-60"
                      >
                        {isRunningAutomations ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                        Simular automações
                      </button>
                      <button
                        onClick={handleQueuePostSaleFollowups}
                        disabled={isQueueingPostSale}
                        className="flex items-center justify-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-2xl text-sm font-black hover:bg-gray-800 transition-all disabled:opacity-60"
                      >
                        {isQueueingPostSale ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        Preparar pós-venda
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {whatsappAutomations.map(automation => (
                      <div key={automation.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Zap className="text-amber-500 mb-3" size={24} />
                            <h3 className="font-black text-gray-900">{automation.title}</h3>
                            <p className="text-sm text-gray-500 mt-1">{automation.description}</p>
                          </div>
                          <label className="flex items-center gap-2 text-xs font-black text-gray-500 uppercase">
                            <input
                              type="checkbox"
                              checked={automation.enabled}
                              onChange={(event) => handleWhatsappAutomationChange(automation.id, 'enabled', event.target.checked)}
                              className="w-4 h-4 accent-emerald-600"
                            />
                            {automation.enabled ? 'Ativa' : 'Pausada'}
                          </label>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Agente</p>
                            <select
                              value={automation.agent}
                              onChange={(event) => handleWhatsappAutomationChange(automation.id, 'agent', event.target.value)}
                              className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none"
                            >
                              {whatsappAgentConfigs.map(agent => <option key={agent.name} value={agent.name}>{agent.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Dias</p>
                            <input
                              type="number"
                              value={automation.triggerDays || 0}
                              onChange={(event) => handleWhatsappAutomationChange(automation.id, 'triggerDays', Number(event.target.value))}
                              className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none"
                            />
                          </div>
                        </div>
                        <textarea
                          value={automation.message}
                          onChange={(event) => handleWhatsappAutomationChange(automation.id, 'message', event.target.value)}
                          rows={3}
                          className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                        />
                      </div>
                    ))}
                  </div>
                  {automationResult && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-5">
                      <p className="font-black text-emerald-800">Simulação concluída</p>
                      <p className="text-sm text-emerald-700 mt-1">
                        {automationResult.candidates?.length || 0} cliente(s) elegíveis encontrados.
                        {' '}
                        {automationResult.operationalActions?.length || 0} regra(s) operacional(is) ativa(s).
                        {' '}
                        {automationResult.queuedCount ? `${automationResult.queuedCount} pós-venda(s) na fila.` : ''}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {whatsappEnvironment === 'configuracoes' && whatsappConfigTab === 'campanhas' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 xl:grid-cols-[0.85fr_1.15fr] gap-4">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-700">
                          <Megaphone size={22} />
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase text-emerald-700 tracking-wider">Agente interno</p>
                          <h3 className="text-xl font-black text-gray-900">Criador de campanhas</h3>
                          <p className="text-sm text-gray-500 mt-1">Esse agente ajuda você a montar mensagens e fluxos. Ele não aparece para o cliente.</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Nome do agente</p>
                        <input
                          value={whatsappCampaignAssistant.name}
                          onChange={(event) => handleWhatsappCampaignAssistantChange('name', event.target.value)}
                          className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Tom de criação</p>
                        <input
                          value={whatsappCampaignAssistant.tone}
                          onChange={(event) => handleWhatsappCampaignAssistantChange('tone', event.target.value)}
                          className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Treinamento do agente</p>
                        <textarea
                          value={whatsappCampaignAssistant.prompt}
                          onChange={(event) => handleWhatsappCampaignAssistantChange('prompt', event.target.value)}
                          rows={8}
                          className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-black text-gray-900">Disparos e fluxos</h3>
                          <p className="text-sm text-gray-500">Crie campanhas com mensagem inicial e resposta de continuidade por palavra-chave.</p>
                        </div>
                        <button
                          onClick={handleAddWhatsappCampaign}
                          className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-black hover:bg-emerald-700 transition-all"
                        >
                          <Plus size={18} />
                          Nova campanha
                        </button>
                      </div>

                      {whatsappCampaigns.map(campaign => (
                        <div key={campaign.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_150px] gap-3">
                            <div>
                              <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Nome da campanha</p>
                              <input
                                value={campaign.name}
                                onChange={(event) => handleWhatsappCampaignChange(campaign.id, 'name', event.target.value)}
                                className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Status</p>
                              <select
                                value={campaign.status}
                                onChange={(event) => handleWhatsappCampaignChange(campaign.id, 'status', event.target.value)}
                                className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none"
                              >
                                <option>Rascunho</option>
                                <option>Finalizada</option>
                                <option>Pausada</option>
                              </select>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Agente</p>
                              <select
                                value={campaign.agent}
                                onChange={(event) => handleWhatsappCampaignChange(campaign.id, 'agent', event.target.value)}
                                className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none"
                              >
                                {whatsappAgentConfigs.map(agent => <option key={agent.name} value={agent.name}>{agent.name}</option>)}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Público</p>
                              <input
                                value={campaign.audience}
                                onChange={(event) => handleWhatsappCampaignChange(campaign.id, 'audience', event.target.value)}
                                className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Objetivo</p>
                              <input
                                value={campaign.objective}
                                onChange={(event) => handleWhatsappCampaignChange(campaign.id, 'objective', event.target.value)}
                                className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                          </div>

                          <div>
                            <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Mensagem do disparo</p>
                            <textarea
                              value={campaign.initialMessage}
                              onChange={(event) => handleWhatsappCampaignChange(campaign.id, 'initialMessage', event.target.value)}
                              rows={3}
                              className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-[0.75fr_1.25fr] gap-3">
                            <div>
                              <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Resposta que ativa o fluxo</p>
                              <textarea
                                value={campaign.triggerKeyword}
                                onChange={(event) => handleWhatsappCampaignChange(campaign.id, 'triggerKeyword', event.target.value)}
                                rows={4}
                                className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                              />
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Mensagem seguinte do fluxo</p>
                              <textarea
                                value={campaign.flowReply}
                                onChange={(event) => handleWhatsappCampaignChange(campaign.id, 'flowReply', event.target.value)}
                                rows={4}
                                className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                              />
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-3">
                            <button className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-600 rounded-2xl text-sm font-black hover:bg-gray-200 transition-all">
                              <FileText size={17} />
                              Salvar rascunho
                            </button>
                            <button className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-black hover:bg-emerald-700 transition-all">
                              <Send size={17} />
                              Preparar disparo
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {whatsappEnvironment === 'configuracoes' && whatsappConfigTab === 'integracoes' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      ['Evolution API', 'Instância, QR Code, webhooks e envio de mensagens.', PlugZap],
                      ['ChatGPT', 'Prompt por agente, ferramentas e memória do cliente.', Brain],
                      ['Campanhas', 'Promoções, recuperação e disparos segmentados.', Megaphone],
                    ].map(([title, text, Icon]) => (
                      <div key={title as string} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                        <Icon className="text-emerald-600 mb-4" size={24} />
                        <h3 className="font-bold text-gray-900">{title as string}</h3>
                        <p className="text-sm text-gray-500 mt-2">{text as string}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Preparação operacional</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input readOnly value="AtelieFit-01" className="bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-600 border-none" />
                      <input readOnly value="WhatsApp do atendimento" className="bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-600 border-none" />
                      <input readOnly value="/api/whatsapp/evolution/webhook" className="md:col-span-2 bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-600 border-none" />
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {editingAgent && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                className="bg-white p-6 rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-auto"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                  <div>
                    <p className="text-xs font-black uppercase text-emerald-700 tracking-wider">{editingAgent.role}</p>
                    <h2 className="text-2xl font-black text-gray-900 mt-1">Configurar {editingAgent.name}</h2>
                    <p className="text-sm text-gray-500 mt-2">Ajuste objetivo, tom e prompt do agente.</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-black text-gray-500 uppercase">
                    <input
                      type="checkbox"
                      checked={editingAgent.enabled}
                      onChange={(event) => handleWhatsappAgentChange(editingAgent.name, 'enabled', event.target.checked)}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    {editingAgent.enabled ? 'Ativo' : 'Revisão'}
                  </label>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Tom de voz</p>
                    <input
                      value={editingAgent.tone}
                      onChange={(event) => handleWhatsappAgentChange(editingAgent.name, 'tone', event.target.value)}
                      className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Objetivo</p>
                    <textarea
                      value={editingAgent.goal}
                      onChange={(event) => handleWhatsappAgentChange(editingAgent.name, 'goal', event.target.value)}
                      rows={3}
                      className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Quando passar para outro agente</p>
                    <textarea
                      value={editingAgent.handoffRules}
                      onChange={(event) => handleWhatsappAgentChange(editingAgent.name, 'handoffRules', event.target.value)}
                      rows={4}
                      className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Prompt do agente</p>
                    <textarea
                      value={editingAgent.prompt}
                      onChange={(event) => handleWhatsappAgentChange(editingAgent.name, 'prompt', event.target.value)}
                      rows={8}
                      className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setEditingWhatsappAgent(null)}
                    className="px-5 py-3 bg-gray-100 text-gray-600 rounded-2xl text-sm font-black hover:bg-gray-200 transition-all"
                  >
                    Fechar
                  </button>
                  <button
                    onClick={() => setEditingWhatsappAgent(null)}
                    className="px-5 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-black hover:bg-emerald-700 transition-all"
                  >
                    Aplicar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Deletion Confirmation Modal */}
        <AnimatePresence>
          {deleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full"
              >
                <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="text-red-600" size={32} />
                </div>
                <h2 className="text-xl font-bold text-gray-900 text-center mb-2">Confirmar Exclusão</h2>
                <p className="text-gray-500 text-center mb-8">
                  Tem certeza que deseja excluir <span className="font-bold text-gray-900 capitalize">"{deleteConfirm.name}"</span>? Esta ação não pode ser desfeita.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setDeleteConfirm(null)}
                    className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={confirmDelete}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
                  >
                    Excluir
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
