
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const chatMessages = document.getElementById("chatMessages");
const sendButton = document.getElementById("sendButton");

// Stores previous conversation messages
let conversationHistory = [];

try {
  const storedHistory = JSON.parse(
    localStorage.getItem("conversationHistory") || "[]"
  );

  if (Array.isArray(storedHistory)) {
    conversationHistory = storedHistory
      .filter(
        (item) =>
          item &&
          ["user", "model"].includes(item.role) &&
          Array.isArray(item.parts) &&
          typeof item.parts[0]?.text === "string"
      )
      .slice(-20);
  }
} catch (error) {
  console.warn("Invalid saved conversation history; starting a new chat.", error);
  localStorage.removeItem("conversationHistory");
}
// Restore previous conversation after page refresh
conversationHistory.forEach((item) => {
  const message = item.parts[0].text;

  const sender = item.role === "user" ? "user" : "bot";

  addMessage(message, sender);
});

// Display a message
function addMessage(message, sender) {
  const messageElement = document.createElement("div");

  messageElement.classList.add("message", sender);
  messageElement.textContent = message;

  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Text-to-Speech
function speakResponse(text) {
  if (!("speechSynthesis" in window)) {
    return;
  }

  window.speechSynthesis.cancel();

  const speech = new SpeechSynthesisUtterance(text);

  speech.lang = /[\u0900-\u097F]/.test(text)
    ? "hi-IN"
    : "en-IN";

  speech.rate = 1;
  speech.pitch = 1;
  speech.volume = 1;

  window.speechSynthesis.speak(speech);
}

// Handle chat submission
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = messageInput.value.trim();

  if (!message) return;

  // Display user message
  addMessage(message, "user");

  messageInput.value = "";
  sendButton.disabled = true;
  sendButton.textContent = "Sending...";

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30000);

    let response;
    let data;

    try {
      response = await fetch("/api/chat", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          message,
          history: conversationHistory,
        }),
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("The server returned an invalid response.");
      }

      data = await response.json();
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to get AI response");
    }

    // Display AI response
    addMessage(data.reply, "bot");

    // Save both messages for the next request
    conversationHistory.push(
      {
        role: "user",
        parts: [{ text: message }],
      },
      {
        role: "model",
        parts: [{ text: data.reply }],
      }
    );

    // Keep only the latest 20 messages
    conversationHistory = conversationHistory.slice(-20);
    localStorage.setItem(
  "conversationHistory",
  JSON.stringify(conversationHistory)
);

    // Speak AI response
    speakResponse(data.reply);

  } catch (error) {
    console.error("Chat Error:", error);

    addMessage(
      "Sorry, something went wrong. Please try again.",
      "bot"
    );

  } finally {
    sendButton.disabled = false;
    sendButton.textContent = "Send";
    messageInput.focus();
  }
});
