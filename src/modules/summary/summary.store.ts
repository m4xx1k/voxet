import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../../core/config.js";
import { getRuntimeOption } from "../../core/runtime-options.store.js";

export interface StoredMessage {
  messageId: number;
  date: string;
  userId: number;
  userName: string;
  text: string;
}

export interface SummarySnapshot {
  createdAt: string;
  uptoMessageId: number;
  messageCount: number;
  summary: string;
}

interface ChatSummaryState {
  recentMessages: StoredMessage[];
  summaries: SummarySnapshot[];
  lastSummarizedMessageId: number;
}

type SummaryStateMap = Record<string, ChatSummaryState>;

let stateMap: SummaryStateMap = {};

function normalizeStoredMessage(raw: unknown): StoredMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<StoredMessage>;

  if (
    typeof item.messageId !== "number" ||
    typeof item.date !== "string" ||
    typeof item.userId !== "number" ||
    typeof item.userName !== "string" ||
    typeof item.text !== "string"
  ) {
    return null;
  }

  return item as StoredMessage;
}

function normalizeSnapshot(raw: unknown): SummarySnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<SummarySnapshot>;

  if (
    typeof item.createdAt !== "string" ||
    typeof item.uptoMessageId !== "number" ||
    typeof item.messageCount !== "number" ||
    typeof item.summary !== "string"
  ) {
    return null;
  }

  return item as SummarySnapshot;
}

function normalizeChatState(raw: unknown): ChatSummaryState {
  if (Array.isArray(raw)) {
    const recentMessages = raw
      .map((item) => normalizeStoredMessage(item))
      .filter((item): item is StoredMessage => item !== null);

    return {
      recentMessages,
      summaries: [],
      lastSummarizedMessageId: 0,
    };
  }

  if (!raw || typeof raw !== "object") {
    return {
      recentMessages: [],
      summaries: [],
      lastSummarizedMessageId: 0,
    };
  }

  const candidate = raw as {
    recentMessages?: unknown[];
    summaries?: unknown[];
    lastSummarizedMessageId?: number;
  };

  const recentMessages = (candidate.recentMessages ?? [])
    .map((item) => normalizeStoredMessage(item))
    .filter((item): item is StoredMessage => item !== null);

  const summaries = (candidate.summaries ?? [])
    .map((item) => normalizeSnapshot(item))
    .filter((item): item is SummarySnapshot => item !== null);

  return {
    recentMessages,
    summaries,
    lastSummarizedMessageId:
      typeof candidate.lastSummarizedMessageId === "number"
        ? candidate.lastSummarizedMessageId
        : 0,
  };
}

function normalizeStateMap(raw: unknown): SummaryStateMap {
  if (!raw || typeof raw !== "object") return {};

  const out: SummaryStateMap = {};
  for (const [chatId, value] of Object.entries(raw)) {
    out[chatId] = normalizeChatState(value);
  }
  return out;
}

function getState(chatId: number): ChatSummaryState {
  const key = String(chatId);

  stateMap[key] = normalizeChatState(stateMap[key]);

  return stateMap[key];
}

function load(): void {
  try {
    if (existsSync(config.messageHistoryFilePath)) {
      const raw = readFileSync(config.messageHistoryFilePath, "utf-8");
      stateMap = normalizeStateMap(JSON.parse(raw));
    }
  } catch {
    console.warn("⚠️ Could not read message history file, starting fresh.");
    stateMap = {};
  }
}

function save(): void {
  const dir = dirname(config.messageHistoryFilePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(config.messageHistoryFilePath, JSON.stringify(stateMap, null, 2));
}

function trimBuffer(state: ChatSummaryState): void {
  const messageBufferMaxPerChat = getRuntimeOption("messageBufferMaxPerChat");
  if (state.recentMessages.length > messageBufferMaxPerChat) {
    state.recentMessages = state.recentMessages.slice(
      state.recentMessages.length - messageBufferMaxPerChat,
    );
  }
}

export function recordChatMessage(chatId: number, message: StoredMessage): void {
  const state = getState(chatId);
  state.recentMessages.push(message);
  trimBuffer(state);
  save();
}

export function upsertTranscriptionSummaryMessage(
  chatId: number,
  message: StoredMessage,
): void {
  const state = getState(chatId);
  const index = state.recentMessages.findIndex(
    (item) => item.messageId === message.messageId,
  );

  if (index >= 0) {
    state.recentMessages[index] = message;
  } else {
    state.recentMessages.push(message);
  }

  trimBuffer(state);
  save();
}

export function getSummaryInput(chatId: number, limit: number): {
  messages: StoredMessage[];
  previousSummary?: SummarySnapshot;
} {
  const state = getState(chatId);

  const unsummarized = state.recentMessages.filter(
    (message) => message.messageId > state.lastSummarizedMessageId,
  );

  const messages = limit > 0 ? unsummarized.slice(-limit) : [];

  return {
    messages,
    previousSummary: getRecentSummary(chatId),
  };
}

export function getRecentSummary(chatId: number): SummarySnapshot | undefined {
  const state = getState(chatId);
  const latest = state.summaries[state.summaries.length - 1];
  if (!latest) return undefined;

  const ageMs = Date.now() - new Date(latest.createdAt).getTime();
  const maxAgeMs = getRuntimeOption("summaryReuseWindowMinutes") * 60 * 1000;

  return ageMs <= maxAgeMs ? latest : undefined;
}

export function saveSummaryResult(
  chatId: number,
  summary: string,
  consumedMessages: StoredMessage[],
): void {
  const state = getState(chatId);

  const uptoMessageId = consumedMessages.reduce(
    (max, item) => Math.max(max, item.messageId),
    state.lastSummarizedMessageId,
  );

  state.summaries.push({
    createdAt: new Date().toISOString(),
    uptoMessageId,
    messageCount: consumedMessages.length,
    summary,
  });

  const summaryHistoryMaxPerChat = getRuntimeOption("summaryHistoryMaxPerChat");
  if (state.summaries.length > summaryHistoryMaxPerChat) {
    state.summaries = state.summaries.slice(
      state.summaries.length - summaryHistoryMaxPerChat,
    );
  }

  state.lastSummarizedMessageId = uptoMessageId;
  state.recentMessages = state.recentMessages.filter(
    (message) => message.messageId > state.lastSummarizedMessageId,
  );

  save();
}

export function resetSummaryState(chatId: number): void {
  delete stateMap[String(chatId)];
  save();
}

export function getSummaryStateStats(chatId: number): {
  recentMessages: number;
  cachedSummaries: number;
  lastSummarizedMessageId: number;
} {
  const state = getState(chatId);
  return {
    recentMessages: state.recentMessages.length,
    cachedSummaries: state.summaries.length,
    lastSummarizedMessageId: state.lastSummarizedMessageId,
  };
}

load();
