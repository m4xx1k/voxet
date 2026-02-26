import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../../core/config.js";
import { getRuntimeOption } from "../../core/runtime-options.store.js";

interface ChatUsage {
  date: string;
  usedSeconds: number;
}

type UsageData = Record<string, ChatUsage>;

let usageMap: UsageData = {};

function load(): void {
  try {
    if (existsSync(config.usageFilePath)) {
      const raw = readFileSync(config.usageFilePath, "utf-8");
      usageMap = JSON.parse(raw);
    }
  } catch {
    console.warn("⚠️ Could not read usage file, starting fresh.");
    usageMap = {};
  }
}

function save(): void {
  const dir = dirname(config.usageFilePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(config.usageFilePath, JSON.stringify(usageMap, null, 2));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function getEntry(chatId: number): ChatUsage {
  const key = String(chatId);
  const t = today();

  if (!usageMap[key] || usageMap[key].date !== t) {
    usageMap[key] = { date: t, usedSeconds: 0 };
  }

  return usageMap[key];
}

export function canTranscribe(chatId: number): {
  allowed: boolean;
  remainingSeconds: number;
} {
  const entry = getEntry(chatId);
  const dailyLimitSeconds = getRuntimeOption("dailyLimitSeconds");
  const remaining = Math.max(0, dailyLimitSeconds - entry.usedSeconds);
  return { allowed: remaining > 0, remainingSeconds: remaining };
}

export function recordUsage(chatId: number, durationSeconds: number): void {
  const entry = getEntry(chatId);
  entry.usedSeconds += durationSeconds;
  save();
}

export function resetTranscriptionUsage(chatId: number): void {
  delete usageMap[String(chatId)];
  save();
}

export function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} сек`;
  if (s === 0) return `${m} хв`;
  return `${m} хв ${s} сек`;
}

load();
