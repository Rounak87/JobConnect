import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-3.1-pro-preview",
];

function getApiKeys() {
  const primary =
    process.env.GEMINI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  const backup =
    process.env.GEMINI_API_KEY_BACKUP ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY_BACKUP;

  const keys = [];
  if (primary) keys.push({ id: "primary", key: primary });
  if (backup && backup !== primary) keys.push({ id: "backup", key: backup });
  return keys;
}

/**
 * Universal Gemini caller with dual-key rotation and multi-model fallback.
 * Automatically recovers from 429 quota exhaustion by switching to the backup key.
 */
export async function generateGeminiContent({
  contents,
  systemInstruction,
  responseMimeType = "application/json",
  models = DEFAULT_MODELS,
}) {
  const keys = getApiKeys();
  if (keys.length === 0) {
    throw new Error("No Gemini API key defined in environment (GEMINI_API_KEY or NEXT_PUBLIC_GEMINI_API_KEY).");
  }

  let lastError = null;

  for (const keyItem of keys) {
    const ai = new GoogleGenAI({ apiKey: keyItem.key });

    for (const model of models) {
      try {
        console.log(`[Gemini] Attempting model '${model}' using ${keyItem.id} key...`);
        const config = {};
        if (systemInstruction) config.systemInstruction = systemInstruction;
        if (responseMimeType) config.responseMimeType = responseMimeType;

        const response = await ai.models.generateContent({
          model,
          contents,
          config,
        });

        console.log(`[Gemini] ✓ Success with model '${model}' (${keyItem.id} key)`);
        return {
          response,
          text: response.text,
          usedModel: model,
          usedKey: keyItem.id,
        };
      } catch (err) {
        lastError = err;
        const status = err?.status || err?.statusCode || "";
        const isRateLimit =
          status === 429 ||
          err?.message?.includes("429") ||
          err?.message?.toLowerCase().includes("quota") ||
          err?.message?.toLowerCase().includes("resource_exhausted");

        console.warn(
          `[Gemini] ✗ ${model} failed with ${keyItem.id} key:`,
          err?.message?.substring(0, 150)
        );

        // If rate limited on this key, immediately try next key
        if (isRateLimit && keys.length > 1 && keyItem.id === "primary") {
          console.warn("[Gemini] ⚠️ Quota 429 detected on primary key. Failing over to backup key...");
          break; // Break model loop for this key to switch to backup key
        }
      }
    }
  }

  const errMsg = lastError?.message || "All Gemini models and API keys exhausted.";
  throw new Error(errMsg);
}
