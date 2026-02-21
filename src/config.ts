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
} as const;

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
