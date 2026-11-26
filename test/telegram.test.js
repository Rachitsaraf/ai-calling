import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const temporaryDirectory = await mkdtemp(
  path.join(os.tmpdir(), "vobpl-telegram-test-")
);

process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";
process.env.TELEGRAM_BOT_USERNAME = "test_vobpl_bot";
process.env.TELEGRAM_LINKS_FILE = path.join(
  temporaryDirectory,
  "telegram-links.json"
);

const originalFetch = globalThis.fetch;
const telegramRequests = [];

globalThis.fetch = async (url, options) => {
  telegramRequests.push({
    url: String(url),
    body: JSON.parse(options.body),
  });

  return {
    ok: true,
    statusText: "OK",
    json: async () => ({ ok: true, result: { message_id: 1 } }),
  };
};

const {
  handleTelegramUpdate,
  isValidTelegramWebhookSecret,
  sendCompanyBrochureToCaller,
} = await import("../src/services/telegram.js");

after(async () => {
  globalThis.fetch = originalFetch;
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test("sends the brochure only to a caller who shared their own linked phone", async () => {
  await handleTelegramUpdate({
    message: {
      chat: { id: 12345 },
      from: { id: 12345 },
      text: "/start",
    },
  });

  await handleTelegramUpdate({
    message: {
      chat: { id: 12345 },
      from: { id: 12345 },
      contact: {
        phone_number: "+91 98930 21560",
        user_id: 12345,
      },
    },
  });

  const delivery = await sendCompanyBrochureToCaller("9893021560");

  assert.deepEqual(delivery, { status: "sent" });
  assert.equal(telegramRequests.at(-1).url.endsWith("/sendDocument"), true);
  assert.equal(telegramRequests.at(-1).body.chat_id, "12345");
  assert.match(telegramRequests.at(-1).body.document, /^https:\/\/drive\.google\.com\//);

  await handleTelegramUpdate({
    message: {
      chat: { id: 99999 },
      from: { id: 99999 },
      contact: {
        phone_number: "+91 98765 43210",
        user_id: 12345,
      },
    },
  });

  assert.deepEqual(
    await sendCompanyBrochureToCaller("+91 98765 43210"),
    { status: "needs_linking", botUsername: "test_vobpl_bot" }
  );
});

test("validates Telegram webhook secret without accepting mismatches", () => {
  assert.equal(
    isValidTelegramWebhookSecret("test-webhook-secret"),
    true
  );
  assert.equal(isValidTelegramWebhookSecret("wrong-secret"), false);
});
