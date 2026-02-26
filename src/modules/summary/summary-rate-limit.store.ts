import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../../core/config.js";
import { getRuntimeOption } from "../../core/runtime-options.store.js";

interface SummaryUsageEntry {
  date: string;
  count: number;
  lastRequestAt: number;
}

type SummaryUsageData = Record<string, SummaryUsageEntry>;

let usageMap: SummaryUsageData = {};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function usageKey(chatId: number, userId: number): string {
  return `${chatId}:${userId}`;
}

function load(): void {
  try {
    if (existsSync(config.summaryUsageFilePath)) {
      const raw = readFileSync(config.summaryUsageFilePath, "utf-8");
      usageMap = JSON.parse(raw) as SummaryUsageData;
    }
  } catch {
    console.warn("⚠️ Could not read summary usage file, starting fresh.");
    usageMap = {};
  }
}

function save(): void {
  const dir = dirname(config.summaryUsageFilePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(config.summaryUsageFilePath, JSON.stringify(usageMap, null, 2));
}

function getEntry(chatId: number, userId: number): SummaryUsageEntry {
  const key = usageKey(chatId, userId);
  const t = today();

  if (!usageMap[key] || usageMap[key].date !== t) {
    usageMap[key] = {
      date: t,
      count: 0,
      lastRequestAt: 0,
    };
  }

  return usageMap[key];
}

export function checkAndConsumeSummaryQuota(chatId: number, userId: number): {
  allowed: boolean;
  reason?: "cooldown" | "daily_limit";
  retryAfterSeconds?: number;
} {
  const entry = getEntry(chatId, userId);
  const now = Date.now();
  const summaryCommandCooldownSeconds = getRuntimeOption("summaryCommandCooldownSeconds");
  const summaryDailyLimitPerUser = getRuntimeOption("summaryDailyLimitPerUser");
  const cooldownMs = summaryCommandCooldownSeconds * 1000;

  if (entry.lastRequestAt > 0 && now - entry.lastRequestAt < cooldownMs) {
    const retryAfterSeconds = Math.ceil((cooldownMs - (now - entry.lastRequestAt)) / 1000);
    return {
      allowed: false,
      reason: "cooldown",
      retryAfterSeconds,
    };
  }

  if (entry.count >= summaryDailyLimitPerUser) {
    return {
      allowed: false,
      reason: "daily_limit",
    };
  }

  entry.count += 1;
  entry.lastRequestAt = now;
  save();

  return { allowed: true };
}

export function resetSummaryUsageForChat(chatId: number): void {
  const prefix = `${chatId}:`;
  for (const key of Object.keys(usageMap)) {
    if (key.startsWith(prefix)) {
      delete usageMap[key];
    }
  }
  save();
}

export function resetSummaryUsageForUser(chatId: number, userId: number): void {
  delete usageMap[usageKey(chatId, userId)];
  save();
}

load();
