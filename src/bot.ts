import { Bot } from "grammy";
import { config } from "./core/config.js";
import { texts } from "./core/texts.js";
import { registerAdminModule } from "./core/admin.module.js";
import { registerSummaryModule } from "./modules/summary/summary.module.js";
import { registerTranscriptionModule } from "./modules/transcription/transcription.module.js";

const bot = new Bot(config.botToken);

bot.command("start", (ctx) =>
  ctx.reply(
    texts.bot.start.intro +
      "\n\n" +
      texts.bot.start.modeLine.replace("{mode}", config.botMode) +
      "\n\n" +
      (config.botMode === "mention"
        ? texts.bot.start.mentionModeHint
        : texts.bot.start.autoModeHint) +
      "\n\n" +
      texts.bot.start.commandsTitle +
      "\n" +
      texts.bot.start.commandStart +
      "\n" +
      texts.bot.start.commandMode +
      "\n" +
      texts.bot.start.commandLimit +
      "\n" +
      texts.bot.start.commandSummary,
    { parse_mode: "Markdown" },
  ),
);

bot.command("mode", (ctx) =>
  ctx.reply(texts.bot.mode.replace("{mode}", config.botMode), {
    parse_mode: "Markdown",
  }),
);

registerTranscriptionModule(bot);
registerSummaryModule(bot);
registerAdminModule(bot);

bot.catch((err) => {
  console.error("Bot error:", err.message);
});

const shutdown = () => {
  console.log("🛑 Shutting down...");
  bot.stop();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

console.log(`🚀 voxt bot initializing in "${config.botMode}" mode...`);
await bot.init();
console.log(`🤖 Bot @${bot.botInfo.username} ready!`);

bot.start();
