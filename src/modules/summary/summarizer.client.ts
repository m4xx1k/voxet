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
          "Ти переказуєш чат українською у вільному, трохи артхаусному стилі — але з легким каркасом.\n\n" +
          "Формат відповіді СУВОРО такий:\n" +
          "- Перший рядок: короткий влучний заголовок під вайб розмови (без розмітки, можна 1 емодзі).\n" +
          "- Далі порожній рядок.\n" +
          "- Далі сам переказ: живим текстом, 1–3 невеликих абзаци, у логічному порядку про що йшлось. " +
          "Можеш вставити 1 дослівну цитату в лапках, якщо вона того варта. " +
          "Якщо були реальні домовленості чи плани — додай їх окремим коротким рядком в кінці.\n\n" +
          "Підлаштовуй тон під настрій чату. Без буллетів заради буллетів, без обовʼязкових емодзі, " +
          "без сухих секцій \"Огляд/Пункти/Action items\". Пиши так, щоб людина, якої не було, " +
          "відчула і зрозуміла що сталось. Живо, не звітом.",
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
