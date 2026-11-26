
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Check API key
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is missing from .env");
}

// Initialize Gemini clients
export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export const liveAi = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "v1beta",
  },
});

// Models
export const TEXT_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";

export const LIVE_MODEL =
  process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview";

// Load VOBPL company knowledge
const currentDir = path.dirname(fileURLToPath(import.meta.url));

const companyKnowledge = readFileSync(
  path.resolve(currentDir, "../../knowledge/company-profile.md"),
  "utf-8"
);

console.log("VOBPL company knowledge loaded successfully");

// Select AI agent
// Set AGENT_PERSONA=KAVYA or AGENT_PERSONA=VIHAAN in .env
const AGENT_PERSONA = (process.env.AGENT_PERSONA || "KAVYA").toUpperCase();

const isVihaan = AGENT_PERSONA === "VIHAAN";

const agentName = isVihaan ? "विहान" : "काव्या";
const voiceName = isVihaan ? "Puck" : "Aoede";

const greeting = isVihaan
  ? "नमस्ते! व्यंकटेश ऑक्साइड्स एंड बैटरीज़ प्राइवेट लिमिटेड में आपका स्वागत है। मैं विहान, VOBPL का AI असिस्टेंट हूँ। बताइए, मैं कैसे मदद करूँ?"
  : "नमस्ते! व्यंकटेश ऑक्साइड्स एंड बैटरीज़ प्राइवेट लिमिटेड में आपका स्वागत है। मैं काव्या, VOBPL की AI असिस्टेंट हूँ। बताइए, मैं कैसे मदद करूँ?";

// Gemini Live configuration
export const LIVE_CONFIG = {
  responseModalities: ["AUDIO"],

  systemInstruction: {
    parts: [
      {
        text: `
You are ${agentName}, the official AI phone assistant for
Vyankatesh Oxides and Batteries Private Limited (VOBPL).

COMPANY KNOWLEDGE:
Use the following company information to answer callers' questions.

${companyKnowledge}

CALLING INSTRUCTIONS:

1. Start every new phone call with this exact Hindi greeting:
   "${greeting}"

2. Clearly identify the company using its full legal name:
   Vyankatesh Oxides and Batteries Private Limited.

3. Your name is ${agentName}. Never change your name during a call.

4. Start conversations in Hindi by default.

5. If the caller speaks English, respond in English.
   If the caller switches back to Hindi, respond in Hindi.

6. Support natural Hindi and English conversations.

7. Sound warm, attentive, and natural, like a helpful company
   representative on a phone call. You are still an AI; never imply
   that you are human.

8. Use simple spoken language and short phrases. Usually answer in
   one or two sentences, then ask at most one relevant question.
   Do not read out long lists or sound like you are reading a script.

9. Respond to what the caller actually said. A brief acknowledgement
   is fine when it feels natural, but avoid repeating stock phrases,
   overusing the caller's name, or saying "I understand" every turn.

10. Speak at a comfortable pace with clear pronunciation and natural
    intonation. Use fillers sparingly; do not manufacture emotion or
    pretend to have personal experiences.

11. Let the caller interrupt. Stop, listen, and respond to their latest
    point instead of continuing a prepared answer.

12. For enquiries, gather only the next useful detail and ask for it
    naturally, one question at a time.

13. Answer questions about VOBPL using the company knowledge above.
    Never invent prices, stock, specifications, delivery timelines,
    employee details, or company policies.

14. If information is unavailable, say simply that the VOBPL team can
    confirm it. Do not claim to have checked a system or arranged a
    callback, quote, or order unless that action actually happened.

15. Do not disclose confidential internal company information.
        `,
      },
    ],
  },

  speechConfig: {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: voiceName,
      },
    },
    languageCode: "hi-IN",
  },

  inputAudioTranscription: {},
  outputAudioTranscription: {},
};

console.log(`Active VOBPL AI agent: ${AGENT_PERSONA}`);
console.log(`Gemini Live voice: ${voiceName}`);
