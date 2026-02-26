import "dotenv/config";

export const config = {
  /** Telegram bot token from @BotFather */
  botToken: requireEnv("BOT_TOKEN"),

  /** OpenAI API key for Whisper */
  openaiApiKey: requireEnv("OPENAI_API_KEY"),

  /** "auto" — transcribe everything, "mention" — only when mentioned/replied */
  botMode: (process.env.BOT_MODE ?? "mention") as "auto" | "mention",

  /** Max transcription seconds per chat per day (default: 3600 = 1 hour) */
  dailyLimitSeconds: Number(process.env.DAILY_LIMIT_SECONDS ?? "3600"),

  /** Path to usage JSON file (default: ./data/usage.json) */
  usageFilePath: process.env.USAGE_FILE_PATH ?? "./data/usage.json",

  /** Path to message history JSON file (default: ./data/message-history.json) */
  messageHistoryFilePath:
    process.env.MESSAGE_HISTORY_FILE_PATH ?? "./data/message-history.json",

  /** Path to /summary usage JSON file (default: ./data/summary-usage.json) */
  summaryUsageFilePath:
    process.env.SUMMARY_USAGE_FILE_PATH ?? "./data/summary-usage.json",

  /** Path to admin runtime settings JSON file (default: ./data/admin-settings.json) */
  adminSettingsFilePath:
    process.env.ADMIN_SETTINGS_FILE_PATH ?? "./data/admin-settings.json",

  /** Telegram username allowed to use admin commands */
  adminUsername: (process.env.ADMIN_USERNAME ?? "m4xx1k").replace(/^@/, ""),

  /** Max unsummarized message buffer per chat */
  messageBufferMaxPerChat: Number(process.env.MESSAGE_BUFFER_MAX_PER_CHAT ?? "500"),

  /** Max number of cached summaries per chat */
  summaryHistoryMaxPerChat: Number(process.env.SUMMARY_HISTORY_MAX_PER_CHAT ?? "12"),

  /** If latest summary is newer than this, it can be reused as context */
  summaryReuseWindowMinutes: Number(process.env.SUMMARY_REUSE_WINDOW_MINUTES ?? "30"),

  /** Cooldown between /summary calls per user in same chat */
  summaryCommandCooldownSeconds: Number(process.env.SUMMARY_COOLDOWN_SECONDS ?? "20"),

  /** Max /summary calls per user per chat per day */
  summaryDailyLimitPerUser: Number(process.env.SUMMARY_DAILY_LIMIT_PER_USER ?? "30"),

  /** Model used for /summary */
  summaryModel: process.env.SUMMARY_MODEL ?? "gpt-4o-mini",
} as const;

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
