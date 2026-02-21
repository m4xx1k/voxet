import OpenAI from "openai";
import { config } from "../config.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey });

/**
 * Transcribes audio using OpenAI Whisper API.
 */
export async function transcribe(
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
