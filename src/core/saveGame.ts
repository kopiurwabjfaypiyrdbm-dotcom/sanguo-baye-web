import type { GameState } from './types';
import { assertValidGameState } from './validation';

export const SAVE_FORMAT = 'sanguo-baye-web';
export const SAVE_VERSION = 1;

export type SaveEnvelope = {
  format: typeof SAVE_FORMAT;
  version: typeof SAVE_VERSION;
  savedAt: string;
  label?: string;
  state: GameState;
};

export function createSaveEnvelope(
  state: GameState,
  label?: string,
  savedAt = new Date().toISOString(),
): SaveEnvelope {
  assertValidGameState(state);
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt,
    label,
    state: structuredClone(state),
  };
}

export function serializeSave(state: GameState, label?: string, savedAt?: string): string {
  return JSON.stringify(createSaveEnvelope(state, label, savedAt), null, 2);
}

export function parseSave(input: string | unknown): SaveEnvelope {
  let parsed: unknown;
  try {
    parsed = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    throw new Error('存档不是有效的 JSON');
  }

  if (!isRecord(parsed)) throw new Error('存档根节点必须是对象');

  if (parsed.format === SAVE_FORMAT) {
    if (parsed.version !== SAVE_VERSION) throw new Error(`不支持的存档版本：${String(parsed.version)}`);
    if (typeof parsed.savedAt !== 'string') throw new Error('存档缺少保存时间');
    const state = migrateGameState(parsed.state);
    assertValidGameState(state);
    return {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      savedAt: parsed.savedAt,
      label: typeof parsed.label === 'string' ? parsed.label : undefined,
      state,
    };
  }

  // Early development builds exported GameState directly. Keep that shape importable.
  if ('schemaVersion' in parsed) {
    const state = migrateGameState(parsed);
    assertValidGameState(state);
    return createSaveEnvelope(state, '迁移的旧版存档');
  }

  throw new Error('无法识别该存档格式');
}

export function migrateGameState(input: unknown): GameState {
  if (!isRecord(input)) throw new Error('存档中的游戏状态无效');
  if (input.schemaVersion === 2) return structuredClone(input) as GameState;
  if (input.schemaVersion === 1) {
    return {
      ...structuredClone(input),
      schemaVersion: 2,
      discoveredOfficerIds: Array.isArray(input.discoveredOfficerIds) ? [...input.discoveredOfficerIds] : [],
    } as GameState;
  }
  throw new Error(`不支持的游戏状态版本：${String(input.schemaVersion)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
