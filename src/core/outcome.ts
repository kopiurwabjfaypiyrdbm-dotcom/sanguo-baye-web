import { appendLogs } from './logs';
import type { GameState } from './types';
import { releaseLandlessFactionOfficers, terminateAllStrategicOrders } from './administration';
import { terminateAllDiplomaticOrders } from './diplomaticOrders';

export function evaluateOutcome(state: GameState): GameState {
  if (state.phase === 'ended') return state;
  const normalized = releaseLandlessFactionOfficers(state);
  const playerHasCity = Object.values(normalized.cities).some((city) => city.ownerId === normalized.playerFactionId);
  if (!playerHasCity) {
    const settled = terminateAllDiplomaticOrders(terminateAllStrategicOrders(normalized));
    return appendLogs(
      { ...settled, campaignStarted: true, phase: 'ended', activeFactionId: settled.playerFactionId, outcome: 'defeat' },
      'system',
      ['我方已失去全部城池，战役失败。'],
    );
  }

  const enemyHasCity = Object.values(normalized.cities).some((city) => {
    const faction = normalized.factions[city.ownerId];
    return city.ownerId !== normalized.playerFactionId && faction && !faction.isNeutral;
  });
  if (!enemyHasCity) {
    const settled = terminateAllDiplomaticOrders(terminateAllStrategicOrders(normalized));
    return appendLogs(
      { ...settled, campaignStarted: true, phase: 'ended', activeFactionId: settled.playerFactionId, outcome: 'victory' },
      'system',
      ['天下再无敌对诸侯，战役胜利。'],
    );
  }
  return normalized;
}
