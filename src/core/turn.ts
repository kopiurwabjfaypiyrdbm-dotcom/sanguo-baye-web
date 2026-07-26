import { applyMonthlyGrowth } from './economy';
import { runAiFactionTurnUntilPlayerDefense, runAiRound } from './ai';
import { appendLogs } from './logs';
import type { AttackOrder } from './battle';
import type { GameState } from './types';
import { assertValidGameState } from './validation';
import { updateCitySatraps } from './administration';
import { evaluateOutcome } from './outcome';
import { advanceStrategicOrders } from './strategicOrders';
import { settleCityEvents } from './cityEvents';
import { settleAnnualProgression } from './annualProgression';

export type InteractiveTurnProgress = {
  state: GameState;
  completed: boolean;
  pendingPlayerDefense?: {
    order: AttackOrder;
    nextFactionIndex: number;
  };
};

export function advanceCalendar(calendar: GameState['calendar']): GameState['calendar'] {
  return calendar.month === 12
    ? { year: calendar.year + 1, month: 1 }
    : { year: calendar.year, month: calendar.month + 1 };
}

export function beginAiPhase(state: GameState): GameState {
  if (state.phase !== 'player') throw new Error('Only the player phase can be ended');
  const firstAiFactionId = state.factionOrder.find((factionId) => factionId !== state.playerFactionId);
  if (!firstAiFactionId) return finishTurn({ ...state, campaignStarted: true, phase: 'ai' });

  const next: GameState = { ...state, campaignStarted: true, phase: 'ai', activeFactionId: firstAiFactionId };
  return appendLogs(next, 'turn', ['玩家阶段结束，进入 AI 阶段。']);
}

export function finishTurn(state: GameState): GameState {
  if (state.phase === 'ended') return state;
  if (state.phase !== 'ai') throw new Error('The turn can only finish after the AI phase');
  const nextCalendar = advanceCalendar(state.calendar);
  const settling: GameState = {
    ...state,
    turn: state.turn + 1,
    calendar: nextCalendar,
    phase: 'player',
    activeFactionId: state.playerFactionId,
    actedOfficerIds: [],
  };
  const afterOrders = advanceStrategicOrders(settling, { deferValidation: true });
  const afterAnnualProgression = settleAnnualProgression(afterOrders, state.calendar);
  const grown = applyMonthlyGrowth(afterAnnualProgression);
  const afterEvents = settleCityEvents(grown);
  const next = evaluateOutcome(updateCitySatraps(afterEvents));
  const withLog = appendLogs(next, 'turn', [`进入 ${next.calendar.year} 年 ${next.calendar.month} 月。`]);
  assertValidGameState(withLog);
  return withLog;
}

export function advanceTurn(state: GameState): GameState {
  const aiState = beginAiPhase(state);
  if (aiState.phase !== 'ai') return aiState;
  const afterAi = runAiRound(aiState);
  return afterAi.phase === 'ended' ? afterAi : finishTurn(afterAi);
}

export function advanceTurnUntilPlayerDefense(state: GameState): InteractiveTurnProgress {
  const aiState = beginAiPhase(state);
  if (aiState.phase !== 'ai') return { state: aiState, completed: true };
  return continueTurnUntilPlayerDefense(aiState, 0);
}

export function continueTurnUntilPlayerDefense(
  state: GameState,
  startFactionIndex: number,
): InteractiveTurnProgress {
  if (state.phase === 'ended') return { state, completed: true };
  if (state.phase !== 'ai') throw new Error('Interactive AI continuation requires the AI phase');
  let next = state;
  for (let index = startFactionIndex; index < state.factionOrder.length; index += 1) {
    const factionId = state.factionOrder[index];
    if (factionId === state.playerFactionId) continue;
    next = { ...next, activeFactionId: factionId };
    const progress = runAiFactionTurnUntilPlayerDefense(next);
    next = progress.state;
    if (next.phase === 'ended') return { state: next, completed: true };
    if (progress.pendingPlayerDefense) {
      return {
        state: next,
        completed: false,
        pendingPlayerDefense: {
          order: progress.pendingPlayerDefense,
          nextFactionIndex: index + 1,
        },
      };
    }
  }
  return { state: finishTurn(next), completed: true };
}
