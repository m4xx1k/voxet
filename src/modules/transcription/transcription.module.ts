import { Bot, Context } from "grammy";
import { config } from "../../core/config.js";
import { getRuntimeOption } from "../../core/runtime-options.store.js";
import { texts } from "../../core/texts.js";
import { upsertTranscriptionSummaryMessage } from "../summary/summary.store.js";
import {
  canTranscribe,
  formatRemaining,
  recordUsage,
} from "./transcription.store.js";
import { transcribeAudio } from "./transcriber.client.js";

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toHtmlQuote(value: string): string {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function buildCollapsedTranscription(prefix: string, text: string): string {
  return (
    `${escapeHtml(prefix)} <b>${escapeHtml(texts.transcription.resultTitle)}</b>\n` +
    `<blockquote expandable>${toHtmlQuote(text)}</blockquote>`
  );
}

async function editTranscriptionResult(
  ctx: Context,
  chatId: number,
  messageId: number,
  text: string,
): Promise<void> {
  const prefix = pick(texts.transcription.successPrefixes);
  const collapsedMessage = buildCollapsedTranscription(prefix, text);

  try {
    await ctx.api.editMessageText(chatId, messageId, collapsedMessage, {
      parse_mode: "HTML",
    });
  } catch {
    await ctx.api.editMessageText(chatId, messageId, `${prefix} ${text}`);
  }
}

async function downloadFile(ctx: Context, fileId: string): Promise<Blob> {
  const file = await ctx.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  return await response.blob();
}

function shouldProcess(ctx: Context, botUsername: string): boolean {
  if (config.botMode === "auto") return true;
  if (ctx.chat?.type === "private") return true;

  const reply = ctx.message?.reply_to_message;
  if (reply?.from?.username === botUsername) return true;

  const text = ctx.message?.caption ?? ctx.message?.text ?? "";
  if (text.toLowerCase().includes(`@${botUsername.toLowerCase()}`)) return true;

  return false;
}

async function handleVoiceMessage(
  ctx: Context,
  fileId: string,
  targetMessageId: number,
  durationSeconds: number,
  sourceUserId?: number,
  sourceUserName?: string,
): Promise<void> {
  const chatId = ctx.chat!.id;
  const { allowed, remainingSeconds } = canTranscribe(chatId);

  if (!allowed) {
    await ctx.reply(pick(texts.transcription.limitMessages), {
      reply_parameters: { message_id: targetMessageId },
    });
    return;
  }

  if (durationSeconds > remainingSeconds) {
    await ctx.reply(pick(texts.transcription.warningMessages), {
      reply_parameters: { message_id: targetMessageId },
    });
  }

  const status = await ctx.reply(pick(texts.transcription.processingMessages), {
    reply_parameters: { message_id: targetMessageId },
  });

  try {
    const audioBuffer = await downloadFile(ctx, fileId);
    const text = await transcribeAudio(audioBuffer, "audio/ogg");

    recordUsage(chatId, durationSeconds);
    upsertTranscriptionSummaryMessage(chatId, {
      messageId: targetMessageId,
      date: new Date().toISOString(),
      userId: sourceUserId ?? (ctx.from?.id ?? 0),
      userName: sourceUserName ?? (ctx.from?.username ? `@${ctx.from.username}` : "unknown"),
      text,
    });
    await editTranscriptionResult(ctx, status.chat.id, status.message_id, text);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Transcription failed:", errorMessage);

    const funErrors = texts.transcription.errorMessages.map((template) =>
      template.replace("{error}", errorMessage),
    );

    await ctx.api.editMessageText(
      status.chat.id,
      status.message_id,
      pick(funErrors),
    );
  }
}

function registerLimitCommand(bot: Bot): void {
  bot.command("limit", (ctx) => {
    const chatId = ctx.chat.id;
    const { allowed, remainingSeconds } = canTranscribe(chatId);
    const total = getRuntimeOption("dailyLimitSeconds");
    const used = total - remainingSeconds;
    const percent = Math.round((used / total) * 100);

    const bar =
      "█".repeat(Math.round(percent / 5)) +
      "░".repeat(20 - Math.round(percent / 5));

    if (!allowed) {
      ctx.reply(
        texts.transcription.limitCard.exhaustedTitle +
          "\n\n" +
          `[${bar}] ${percent}%\n\n` +
          texts.transcription.limitCard.exhaustedBody,
        { parse_mode: "Markdown" },
      );
      return;
    }

    let mood: string;
    if (percent === 0) {
      mood = texts.transcription.limitCard.moods.full;
    } else if (percent < 25) {
      mood = texts.transcription.limitCard.moods.low;
    } else if (percent < 50) {
      mood = texts.transcription.limitCard.moods.medium;
    } else if (percent < 75) {
      mood = texts.transcription.limitCard.moods.high;
    } else {
      mood = texts.transcription.limitCard.moods.nearEnd;
    }

    ctx.reply(
      `${texts.transcription.limitCard.title}\n\n` +
        `[${bar}] ${percent}%\n` +
        `Залишилось: *${formatRemaining(remainingSeconds)}*\n\n` +
        mood,
      { parse_mode: "Markdown" },
    );
  });
}

export function registerTranscriptionModule(bot: Bot): void {
  registerLimitCommand(bot);

  bot.on("message:voice", async (ctx, next) => {
    if (shouldProcess(ctx, ctx.me.username)) {
      await handleVoiceMessage(
        ctx,
        ctx.message.voice.file_id,
        ctx.message.message_id,
        ctx.message.voice.duration,
        ctx.message.from.id,
        ctx.message.from.username
          ? `@${ctx.message.from.username}`
          : [ctx.message.from.first_name, ctx.message.from.last_name]
              .filter(Boolean)
              .join(" ")
              .trim() || String(ctx.message.from.id),
      );
    }
    await next();
  });

  bot.on("message:video_note", async (ctx, next) => {
    if (shouldProcess(ctx, ctx.me.username)) {
      await handleVoiceMessage(
        ctx,
        ctx.message.video_note.file_id,
        ctx.message.message_id,
        ctx.message.video_note.duration,
        ctx.message.from.id,
        ctx.message.from.username
          ? `@${ctx.message.from.username}`
          : [ctx.message.from.first_name, ctx.message.from.last_name]
              .filter(Boolean)
              .join(" ")
              .trim() || String(ctx.message.from.id),
      );
    }
    await next();
  });

  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text ?? "";
    const username = ctx.me.username;

    if (text.toLowerCase().includes(`@${username.toLowerCase()}`)) {
      const reply = ctx.message.reply_to_message;
      if (reply) {
        if (reply.voice) {
          await handleVoiceMessage(
            ctx,
            reply.voice.file_id,
            reply.message_id,
            reply.voice.duration,
            reply.from?.id,
            reply.from?.username
              ? `@${reply.from.username}`
              : [reply.from?.first_name, reply.from?.last_name]
                  .filter(Boolean)
                  .join(" ")
                  .trim() || (reply.from?.id ? String(reply.from.id) : "unknown"),
          );
        } else if (reply.video_note) {
          await handleVoiceMessage(
            ctx,
            reply.video_note.file_id,
            reply.message_id,
            reply.video_note.duration,
            reply.from?.id,
            reply.from?.username
              ? `@${reply.from.username}`
              : [reply.from?.first_name, reply.from?.last_name]
                  .filter(Boolean)
                  .join(" ")
                  .trim() || (reply.from?.id ? String(reply.from.id) : "unknown"),
          );
        }
      }
    }
    await next();
  });
}
