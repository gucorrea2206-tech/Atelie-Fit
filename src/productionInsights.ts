import { Movement, StockItem } from './firebase';

function daysAgo(date: Date, days: number) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

export function buildProductionRecommendations(stock: StockItem[], movements: Movement[], today = new Date()) {
  const sevenDaysAgo = daysAgo(today, 7);

  return stock
    .map(item => {
      const soldLast7Days = movements
        .filter(movement => {
          const date = movement.referenceDate?.toDate?.() || movement.createdAt?.toDate?.();
          return movement.productId === item.id && movement.type === 'saida' && date && date >= sevenDaysAgo;
        })
        .reduce((acc, movement) => acc + Number(movement.quantity || 0), 0);
      const averageDailySales = soldLast7Days / 7;
      const targetStock = Math.max(8, Math.ceil(averageDailySales * 7));
      const suggestedProduction = Math.max(0, targetStock - item.currentStock);
      const urgency =
        item.currentStock <= 0 ? 'alta' :
        item.currentStock <= Math.max(3, averageDailySales * 2) ? 'media' :
        'baixa';

      return {
        ...item,
        soldLast7Days,
        averageDailySales,
        targetStock,
        suggestedProduction,
        urgency,
      };
    })
    .filter(item => item.suggestedProduction > 0 || item.currentStock <= 5)
    .sort((a, b) => {
      const urgencyScore = { alta: 3, media: 2, baixa: 1 };
      return urgencyScore[b.urgency as keyof typeof urgencyScore] - urgencyScore[a.urgency as keyof typeof urgencyScore] || b.suggestedProduction - a.suggestedProduction;
    })
    .slice(0, 8);
}
