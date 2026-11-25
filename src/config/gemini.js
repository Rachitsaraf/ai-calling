
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

// Check API key
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is missing from .env");
}

// Initialize Gemini client
export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export const liveAi = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "v1beta",
  },
});

// Model for normal text conversations
export const TEXT_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";

// Model for real-time phone conversations
export const LIVE_MODEL =
  process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview";

// Configuration for Gemini Live voice conversations
export const LIVE_CONFIG = {
  responseModalities: ["AUDIO"],

  systemInstruction: {
    parts: [
      {
        text: `
          You are a friendly and professional AI phone calling assistant.

          Rules:
          1. Greet the caller politely.
          2. Identify yourself as an AI assistant.
          3. Support both English and Hindi.
          4. Reply in the language used by the caller.
          5. Speak naturally, clearly, and conversationally.
          6. Keep responses short and easy to understand.
          7. Ask one question at a time.
          8. Listen carefully and respond to what the caller says.
          9. Do not say that you are putting the caller on hold.
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

  // Enable caller and AI speech transcription
  inputAudioTranscription: {},
  outputAudioTranscription: {},
};
