import { requireEnv } from "./env.js";

type WhatsAppMedia = {
  url: string;
  type: "image" | "audio";
  mimeType?: string;
  fileName?: string;
};

function getEvolutionConfig() {
  return {
    baseUrl: requireEnv("EVOLUTION_API_URL").replace(/\/$/, ""),
    apiKey: requireEnv("EVOLUTION_API_KEY"),
    instance: requireEnv("EVOLUTION_INSTANCE_NAME"),
  };
}

async function sendEvolutionRequest(path: string, body: Record<string, unknown>) {
  const { baseUrl, apiKey, instance } = getEvolutionConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${baseUrl}${path}/${instance}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`Evolution request failed: ${response.status} ${responseBody}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendWhatsAppText(remoteJid: string, text: string) {
  return sendEvolutionRequest("/message/sendText", {
    number: remoteJid.replace("@s.whatsapp.net", ""),
    text,
  });
}

export async function sendWhatsAppMedia(remoteJid: string, media: WhatsAppMedia, caption = "") {
  const number = remoteJid.replace("@s.whatsapp.net", "");
  if (media.type === "audio") {
    return sendEvolutionRequest("/message/sendWhatsAppAudio", {
      number,
      audio: media.url,
    });
  }

  return sendEvolutionRequest("/message/sendMedia", {
    number,
    mediatype: "image",
    mimetype: media.mimeType || "image/jpeg",
    caption,
    media: media.url,
    fileName: media.fileName || "campanha.jpg",
  });
}
