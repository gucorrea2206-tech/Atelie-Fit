import { PromokitLead } from './firebase';

export type CampaignAudienceSegment = 'todos' | 'parados15' | 'parados30' | 'recentes' | 'recorrentes';

export function getLeadInactiveDays(lead: PromokitLead, today = new Date()) {
  if (!lead.lastOrderAt) return null;
  const date = new Date(lead.lastOrderAt);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function buildCampaignAudienceSegments(leads: PromokitLead[], today = new Date()) {
  const leadsWithPhone = leads.filter(lead => Boolean(lead.phone));

  return [
    {
      id: 'parados15' as const,
      label: 'Parados 15+ dias',
      description: 'Recuperação leve para quem ficou sem comprar.',
      leads: leadsWithPhone.filter(lead => {
        const days = getLeadInactiveDays(lead, today);
        return days !== null && days >= 15;
      }),
    },
    {
      id: 'parados30' as const,
      label: 'Parados 30+ dias',
      description: 'Reativação mais forte com cupom ou condição.',
      leads: leadsWithPhone.filter(lead => {
        const days = getLeadInactiveDays(lead, today);
        return days !== null && days >= 30;
      }),
    },
    {
      id: 'recentes' as const,
      label: 'Compraram recente',
      description: 'Pós-venda, recompra e sugestão da semana.',
      leads: leadsWithPhone.filter(lead => {
        const days = getLeadInactiveDays(lead, today);
        return days !== null && days <= 14;
      }),
    },
    {
      id: 'recorrentes' as const,
      label: 'Clientes recorrentes',
      description: 'Quem já comprou mais vezes e tende a repetir.',
      leads: leadsWithPhone.filter(lead => Number(lead.orderCount || 0) >= 2),
    },
    {
      id: 'todos' as const,
      label: 'Todos com telefone',
      description: 'Use com cuidado para campanhas amplas.',
      leads: leadsWithPhone,
    },
  ];
}
