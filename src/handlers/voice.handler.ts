import { Bot, Context } from "grammy";
import { config } from "../config.js";
import { transcribe } from "../services/transcribe.service.js";
import {
  canTranscribe,
  recordUsage,
  formatRemaining,
} from "../services/rate-limiter.service.js";

/** Random processing messages */
const PROCESSING_MESSAGES = [
  "⏳ Слухаю цю мудрість...",
  "🎧 Розшифровую бурмотіння...",
  "🤔 Хмм, зараз пойму що тут наговорили...",
  "📝 Конвертую звукові хвилі в букви...",
  "🔮 Ворожу по голосу...",
  "🧠 Мозок завантажується...",
  "👂 Відкрив вуха на максимум...",
  "🎵 Це точно не музика, пробую як текст...",
];

/** Random success prefixes */
const SUCCESS_PREFIXES = [
  "📝",
  "✍️",
  "🗣️ Сказано:",
  "💬",
  "🎤 Цитата:",
];

/** Random limit exhausted messages */
const LIMIT_MESSAGES = [
  "🚫 Все, тиша! Ліміт на сьогодні закінчився. Пиши текстом, як у 2005-му 📱",
  "🛑 Стоп, машина! Денний ліміт вичерпано. Завтра попробуй знову 🫡",
  "💀 Ліміт помер. Завтра воскресне. Поки що — тільки текст ✏️",
  "🫠 Ну всьо, набубонілись на сьогодні. Приходь завтра!",
  "📵 Голосовий бюджет закінчився. Економіка жорстока 💸",
];

/** Random warning messages when close to limit */
const WARNING_MESSAGES = [
  "⚠️ Увага! Це останнє — ліміт майже все. Транскрибую, але далі вже тиша...",
  "⚠️ Ого, це впритул! Лімітку майже з'їли. Пишу останнє... 🫣",
  "⚠️ Це аудіо перевищує залишок ліміту. Ну ок, як останній бонус 🎁",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Downloads a file from Telegram and returns it as a Blob.
 */
async function downloadFile(ctx: Context, fileId: string): Promise<Blob> {
  const file = await ctx.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  return await response.blob();
}

/**
 * Checks whether the bot should process this message based on the current mode.
 */
function shouldProcess(ctx: Context, botUsername: string): boolean {
  if (config.botMode === "auto") return true;

  // Always process DMs
  if (ctx.chat?.type === "private") return true;

  // Check if this is a reply to the bot's message
  const reply = ctx.message?.reply_to_message;
  if (reply?.from?.username === botUsername) return true;

  // Check if the bot is mentioned in the caption/text
  const text = ctx.message?.caption ?? ctx.message?.text ?? "";
  if (text.toLowerCase().includes(`@${botUsername.toLowerCase()}`)) return true;

  return false;
}

/**
 * Handles a voice or video_note message by downloading, transcribing, and replying.
 * Checks rate limit before proceeding.
 */
async function handleVoiceMessage(
  ctx: Context,
  fileId: string,
  targetMessageId: number,
  durationSeconds: number,
): Promise<void> {
  const chatId = ctx.chat!.id;

  // Check rate limit
  const { allowed, remainingSeconds } = canTranscribe(chatId);
  if (!allowed) {
    await ctx.reply(pick(LIMIT_MESSAGES), {
      reply_parameters: { message_id: targetMessageId },
    });
    return;
  }

  // Warn if this audio might exceed the remaining limit
  if (durationSeconds > remainingSeconds) {
    await ctx.reply(pick(WARNING_MESSAGES), {
      reply_parameters: { message_id: targetMessageId },
    });
  }

  // Send "working on it" indicator
  const status = await ctx.reply(pick(PROCESSING_MESSAGES), {
    reply_parameters: { message_id: targetMessageId },
  });

  try {
    const audioBuffer = await downloadFile(ctx, fileId);
    const text = await transcribe(audioBuffer, "audio/ogg");

    // Record usage after successful transcription
    recordUsage(chatId, durationSeconds);

    // Edit the status message with the result
    await ctx.api.editMessageText(
      status.chat.id,
      status.message_id,
      `${pick(SUCCESS_PREFIXES)} ${text}`,
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Transcription failed:", errorMessage);

    const funErrors = [
      `😵 Щось пішло не так: ${errorMessage}`,
      `🤯 Мій мозок зламався: ${errorMessage}`,
      `💥 Ой, тут помилка: ${errorMessage}`,
    ];

    await ctx.api.editMessageText(
      status.chat.id,
      status.message_id,
      pick(funErrors),
    );
  }
}

/**
 * Registers voice and video_note handlers on the bot.
 */
export function registerVoiceHandlers(bot: Bot): void {
  // Handle voice messages (direct or with mention in caption)
  bot.on("message:voice", async (ctx) => {
    if (shouldProcess(ctx, ctx.me.username)) {
      await handleVoiceMessage(
        ctx,
        ctx.message.voice.file_id,
        ctx.message.message_id,
        ctx.message.voice.duration,
      );
    }
  });

  // Handle video notes (circles / кружечки)
  bot.on("message:video_note", async (ctx) => {
    if (shouldProcess(ctx, ctx.me.username)) {
      await handleVoiceMessage(
        ctx,
        ctx.message.video_note.file_id,
        ctx.message.message_id,
        ctx.message.video_note.duration,
      );
    }
  });

  // Handle replies to voice/video messages with bot mention
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text ?? "";
    const username = ctx.me.username;

    // Check if bot is mentioned
    if (text.toLowerCase().includes(`@${username.toLowerCase()}`)) {
      const reply = ctx.message.reply_to_message;
      if (reply) {
        if (reply.voice) {
          await handleVoiceMessage(
            ctx,
            reply.voice.file_id,
            reply.message_id,
            reply.voice.duration,
          );
        } else if (reply.video_note) {
          await handleVoiceMessage(
            ctx,
            reply.video_note.file_id,
            reply.message_id,
            reply.video_note.duration,
          );
        }
      }
    }
  });
}
