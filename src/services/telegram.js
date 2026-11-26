import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const TELEGRAM_API = "https://api.telegram.org";
const DEFAULT_BROCHURE_URL =
  "https://drive.google.com/uc?export=download&id=1nnxUNPyCsm6dBpfl7kXjyWLp6SCv6JXL";

let phoneLinksPromise;
let writes = Promise.resolve();

function linksFilePath() {
  return (
    process.env.TELEGRAM_LINKS_FILE ||
    path.resolve(".data", "telegram-links.json")
  );
}

function normalizePhoneNumber(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  let digits = String(value).replace(/\D/g, "");

  if (digits.length === 10) {
    digits = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = `91${digits.slice(1)}`;
  }

  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

async function loadPhoneLinks() {
  if (!phoneLinksPromise) {
    phoneLinksPromise = readFile(linksFilePath(), "utf8")
      .then((contents) => {
        const parsed = JSON.parse(contents);

        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Telegram phone-link store has an invalid format.");
        }

        return new Map(
          Object.entries(parsed).map(([phone, chatId]) => [
            phone,
            String(chatId),
          ])
        );
      })
      .catch((error) => {
        if (error.code === "ENOENT") {
          return new Map();
        }

        throw error;
      });
  }

  return phoneLinksPromise;
}

function savePhoneLinks(links) {
  const filePath = linksFilePath();
  const contents = JSON.stringify(Object.fromEntries(links), null, 2);

  const nextWrite = writes.catch(() => {}).then(async () => {
    await mkdir(path.dirname(filePath), { recursive: true });

    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, filePath);
  });

  writes = nextWrite;
  return nextWrite;
}

async function telegramRequest(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }

  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error(`Telegram ${method} returned invalid JSON.`, {
      cause: error,
    });
  }

  if (!response.ok || !result.ok) {
    throw new Error(
      `Telegram ${method} failed: ${result.description || response.statusText}`
    );
  }

  return result.result;
}

async function sendTelegramMessage(chatId, text, replyMarkup) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function unlinkTelegramChat(chatId) {
  const links = await loadPhoneLinks();
  let removed = false;

  for (const [phone, linkedChatId] of links) {
    if (linkedChatId === String(chatId)) {
      links.delete(phone);
      removed = true;
    }
  }

  if (removed) {
    await savePhoneLinks(links);
  }

  return removed;
}

export function isValidTelegramWebhookSecret(receivedSecret) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (
    typeof receivedSecret !== "string" ||
    !expectedSecret ||
    receivedSecret.length !== expectedSecret.length
  ) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(receivedSecret),
    Buffer.from(expectedSecret)
  );
}

export async function registerTelegramWebhook(baseUrl) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return false;
  }

  if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET is not configured.");
  }

  if (!baseUrl) {
    throw new Error(
      "Set RENDER_EXTERNAL_URL or PUBLIC_BASE_URL to register the Telegram webhook."
    );
  }

  const webhookUrl = new URL("/api/telegram/webhook", baseUrl).toString();

  await telegramRequest("setWebhook", {
    url: webhookUrl,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"],
  });

  return true;
}

export async function handleTelegramUpdate(update) {
  const message = update?.message;
  const chatId = message?.chat?.id;

  if (chatId === undefined || chatId === null) {
    return;
  }

  const text = typeof message.text === "string" ? message.text.trim() : "";

  if (text.startsWith("/start")) {
    await sendTelegramMessage(
      chatId,
      "To receive a VOBPL brochure requested during a phone call, share your own phone number below. We use it only to match your Telegram account with your call and send the requested document.",
      {
        keyboard: [
          [{ text: "Share my phone number", request_contact: true }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      }
    );
    return;
  }

  if (text.startsWith("/unlink")) {
    const removed = await unlinkTelegramChat(chatId);
    await sendTelegramMessage(
      chatId,
      removed
        ? "Your phone number has been unlinked from this Telegram account."
        : "There is no phone number linked to this Telegram account."
    );
    return;
  }

  if (!message.contact) {
    return;
  }

  if (
    message.from?.id === undefined ||
    message.contact.user_id === undefined ||
    String(message.contact.user_id) !== String(message.from.id)
  ) {
    await sendTelegramMessage(
      chatId,
      "Please use the Share my phone number button to share your own contact."
    );
    return;
  }

  const phone = normalizePhoneNumber(message.contact.phone_number);
  if (!phone) {
    await sendTelegramMessage(
      chatId,
      "I couldn't read that phone number. Please try sharing your own contact again."
    );
    return;
  }

  const links = await loadPhoneLinks();
  links.set(phone, String(chatId));
  await savePhoneLinks(links);

  await sendTelegramMessage(
    chatId,
    "Your phone number is linked. During your call, ask the VOBPL assistant to send the company brochure on Telegram.",
    { remove_keyboard: true }
  );
}

export async function sendCompanyBrochureToCaller(phoneNumber) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return { status: "not_configured" };
  }

  const phone = normalizePhoneNumber(phoneNumber);
  if (!phone) {
    return { status: "caller_number_unavailable" };
  }

  const links = await loadPhoneLinks();
  const chatId = links.get(phone);

  if (!chatId) {
    return {
      status: "needs_linking",
      botUsername: process.env.TELEGRAM_BOT_USERNAME || null,
    };
  }

  await telegramRequest("sendDocument", {
    chat_id: chatId,
    document: process.env.VOBPL_BROCHURE_URL || DEFAULT_BROCHURE_URL,
    caption: "Vyankatesh Oxides and Batteries Pvt. Ltd. — Company Brochure",
  });

  return { status: "sent" };
}
