import { optionalEnv, requireEnv } from "./env.js";

type PromokitToken = {
  accessToken: string;
  expiresAt: number;
};

let cachedToken: PromokitToken | null = null;

function getBaseUrl() {
  return requireEnv("PROMOKIT_API_URL").replace(/\/$/, "");
}

async function promokitRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getPromokitToken();
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body instanceof URLSearchParams ? {} : { "Content-Type": "application/json" }),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Promokit request failed: ${response.status} ${body}`);
  }

  return response.json();
}

export async function getPromokitToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  const body = new URLSearchParams({
    client_id: requireEnv("PROMOKIT_CLIENT_ID"),
    client_secret: requireEnv("PROMOKIT_CLIENT_SECRET"),
    grant_type: "client_credentials",
  });

  const response = await fetch(`${getBaseUrl()}/api/token/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Promokit token failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + 45 * 60 * 1000,
  };

  return cachedToken.accessToken;
}

export async function getPromokitOrder(code: string) {
  return promokitRequest<any>(`/api/v1/pedido/${encodeURIComponent(code)}`);
}

export async function listPromokitLatestOrders({
  lastOrderCode,
  take = 10,
  status = "novo",
}: {
  lastOrderCode: string;
  take?: number;
  status?: string;
}) {
  const query = new URLSearchParams({
    t: String(take),
    st: status,
  });

  return promokitRequest<any>(`/api/v1/liste/ultimos/${encodeURIComponent(lastOrderCode)}?${query.toString()}`);
}

export async function updatePromokitOrderStatus({
  code,
  status,
  paid,
}: {
  code: string;
  status: "novo" | "emPreparacao" | "pronto" | "saiuParaEntrega" | "entregue" | "cancelado";
  paid?: boolean;
}) {
  const body = new URLSearchParams({
    codigo: code,
    status,
  });

  if (paid !== undefined) {
    body.set("pago", String(paid));
  }

  return promokitRequest<any>("/api/v1/pedidos/status", {
    method: "PUT",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
}

export async function updatePromokitProductAvailability({
  pdvCode,
  availability,
}: {
  pdvCode: string;
  availability: "sempre_disponivel" | "nao_disponivel";
}) {
  const body = new URLSearchParams({
    disponibilidade: availability,
  });

  return promokitRequest<any>(`/api/v1/produtos/pdv/${encodeURIComponent(pdvCode)}/disponibilidade`, {
    method: "PUT",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
}

export function getPromokitEnvStatus() {
  const required = ["PROMOKIT_API_URL", "PROMOKIT_CLIENT_ID", "PROMOKIT_CLIENT_SECRET"];
  return {
    ok: required.every((name) => Boolean(optionalEnv(name))),
    missing: required.filter((name) => !optionalEnv(name)),
  };
}
