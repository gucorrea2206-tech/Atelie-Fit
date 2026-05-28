import { requireEnv } from "./env.js";

export async function sendWhatsAppText(remoteJid: string, text: string) {
  const baseUrl = requireEnv("EVOLUTION_API_URL").replace(/\/$/, "");
  const apiKey = requireEnv("EVOLUTION_API_KEY");
  const instance = requireEnv("EVOLUTION_INSTANCE_NAME");

  const response = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({
      number: remoteJid.replace("@s.whatsapp.net", ""),
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Evolution sendText failed: ${response.status} ${body}`);
  }

  return response.json();
}
