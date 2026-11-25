
import { ai, TEXT_MODEL } from "../config/gemini.js";

export async function chatWithAgent(message, history = []) {
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("Please provide a valid message.");
  }

  if (!Array.isArray(history)) {
    throw new Error("Invalid conversation history.");
  }

  // Keep the latest 20 conversation messages
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
          You are a friendly and professional AI calling assistant.

          Rules:
          1. Speak naturally and politely.
          2. Support both English and Hindi.
          3. Reply in the customer's language.
          4. Keep responses short and conversational.
          5. Ask one question at a time.
          6. Remember details shared earlier in the conversation.
          7. Identify yourself as an AI assistant.
          8. Avoid long or complicated explanations.
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
