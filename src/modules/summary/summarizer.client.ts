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
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You summarize chat history updates. Keep response concise, factual, and in Ukrainian. Include: 1) short overview, 2) key points as bullets, 3) action items if any.",
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
