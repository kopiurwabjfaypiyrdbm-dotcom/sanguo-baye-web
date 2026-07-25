import type { GameLog, GameState, LogKind } from './types';

export function appendLogs(state: GameState, kind: LogKind, messages: string[]): GameState {
  if (messages.length === 0) return state;

  const usedIds = new Set(state.logs.map((log) => log.id));
  let serial = state.logs.length + 1;
  const logs: GameLog[] = messages.map((message) => {
    let id = `log-${state.turn}-${String(serial).padStart(3, '0')}`;
    while (usedIds.has(id)) {
      serial += 1;
      id = `log-${state.turn}-${String(serial).padStart(3, '0')}`;
    }
    usedIds.add(id);
    serial += 1;
    return { id, kind, message, turn: state.turn };
  });

  return { ...state, logs: [...state.logs, ...logs] };
}
