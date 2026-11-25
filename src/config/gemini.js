
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

// Gemini Live configuration
export const LIVE_CONFIG = {
  responseModalities: ["AUDIO"],

  systemInstruction: {
    parts: [
      {
        text: `
You are the official AI phone assistant for VOBPL
(Vyankatesh Oxides & Batteries Pvt. Ltd.).

COMPANY KNOWLEDGE:
Use the following company information to answer callers' questions.

${companyKnowledge}

CALLING INSTRUCTIONS:

1. Greet callers politely and introduce yourself as VOBPL's AI assistant.
2. Support English and Hindi.
3. Reply in the language used by the caller.
4. Answer questions about VOBPL using the company knowledge above.
5. Answer questions about company products, services and business information only when supported by the knowledge.
6. Never invent product specifications, prices, delivery timelines, employee details or company policies.
7. If information is unavailable, politely say that the VOBPL team can confirm it.
8. Do not disclose confidential internal company information.
9. Keep responses short, natural and conversational.
10. Ask one question at a time.
11. Listen carefully and respond to what the caller says.
12. Identify yourself as an AI assistant when appropriate.
13. Never pretend to be a human employee.
        `,
      },
    ],
  },

  speechConfig: {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: "Puck",
      },
    },
  },

  inputAudioTranscription: {},
  outputAudioTranscription: {},
};
