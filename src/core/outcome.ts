import { appendLogs } from './logs';
import type { GameState } from './types';
import { releaseLandlessFactionOfficers } from './administration';

export function evaluateOutcome(state: GameState): GameState {
  if (state.phase === 'ended') return state;
  const normalized = releaseLandlessFactionOfficers(state);
  const playerHasCity = Object.values(normalized.cities).some((city) => city.ownerId === normalized.playerFactionId);
  if (!playerHasCity) {
    return appendLogs(
      { ...normalized, campaignStarted: true, phase: 'ended', activeFactionId: normalized.playerFactionId, outcome: 'defeat' },
      'system',
      ['我方已失去全部城池，战役失败。'],
    );
  }

  const enemyHasCity = Object.values(normalized.cities).some((city) => {
    const faction = normalized.factions[city.ownerId];
    return city.ownerId !== normalized.playerFactionId && faction && !faction.isNeutral;
  });
  if (!enemyHasCity) {
    return appendLogs(
      { ...normalized, campaignStarted: true, phase: 'ended', activeFactionId: normalized.playerFactionId, outcome: 'victory' },
      'system',
      ['天下再无敌对诸侯，战役胜利。'],
    );
  }
  return normalized;
}
