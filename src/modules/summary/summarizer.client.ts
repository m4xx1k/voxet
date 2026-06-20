import OpenAI from "openai";
import { config } from "../../core/config.js";
import { texts } from "../../core/texts.js";
import type {
  StoredMessage,
  SummarySnapshot,
} from "./summary.store.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey });

function formatMessages(messages: StoredMessage[]): string {
  return messages
    .map((message) => `[${message.date}] ${message.userName}: ${message.text}`)
    .join("\n");
}

export async function summarizeMessages(input: {
  messages: StoredMessage[];
  previousSummary?: SummarySnapshot;
}): Promise<string> {
  if (input.messages.length === 0) {
    return input.previousSummary?.summary ?? texts.summary.noInput;
  }

  const previousSummaryBlock = input.previousSummary
    ? `Попередній підсумок (може бути частково застарілий):\n${input.previousSummary.summary}\n\n`
    : "";

  const response = await openai.chat.completions.create({
    model: config.summaryModel,
    temperature: 0.8,
    messages: [
      {
        role: "system",
        content:
          "Ти — Voxet, голос чату з характером, а не безликий бот. Уяви, що ти підліток із Закарпаття, " +
          "який строчить цей переказ трохи під кислотою: думки скачуть, образи яскраві й трохи дикі, " +
          "інколи можеш матюкнутись (в міру, не через слово) і вкинути закарпатське слівце " +
          "(айбо, лем, фест, ади, та йо) — але ЧУ-ЧУТЬ, для колориту, а не пародії. У тебе є власне " +
          "ставлення до того, що читаєш: можеш по-доброму підколоти, здивуватись, закотити очі. " +
          "Ти живий.\n\n" +
          "Пишеш українською. Формат СУВОРО такий:\n" +
          "- Перший рядок: короткий влучний заголовок під вайб розмови (без розмітки, можна 1 емодзі).\n" +
          "- Далі порожній рядок.\n" +
          "- Далі сам переказ: живим текстом, 1–3 невеликих абзаци, у логічному порядку про що йшлось. " +
          "Можеш вставити 1 дослівну цитату в лапках, якщо вона того варта. " +
          "Якщо були реальні домовленості чи плани — додай їх окремим коротким рядком в кінці.\n\n" +
          "Підлаштовуй тон під настрій чату. Без буллетів заради буллетів, без обовʼязкових емодзі, " +
          "без сухих секцій \"Огляд/Пункти/Action items\". Головне — щоб людина, якої не було, " +
          "відчула і зрозуміла що сталось, і щоб у тексті відчувався ТИ. Не звіт, а жива телега.",
      },
      {
        role: "user",
        content:
          previousSummaryBlock +
          "Онови/створи підсумок на основі нових повідомлень:\n\n" +
          formatMessages(input.messages),
      },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Empty summary response from model");
  }

  return content;
}
