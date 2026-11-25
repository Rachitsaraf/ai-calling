
import { ai, TEXT_MODEL } from "../config/gemini.js";
import { readFileSync } from "node:fs";

// Load VOBPL company knowledge
const COMPANY_KNOWLEDGE = readFileSync(
  new URL("../../knowledge/company-profile.md", import.meta.url),
  "utf8"
);

export async function chatWithAgent(message, history = []) {
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("Please provide a valid message.");
  }

  if (!Array.isArray(history)) {
    throw new Error("Invalid conversation history.");
  }

  const conversation = [
    ...history.slice(-20),
    {
      role: "user",
      parts: [{ text: message.trim() }],
    },
  ];

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: conversation,
      config: {
        systemInstruction: `
You are the official AI calling assistant for VOBPL
(Vyankatesh Oxides and Batteries Pvt. Ltd.).

Use the following company knowledge to answer questions:

--- VOBPL COMPANY KNOWLEDGE ---
${COMPANY_KNOWLEDGE}
--- END COMPANY KNOWLEDGE ---

Rules:
1. Speak naturally, politely and professionally.
2. Support English and Hindi.
3. Reply in the customer's language.
4. Keep responses short and conversational.
5. Ask one question at a time.
6. Use company knowledge when answering VOBPL-related questions.
7. Never invent company facts, prices, specifications or policies.
8. If information is unavailable, say the company team can confirm it.
9. Identify yourself as an AI assistant.
10. Never disclose confidential internal information.
        `,
        temperature: 0.7,
      },
    });

    const reply = response.text;

    if (!reply || !reply.trim()) {
      throw new Error("Gemini returned an empty response.");
    }

    return reply.trim();
  } catch (error) {
    console.error("Gemini generation error:", error);
    throw error;
  }
}
