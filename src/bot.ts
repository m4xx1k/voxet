import { Bot } from "grammy";
import { config } from "./config.js";
import { registerVoiceHandlers } from "./handlers/voice.handler.js";
import {
  canTranscribe,
  formatRemaining,
} from "./services/rate-limiter.service.js";

const bot = new Bot(config.botToken);

// --- Commands ---
bot.command("start", (ctx) =>
  ctx.reply(
    "👋 Йоу! Я *voxt* — перетворюю бурмотіння в текст.\n\n" +
      `🔧 Режим: *${config.botMode}*\n\n` +
      (config.botMode === "mention"
        ? "Тегни мене у відповідь на голосове — я розшифрую що там бубонів людина 🗣️"
        : "Я на автоматі ловлю всі голосові та кружечки. Від мене не сховаєшся 👀") +
      "\n\nКоманди:\n" +
      "/start — знову це повідомлення (навіщо?)\n" +
      "/mode — який зараз режим\n" +
      "/limit — скільки ще можна бубоніти сьогодні",
    { parse_mode: "Markdown" },
  ),
);

bot.command("mode", (ctx) =>
  ctx.reply(`🔧 Режим: *${config.botMode}*\n\nЯкщо що — я не обирав.`, {
    parse_mode: "Markdown",
  }),
);

bot.command("limit", (ctx) => {
  const chatId = ctx.chat.id;
  const { allowed, remainingSeconds } = canTranscribe(chatId);
  const total = config.dailyLimitSeconds;
  const used = total - remainingSeconds;
  const percent = Math.round((used / total) * 100);

  const bar = "█".repeat(Math.round(percent / 5)) + "░".repeat(20 - Math.round(percent / 5));

  if (!allowed) {
    ctx.reply(
      "🚫 *Всьо, фініта ля комедія!*\n\n" +
        `[${bar}] ${percent}%\n\n` +
        "Ліміт на сьогодні вичерпано. Завтра буде новий день, нові голосові, нові розчарування 🫠",
      { parse_mode: "Markdown" },
    );
    return;
  }

  let mood: string;
  if (percent === 0) {
    mood = "Повний бак! Можеш бубоніти скільки влізе 🚀";
  } else if (percent < 25) {
    mood = "Ще купа часу, навіть не хвилюйся 😎";
  } else if (percent < 50) {
    mood = "Половина ще є. Нормально спілкуєшся 👍";
  } else if (percent < 75) {
    mood = "Хм, хтось любить поговорити... 🤨";
  } else {
    mood = "Тихіше! Ліміт скоро закінчиться! 🫣";
  }

  ctx.reply(
    `⏱ *Ліміт на сьогодні*\n\n` +
      `[${bar}] ${percent}%\n` +
      `Залишилось: *${formatRemaining(remainingSeconds)}*\n\n` +
      mood,
    { parse_mode: "Markdown" },
  );
});

// --- Voice / Video Note handlers ---
registerVoiceHandlers(bot);

// --- Error handling ---
bot.catch((err) => {
  console.error("Bot error:", err.message);
});

// --- Graceful shutdown ---
const shutdown = () => {
  console.log("🛑 Shutting down...");
  bot.stop();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

// --- Start ---
console.log(`🚀 voxt bot initializing in "${config.botMode}" mode...`);
await bot.init();
console.log(`🤖 Bot @${bot.botInfo.username} ready!`);

bot.start();
