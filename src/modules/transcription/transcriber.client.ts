import OpenAI from "openai";
import { config } from "../../core/config.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey });

export async function transcribeAudio(
  audioBuffer: Blob,
  mimeType: string,
): Promise<string> {
  const file = new File([audioBuffer], "audio.ogg", { type: mimeType });
  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return result.text;
}
