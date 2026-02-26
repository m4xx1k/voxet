import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

export interface RuntimeOptions {
  dailyLimitSeconds: number;
  maxSummaryMessages: number;
  summaryCommandCooldownSeconds: number;
  summaryDailyLimitPerUser: number;
  summaryReuseWindowMinutes: number;
  messageBufferMaxPerChat: number;
  summaryHistoryMaxPerChat: number;
}

export type RuntimeOptionKey = keyof RuntimeOptions;

const defaults: RuntimeOptions = {
  dailyLimitSeconds: config.dailyLimitSeconds,
  maxSummaryMessages: 400,
  summaryCommandCooldownSeconds: config.summaryCommandCooldownSeconds,
  summaryDailyLimitPerUser: config.summaryDailyLimitPerUser,
  summaryReuseWindowMinutes: config.summaryReuseWindowMinutes,
  messageBufferMaxPerChat: config.messageBufferMaxPerChat,
  summaryHistoryMaxPerChat: config.summaryHistoryMaxPerChat,
};

const minValues: Record<RuntimeOptionKey, number> = {
  dailyLimitSeconds: 60,
  maxSummaryMessages: 5,
  summaryCommandCooldownSeconds: 0,
  summaryDailyLimitPerUser: 1,
  summaryReuseWindowMinutes: 1,
  messageBufferMaxPerChat: 20,
  summaryHistoryMaxPerChat: 1,
};

const maxValues: Record<RuntimeOptionKey, number> = {
  dailyLimitSeconds: 24 * 60 * 60,
  maxSummaryMessages: 400,
  summaryCommandCooldownSeconds: 600,
  summaryDailyLimitPerUser: 500,
  summaryReuseWindowMinutes: 24 * 60,
  messageBufferMaxPerChat: 5000,
  summaryHistoryMaxPerChat: 100,
};

let overrides: Partial<RuntimeOptions> = {};

function load(): void {
  try {
    if (existsSync(config.adminSettingsFilePath)) {
      const raw = readFileSync(config.adminSettingsFilePath, "utf-8");
      overrides = JSON.parse(raw) as Partial<RuntimeOptions>;
    }
  } catch {
    console.warn("⚠️ Could not read admin settings file, using defaults.");
    overrides = {};
  }
}

function save(): void {
  const dir = dirname(config.adminSettingsFilePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(config.adminSettingsFilePath, JSON.stringify(overrides, null, 2));
}

function toInt(value: number): number {
  return Math.trunc(value);
}

export function listRuntimeOptions(): Array<{
  key: RuntimeOptionKey;
  value: number;
  defaultValue: number;
  overridden: boolean;
}> {
  const merged = getRuntimeOptions();

  return (Object.keys(defaults) as RuntimeOptionKey[]).map((key) => ({
    key,
    value: merged[key],
    defaultValue: defaults[key],
    overridden: Object.prototype.hasOwnProperty.call(overrides, key),
  }));
}

export function getRuntimeOptions(): RuntimeOptions {
  return {
    ...defaults,
    ...overrides,
  };
}

export function getRuntimeOption(key: RuntimeOptionKey): number {
  return getRuntimeOptions()[key];
}

export function setRuntimeOption(key: RuntimeOptionKey, rawValue: number): {
  ok: boolean;
  value?: number;
  error?: string;
} {
  if (!Number.isFinite(rawValue)) {
    return { ok: false, error: "Invalid number" };
  }

  const value = toInt(rawValue);
  if (value < minValues[key] || value > maxValues[key]) {
    return {
      ok: false,
      error: `Out of range: ${minValues[key]}..${maxValues[key]}`,
    };
  }

  overrides[key] = value;
  save();

  return { ok: true, value };
}

export function resetRuntimeOption(key: RuntimeOptionKey): void {
  delete overrides[key];
  save();
}

export function resetAllRuntimeOptions(): void {
  overrides = {};
  save();
}

load();
