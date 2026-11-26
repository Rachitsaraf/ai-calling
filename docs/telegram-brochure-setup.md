# Telegram brochure delivery setup

The phone agent can send the VOBPL brochure to a caller's Telegram account
after the caller links their own phone number with the Telegram bot.

## 1. Create a Telegram bot

1. In Telegram, open `@BotFather` and send `/newbot`.
2. Follow the prompts and save the bot token securely.
3. Note the bot's public username.

Never commit or share the bot token in source code or chat.

## 2. Configure Render

Add these environment variables to the Render web service:

- `TELEGRAM_BOT_TOKEN`: secret token from BotFather.
- `TELEGRAM_BOT_USERNAME`: public username, without the `@`.
- `TELEGRAM_WEBHOOK_SECRET`: a randomly generated secret used to authenticate
  Telegram webhook requests.
- `TELEGRAM_LINKS_FILE`: `/var/data/telegram-links.json`.
- `VOBPL_BROCHURE_URL`: optional; defaults to the public VOBPL brochure.

Attach a persistent disk to the service, mounted at `/var/data`. The file stores
the phone-number-to-Telegram-chat link; without persistent storage, links can be
lost when the service restarts or redeploys.

Render provides `RENDER_EXTERNAL_URL`. On startup, the app registers
`/api/telegram/webhook` with Telegram using that URL and the configured secret.

## 3. Link a caller and send the brochure

1. The caller opens the bot and sends `/start`.
2. The bot asks them to share their own phone number. The caller must use the
   Telegram contact-sharing button; forwarded contacts are not accepted.
3. The caller calls VOBPL from the same phone number and asks the agent to send
   the brochure on Telegram.
4. The bot sends the brochure to the linked Telegram chat.

The caller can send `/unlink` to remove their phone-number link.
