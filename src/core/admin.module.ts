import { Bot, Context } from "grammy";
import {
  listRuntimeOptions,
  resetAllRuntimeOptions,
  resetRuntimeOption,
  setRuntimeOption,
  type RuntimeOptionKey,
} from "./runtime-options.store.js";
import { config } from "./config.js";
import { texts } from "./texts.js";
import { resetTranscriptionUsage } from "../modules/transcription/transcription.store.js";
import {
  getSummaryStateStats,
  resetSummaryState,
} from "../modules/summary/summary.store.js";
import {
  resetSummaryUsageForChat,
  resetSummaryUsageForUser,
} from "../modules/summary/summary-rate-limit.store.js";

const ADMIN_COMMANDS = ["admin", "admin_set", "admin_reset"] as const;

function isAdmin(ctx: Context): boolean {
  return ctx.from?.username?.toLowerCase() === config.adminUsername.toLowerCase();
}

function ensureAdmin(ctx: Context): boolean {
  if (isAdmin(ctx)) return true;
  ctx.reply(texts.admin.onlyAdmin);
  return false;
}

function parseSetArgs(text: string | undefined): {
  key?: RuntimeOptionKey;
  value?: number;
} {
  if (!text) return {};

  const match = text.match(/^\/admin_set(?:@\w+)?\s+(\w+)\s+(-?\d+)$/i);
  if (!match) return {};

  return {
    key: match[1] as RuntimeOptionKey,
    value: Number(match[2]),
  };
}

function parseResetArgs(text: string | undefined): {
  target?: string;
  userId?: number;
} {
  if (!text) return {};

  const match = text.match(/^\/admin_reset(?:@\w+)?\s+(\w+)(?:\s+(\d+))?$/i);
  if (!match) return {};

  return {
    target: match[1],
    userId: match[2] ? Number(match[2]) : undefined,
  };
}

function renderPanel(chatId: number): string {
  const options = listRuntimeOptions()
    .map((item) => `${item.key}=${item.value}${item.overridden ? "*" : ""}`)
    .join("\n");

  const stats = getSummaryStateStats(chatId);

  return (
    `${texts.admin.panelTitle}\n\n` +
    `${texts.admin.panelRuntimeTitle}\n` +
    options +
    "\n\n" +
    `Summary buffer: ${stats.recentMessages}\n` +
    `Cached summaries: ${stats.cachedSummaries}\n` +
    `Last summarized message id: ${stats.lastSummarizedMessageId}\n\n` +
    `${texts.admin.panelCommandsTitle}\n` +
    "/admin\n" +
    "/admin_set <key> <value>\n" +
    "/admin_reset <key>\n" +
    "/admin_reset all\n" +
    "/admin_reset summary_state\n" +
    "/admin_reset summary_usage [userId]\n" +
    "/admin_reset voice_usage"
  );
}

async function onAdmin(ctx: Context): Promise<void> {
  if (!ctx.chat?.id || !ensureAdmin(ctx)) return;
  await ctx.reply(renderPanel(ctx.chat.id));
}

async function onAdminSet(ctx: Context): Promise<void> {
  if (!ensureAdmin(ctx)) return;

  const { key, value } = parseSetArgs(ctx.message?.text);
  if (!key || value === undefined) {
    await ctx.reply(texts.admin.formatSet);
    return;
  }

  const validKeys = new Set<RuntimeOptionKey>(
    listRuntimeOptions().map((item) => item.key),
  );

  if (!validKeys.has(key)) {
    await ctx.reply(texts.admin.unknownKey);
    return;
  }

  const result = setRuntimeOption(key, value);
  if (!result.ok) {
    await ctx.reply(texts.admin.setError.replace("{error}", result.error ?? "Unknown error"));
    return;
  }

  await ctx.reply(
    texts.admin.setOk
      .replace("{key}", key)
      .replace("{value}", String(result.value)),
  );
}

async function onAdminReset(ctx: Context): Promise<void> {
  if (!ctx.chat?.id || !ensureAdmin(ctx)) return;

  const { target, userId } = parseResetArgs(ctx.message?.text);
  if (!target) {
    await ctx.reply(texts.admin.formatReset);
    return;
  }

  if (target === "all") {
    resetAllRuntimeOptions();
    await ctx.reply(texts.admin.resetAllOk);
    return;
  }

  if (target === "summary_state") {
    resetSummaryState(ctx.chat.id);
    await ctx.reply(texts.admin.resetSummaryStateOk);
    return;
  }

  if (target === "summary_usage") {
    if (userId !== undefined) {
      resetSummaryUsageForUser(ctx.chat.id, userId);
      await ctx.reply(
        texts.admin.resetSummaryUsageUserOk.replace("{userId}", String(userId)),
      );
      return;
    }

    resetSummaryUsageForChat(ctx.chat.id);
    await ctx.reply(texts.admin.resetSummaryUsageChatOk);
    return;
  }

  if (target === "voice_usage") {
    resetTranscriptionUsage(ctx.chat.id);
    await ctx.reply(texts.admin.resetVoiceUsageOk);
    return;
  }

  const validKeys = new Set<RuntimeOptionKey>(
    listRuntimeOptions().map((item) => item.key),
  );

  if (validKeys.has(target as RuntimeOptionKey)) {
    resetRuntimeOption(target as RuntimeOptionKey);
    await ctx.reply(texts.admin.resetKeyOk.replace("{key}", target));
    return;
  }

  await ctx.reply(texts.admin.unknownTarget);
}

export function registerAdminModule(bot: Bot): void {
  for (const command of ADMIN_COMMANDS) {
    bot.command(command, async (ctx) => {
      if (command === "admin") {
        await onAdmin(ctx);
      } else if (command === "admin_set") {
        await onAdminSet(ctx);
      } else {
        await onAdminReset(ctx);
      }
    });
  }
}
