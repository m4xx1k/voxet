import { Bot, Context } from "grammy";
import { getRuntimeOption } from "../../core/runtime-options.store.js";
import { texts } from "../../core/texts.js";
import {
  checkAndConsumeSummaryQuota,
} from "./summary-rate-limit.store.js";
import {
  getRecentSummary,
  getSummaryInput,
  recordChatMessage,
  saveSummaryResult,
} from "./summary.store.js";
import { summarizeMessages } from "./summarizer.client.js";

const DEFAULT_SUMMARY_MESSAGES = 25;
const MIN_SUMMARY_MESSAGES = 5;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toHtmlQuote(value: string): string {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function buildCollapsedSummary(summary: string): string {
  return (
    `📌 <b>${escapeHtml(texts.summary.resultTitle)}</b>\n` +
    `<blockquote expandable>${toHtmlQuote(summary)}</blockquote>`
  );
}

async function replyCollapsedSummary(ctx: Context, summary: string): Promise<void> {
  const html = buildCollapsedSummary(summary);
  try {
    await ctx.reply(html, { parse_mode: "HTML" });
  } catch {
    await ctx.reply(summary);
  }
}

async function editCollapsedSummary(
  ctx: Context,
  chatId: number,
  messageId: number,
  summary: string,
): Promise<void> {
  const html = buildCollapsedSummary(summary);
  try {
    await ctx.api.editMessageText(chatId, messageId, html, {
      parse_mode: "HTML",
    });
  } catch {
    await ctx.api.editMessageText(chatId, messageId, summary);
  }
}

function parseSummaryLimit(commandText: string | undefined): number {
  if (!commandText) return DEFAULT_SUMMARY_MESSAGES;

  const match = commandText.match(/^\/summary(?:@\w+)?(?:\s+(\d+))?/i);
  const raw = Number(match?.[1] ?? DEFAULT_SUMMARY_MESSAGES);

  if (!Number.isFinite(raw)) return DEFAULT_SUMMARY_MESSAGES;

  const maxSummaryMessages = getRuntimeOption("maxSummaryMessages");
  return Math.max(
    MIN_SUMMARY_MESSAGES,
    Math.min(maxSummaryMessages, Math.trunc(raw)),
  );
}

function formatUserName(ctx: Context): string {
  const from = ctx.message?.from;
  if (!from) return "unknown";

  if (from.username) return `@${from.username}`;

  const fullName = [from.first_name, from.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fullName || String(from.id);
}

function extractStorableText(ctx: Context): string | null {
  const message = ctx.message;
  if (!message) return null;

  if (message.text) {
    const text = message.text.trim();
    if (!text || text.startsWith("/")) return null;
    return text;
  }

  if (message.caption) {
    const caption = message.caption.trim();
    if (!caption) return null;
    return `[caption] ${caption}`;
  }

  if (message.voice) {
    return `[voice ${message.voice.duration}s]`;
  }

  if (message.video_note) {
    return `[video_note ${message.video_note.duration}s]`;
  }

  return null;
}

function trackIncomingMessage(ctx: Context): void {
  if (!ctx.chat?.id || !ctx.message?.from || ctx.message.from.is_bot) {
    return;
  }

  const text = extractStorableText(ctx);
  if (!text) return;

  const timestamp = new Date(
    (ctx.message.date ?? Math.floor(Date.now() / 1000)) * 1000,
  );

  recordChatMessage(ctx.chat.id, {
    messageId: ctx.message.message_id,
    date: timestamp.toISOString(),
    userId: ctx.message.from.id,
    userName: formatUserName(ctx),
    text,
  });
}

async function handleSummaryCommand(ctx: Context): Promise<void> {
  if (!ctx.chat?.id || !ctx.from?.id) return;

  const limit = parseSummaryLimit(ctx.message?.text);
  const { messages, previousSummary } = getSummaryInput(ctx.chat.id, limit);

  if (messages.length === 0 && previousSummary) {
    await ctx.reply(texts.summary.noNewMessages);
    await replyCollapsedSummary(ctx, previousSummary.summary);
    return;
  }

  if (messages.length === 0) {
    const latestSummary = getRecentSummary(ctx.chat.id);
    if (latestSummary) {
      await ctx.reply(texts.summary.latestSummary);
      await replyCollapsedSummary(ctx, latestSummary.summary);
      return;
    }

    await ctx.reply(texts.summary.noMessages);
    return;
  }

  const quota = checkAndConsumeSummaryQuota(ctx.chat.id, ctx.from.id);
  if (!quota.allowed) {
    if (quota.reason === "cooldown") {
      await ctx.reply(
        texts.summary.cooldown.replace(
          "{seconds}",
          String(quota.retryAfterSeconds ?? 1),
        ),
      );
      return;
    }

    await ctx.reply(texts.summary.dailyLimit);
    return;
  }

  const status = await ctx.reply(
    texts.summary.working.replace("{count}", String(messages.length)),
  );

  try {
    const summary = await summarizeMessages({ messages, previousSummary });
    saveSummaryResult(ctx.chat.id, summary, messages);

    await editCollapsedSummary(ctx, status.chat.id, status.message_id, summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await ctx.api.editMessageText(
      status.chat.id,
      status.message_id,
      texts.summary.error.replace("{error}", message),
    );
  }
}

export function registerSummaryModule(bot: Bot): void {
  bot.on("message", async (ctx, next) => {
    trackIncomingMessage(ctx);
    await next();
  });

  bot.command("summary", async (ctx) => {
    await handleSummaryCommand(ctx);
  });
}
