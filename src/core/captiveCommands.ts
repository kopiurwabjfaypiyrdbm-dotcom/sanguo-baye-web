import { appendLogs } from './logs';
import { getEffectiveOfficerAttributes } from './equipment';
import { nextRandom } from './random';
import type { GameState, Officer } from './types';
import { assertValidGameState } from './validation';

export const SURRENDER_STAMINA_COST = 4;

export type RecruitCaptiveOrder = {
  cityId: string;
  executorOfficerId: string;
  captiveOfficerId: string;
};

export type ReleaseCaptiveOrder = {
  cityId: string;
  captiveOfficerId: string;
};

const characterResistanceDivisor = [2, 5, 4, 3, 1] as const;

export function recruitCaptive(state: GameState, order: RecruitCaptiveOrder): GameState {
  if (state.phase === 'ended') throw new Error('战役已经结束');
  if (state.pendingSuccession) throw new Error('必须先拥立新君');
  const city = state.cities[order.cityId];
  if (!city || city.ownerId !== state.activeFactionId) throw new Error('只能招降己方城池中的俘虏');
  const executor = requireExecutor(state, city.id, order.executorOfficerId);
  const captive = requireCaptive(state, city.id, order.captiveOfficerId);
  if (state.actedOfficerIds.includes(executor.id)) throw new Error('该武将本月已经执行过命令');
  if (executor.stamina < SURRENDER_STAMINA_COST) throw new Error(`招降需要至少 ${SURRENDER_STAMINA_COST} 点体力`);

  let seed = state.rngSeed;
  const draw = (maximum: number) => {
    const random = nextRandom(seed);
    seed = random.seed;
    return Math.floor(random.value * maximum);
  };
  const executorIntelligence = getEffectiveOfficerAttributes(state, executor).intelligence;
  const captiveIntelligence = getEffectiveOfficerAttributes(state, captive).intelligence;
  const intelligenceChance = clamp(executorIntelligence - captiveIntelligence + 50, 0, 99);
  const passedIntelligence = draw(100) <= intelligenceChance;
  const reducedLoyalty = passedIntelligence
    ? captive.loyalty - Math.floor(captive.loyalty / 10)
    : captive.loyalty;
  let succeeded = false;
  let recruitedLoyalty = reducedLoyalty;
  if (passedIntelligence && captive.loyalty <= 60) {
    const divisor = characterResistanceDivisor[captive.character ?? 0] ?? 1;
    succeeded = draw(100) >= Math.floor(captive.loyalty / divisor);
    if (succeeded) recruitedLoyalty = 40 + draw(40);
  }

  const updatedExecutor: Officer = { ...executor, stamina: executor.stamina - SURRENDER_STAMINA_COST };
  const updatedCaptive: Officer = succeeded
    ? {
        ...captive,
        status: 'serving',
        factionId: state.activeFactionId,
        captorFactionId: undefined,
        formerFactionId: undefined,
        loyalty: recruitedLoyalty,
        troops: 0,
        stamina: 0,
      }
    : { ...captive, loyalty: reducedLoyalty };
  const message = succeeded
    ? `${executor.name}说服${captive.name}归顺，忠诚为 ${recruitedLoyalty}。`
    : passedIntelligence
      ? `${executor.name}招降${captive.name}未果，其旧部忠诚降至 ${reducedLoyalty}。`
      : `${executor.name}招降${captive.name}未果，未能动摇其忠诚。`;
  const next = appendLogs({
    ...state,
    campaignStarted: true,
    rngSeed: seed,
    actedOfficerIds: [...state.actedOfficerIds, executor.id],
    officers: {
      ...state.officers,
      [executor.id]: updatedExecutor,
      [captive.id]: updatedCaptive,
    },
  }, 'map', [message]);
  assertValidGameState(next);
  return next;
}

/** Modern humane alternative to execution/exile; intentionally costs no action. */
export function releaseCaptive(state: GameState, order: ReleaseCaptiveOrder): GameState {
  if (state.phase === 'ended') throw new Error('战役已经结束');
  if (state.pendingSuccession) throw new Error('必须先拥立新君');
  const city = state.cities[order.cityId];
  if (!city || city.ownerId !== state.activeFactionId) throw new Error('只能释放己方城池中的俘虏');
  const captive = requireCaptive(state, city.id, order.captiveOfficerId);
  const neutralFactionId = Object.values(state.factions).find((faction) => faction.isNeutral)?.id;
  if (!neutralFactionId) throw new Error('释放俘虏需要无所属势力');
  const next = appendLogs({
    ...state,
    campaignStarted: true,
    discoveredOfficerIds: state.discoveredOfficerIds.includes(captive.id)
      ? state.discoveredOfficerIds
      : [...state.discoveredOfficerIds, captive.id],
    officers: {
      ...state.officers,
      [captive.id]: {
        ...captive,
        status: 'free',
        factionId: neutralFactionId,
        captorFactionId: undefined,
        formerFactionId: undefined,
        troops: 0,
        stamina: 0,
      },
    },
  }, 'map', [`释放${captive.name}，其成为${city.name}在野人物。`]);
  assertValidGameState(next);
  return next;
}

function requireExecutor(state: GameState, cityId: string, officerId: string): Officer {
  const officer = state.officers[officerId];
  if (!officer || officer.status !== 'serving' || officer.factionId !== state.activeFactionId || officer.cityId !== cityId) {
    throw new Error('招降执行武将不在该城');
  }
  return officer;
}

function requireCaptive(state: GameState, cityId: string, officerId: string): Officer {
  const officer = state.officers[officerId];
  if (!officer || officer.status !== 'captive' || officer.captorFactionId !== state.activeFactionId || officer.cityId !== cityId) {
    throw new Error('目标不是该城俘虏');
  }
  return officer;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
