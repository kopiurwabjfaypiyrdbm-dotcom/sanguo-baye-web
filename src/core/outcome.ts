import { appendLogs } from './logs';
import type { GameState } from './types';

export function evaluateOutcome(state: GameState): GameState {
  if (state.phase === 'ended') return state;
  const playerHasCity = Object.values(state.cities).some((city) => city.ownerId === state.playerFactionId);
  if (!playerHasCity) {
    return appendLogs(
      { ...state, campaignStarted: true, phase: 'ended', activeFactionId: state.playerFactionId, outcome: 'defeat' },
      'system',
      ['我方已失去全部城池，战役失败。'],
    );
  }

  const enemyHasCity = Object.values(state.cities).some((city) => {
    const faction = state.factions[city.ownerId];
    return city.ownerId !== state.playerFactionId && faction && !faction.isNeutral;
  });
  if (!enemyHasCity) {
    return appendLogs(
      { ...state, campaignStarted: true, phase: 'ended', activeFactionId: state.playerFactionId, outcome: 'victory' },
      'system',
      ['天下再无敌对诸侯，战役胜利。'],
    );
  }
  return state;
}
