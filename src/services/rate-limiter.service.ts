import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";

interface ChatUsage {
  /** ISO date string (YYYY-MM-DD) for the current usage period */
  date: string;
  /** Total seconds of audio transcribed today */
  usedSeconds: number;
}

type UsageData = Record<string, ChatUsage>;

/** In-memory usage map */
let usageMap: UsageData = {};

/** Load usage data from disk on startup */
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

/** Persist usage data to disk */
function save(): void {
  const dir = dirname(config.usageFilePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(config.usageFilePath, JSON.stringify(usageMap, null, 2));
}

/** Get today's date as YYYY-MM-DD */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Get or create usage entry for a chat, auto-resets on new day */
function getEntry(chatId: number): ChatUsage {
  const key = String(chatId);
  const t = today();

  if (!usageMap[key] || usageMap[key].date !== t) {
    usageMap[key] = { date: t, usedSeconds: 0 };
  }

  return usageMap[key];
}

/**
 * Check if a chat can still transcribe audio.
 */
export function canTranscribe(chatId: number): {
  allowed: boolean;
  remainingSeconds: number;
} {
  const entry = getEntry(chatId);
  const remaining = Math.max(
    0,
    config.dailyLimitSeconds - entry.usedSeconds,
  );
  return { allowed: remaining > 0, remainingSeconds: remaining };
}

/**
 * Record audio usage for a chat.
 */
export function recordUsage(chatId: number, durationSeconds: number): void {
  const entry = getEntry(chatId);
  entry.usedSeconds += durationSeconds;
  save();
}

/**
 * Format remaining seconds as a human-readable string.
 */
export function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} сек`;
  if (s === 0) return `${m} хв`;
  return `${m} хв ${s} сек`;
}

// Load data on module init
load();
