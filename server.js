
import "dotenv/config";
import http from "node:http";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";

import {
  liveAi,
  LIVE_MODEL,
  LIVE_CONFIG,
} from "./src/config/gemini.js";

import { chatWithAgent } from "./src/services/aiAgent.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));

// --------------------------------------------------
// PLIVO ANSWER URL
// --------------------------------------------------

app.all("/answer", (req, res) => {
  const streamUrl = process.env.PUBLIC_WSS_URL;

  if (!streamUrl) {
    return res.status(500).send("PUBLIC_WSS_URL is not configured");
  }

  const xml = `
    <Response>
      <Stream
        bidirectional="true"
        keepCallAlive="true"
        contentType="audio/x-l16;rate=16000">
        ${streamUrl}
      </Stream>
    </Response>
  `;

  res.type("text/xml").send(xml);
});

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "AI Calling Agent server is running!",
  });
});

// --------------------------------------------------
// TEXT CHAT API
// --------------------------------------------------

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid message.",
      });
    }

    if (!Array.isArray(history)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation history.",
      });
    }

    const validHistory = history
      .filter(
        (item) =>
          item &&
          ["user", "model"].includes(item.role) &&
          Array.isArray(item.parts) &&
          item.parts.length > 0 &&
          item.parts.every(
            (part) => part && typeof part.text === "string"
          )
      )
      .slice(-20);

    const reply = await chatWithAgent(message, validHistory);

    res.json({
      success: true,
      reply,
    });
  } catch (error) {
    console.error("AI Agent Error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to generate a response. Please try again.",
    });
  }
});

// --------------------------------------------------
// AUDIO CONVERSION: 24 kHz TO 16 kHz
// --------------------------------------------------

function resamplePcm16(base64Audio, fromRate = 24000, toRate = 16000) {
  const input = Buffer.from(base64Audio, "base64");
  const samples = Math.floor(input.length / 2);

  if (samples === 0) {
    return "";
  }

  const outputSamples = Math.floor(
    (samples * toRate) / fromRate
  );

  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const position = (i * fromRate) / toRate;
    const index = Math.floor(position);
    const fraction = position - index;

    const a = input.readInt16LE(index * 2);

    const nextIndex = Math.min(index + 1, samples - 1);
    const b = input.readInt16LE(nextIndex * 2);

    const value = Math.round(a + (b - a) * fraction);

    output.writeInt16LE(
      Math.max(-32768, Math.min(32767, value)),
      i * 2
    );
  }

  return output.toString("base64");
}

// --------------------------------------------------
// HTTP SERVER AND PLIVO WEBSOCKET
// --------------------------------------------------

const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: "/stream",
});

// --------------------------------------------------
// PLIVO CALL HANDLER
// --------------------------------------------------

wss.on("connection", (ws) => {
  console.log("Plivo WebSocket connected!");

  let liveSession = null;
  let streamId = null;
  let greetingSent = false;
  let sessionClosed = false;

  // Connect to Gemini Live for this phone call
  const livePromise = liveAi.live.connect({
    model: LIVE_MODEL,
    config: LIVE_CONFIG,

    callbacks: {
      onopen: () => {
        console.log("Gemini Live connected!");
      },

      onmessage: (response) => {
        const content = response.serverContent;

        if (!content) {
          return;
        }

        // Handle caller interruption
        if (
          content.interrupted &&
          streamId &&
          ws.readyState === WebSocket.OPEN
        ) {
          ws.send(
            JSON.stringify({
              event: "clearAudio",
              streamId,
            })
          );
        }

        // Receive Gemini-generated audio
        const parts = content.modelTurn?.parts || [];

        for (const part of parts) {
          const audioData = part.inlineData?.data;

          if (
            !audioData ||
            sessionClosed ||
            ws.readyState !== WebSocket.OPEN
          ) {
            continue;
          }

          // Convert Gemini 24 kHz PCM to Plivo 16 kHz PCM
          const convertedAudio = resamplePcm16(
            audioData,
            24000,
            16000
          );

          if (!convertedAudio) {
            continue;
          }

          ws.send(
            JSON.stringify({
              event: "playAudio",
              media: {
                contentType: "audio/x-l16",
                sampleRate: 16000,
                payload: convertedAudio,
              },
            })
          );
        }
      },

      onerror: (error) => {
        console.error("Gemini Live error:", error);
      },

      onclose: (event) => {
        console.log(
          "Gemini Live disconnected:",
          event?.reason || "Connection closed"
        );
      },
    },
  });

  // Store the connected Gemini session
  livePromise
    .then((session) => {
      if (sessionClosed || ws.readyState !== WebSocket.OPEN) {
        session.close();
        return;
      }

      liveSession = session;

      console.log("Gemini Live session ready!");
    })
    .catch((error) => {
      console.error("Failed to connect to Gemini Live:", error);
    });

  // Handle messages received from Plivo
  ws.on("message", async (data) => {
    try {
      const event = JSON.parse(data.toString());

      // --------------------------------------------
      // CALL STARTED
      // --------------------------------------------

      if (event.event === "start") {
        console.log("Plivo call started");

        streamId = event.start?.streamId;

        console.log("Stream ID:", streamId);
        console.log("Audio format:", event.start?.mediaFormat);

        // Wait until Gemini session is ready
        const session = await livePromise;

        if (
          sessionClosed ||
          ws.readyState !== WebSocket.OPEN ||
          greetingSent
        ) {
          return;
        }

        liveSession = session;

        // Prevent duplicate greetings for this call
        greetingSent = true;

        console.log("Sending VOBPL opening greeting...");

        // Ask Gemini to speak the exact greeting
        // defined in LIVE_CONFIG system instructions.
        session.sendClientContent({
          turns: [
            {
              role: "user",
              parts: [
                {
                  text: `
A new phone call has just connected.

Immediately speak your exact opening greeting specified
in your system instructions.

Do not explain anything before the greeting.
Do not create a different greeting.
Do not wait for the caller to speak.

After greeting the caller, wait for their response.
                  `,
                },
              ],
            },
          ],
          turnComplete: true,
        });
      }

      // --------------------------------------------
      // CALLER AUDIO
      // --------------------------------------------

      else if (event.event === "media") {
        if (sessionClosed || !event.media?.payload) {
          return;
        }

        const session = liveSession || await livePromise;

        if (sessionClosed || ws.readyState !== WebSocket.OPEN) {
          return;
        }

        // Plivo sends raw 16 kHz PCM audio
        session.sendRealtimeInput({
          audio: {
            data: event.media.payload,
            mimeType: "audio/pcm;rate=16000",
          },
        });
      }

      // --------------------------------------------
      // CALL STOPPED
      // --------------------------------------------

      else if (event.event === "stop") {
        console.log("Plivo call stopped");

        sessionClosed = true;

        if (liveSession) {
          liveSession.close();
          liveSession = null;
        }
      }

    } catch (error) {
      console.error("Plivo message error:", error);
    }
  });

  // WebSocket errors
  ws.on("error", (error) => {
    console.error("Plivo WebSocket error:", error);
  });

  // WebSocket disconnected
  ws.on("close", () => {
    console.log("Plivo WebSocket disconnected");

    sessionClosed = true;

    if (liveSession) {
      liveSession.close();
    }

    liveSession = null;
  });
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Gemini Live model: ${LIVE_MODEL}`);
});
