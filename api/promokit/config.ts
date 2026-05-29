import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPromokitEnvStatus } from "../_lib/promokit.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json({
    ...getPromokitEnvStatus(),
    endpoints: {
      syncOrders: "/api/promokit/sync-orders",
      syncNewOrders: "/api/promokit/sync-new-orders",
      getOrder: "/api/promokit/order?code=CODIGO",
      updateOrderStatus: "/api/promokit/update-order-status",
      updateProductAvailability: "/api/promokit/update-product-availability",
    },
  });
}
