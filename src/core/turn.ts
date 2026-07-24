import { applyMonthlyGrowth } from './economy';
import { runAiRound } from './ai';
import { appendLogs } from './logs';
import type { GameState } from './types';
import { assertValidGameState } from './validation';

export function advanceCalendar(calendar: GameState['calendar']): GameState['calendar'] {
  return calendar.month === 12
    ? { year: calendar.year + 1, month: 1 }
    : { year: calendar.year, month: calendar.month + 1 };
}

export function beginAiPhase(state: GameState): GameState {
  if (state.phase !== 'player') throw new Error('Only the player phase can be ended');
  const firstAiFactionId = state.factionOrder.find((factionId) => factionId !== state.playerFactionId);
  if (!firstAiFactionId) return finishTurn({ ...state, phase: 'ai' });

  const next: GameState = { ...state, phase: 'ai', activeFactionId: firstAiFactionId };
  return appendLogs(next, 'turn', ['玩家阶段结束，进入 AI 阶段。']);
}

export function finishTurn(state: GameState): GameState {
  if (state.phase !== 'ai') throw new Error('The turn can only finish after the AI phase');
  const grown = applyMonthlyGrowth(state);
  const next: GameState = {
    ...grown,
    turn: state.turn + 1,
    calendar: advanceCalendar(state.calendar),
    phase: 'player',
    activeFactionId: state.playerFactionId,
  };
  const withLog = appendLogs(next, 'turn', [`进入 ${next.calendar.year} 年 ${next.calendar.month} 月。`]);
  assertValidGameState(withLog);
  return withLog;
}

export function advanceTurn(state: GameState): GameState {
  const aiState = beginAiPhase(state);
  if (aiState.phase !== 'ai') return aiState;
  return finishTurn(runAiRound(aiState));
}
