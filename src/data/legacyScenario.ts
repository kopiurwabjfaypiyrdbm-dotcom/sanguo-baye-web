import type { ArmsType, City, Faction, GameState, Officer } from '../core/types';
import { updateCitySatraps } from '../core/administration';
import { assertValidGameState } from '../core/validation';
import { parseBayeLegacyPeriod, type BayeLegacyPeriod } from '../compat/baye/legacyScenario';
import { createItemCatalog, itemId } from './itemCatalog';

const NEUTRAL_FACTION_ID = 'neutral';
const DEFAULT_PLAYER_RULER_INDEX = 1; // Cao Cao in period 1.
/** Parsed period records begin at zero; use one symmetric modern baseline until original initialization is verified. */
export const DEFAULT_STARTING_TROOPS = 400;
const armsTypeIds = ['cavalry', 'infantry', 'archer', 'navy', 'elite', 'mystic'] as const;
const factionColors = [
  '#a9534f', '#5477b7', '#c58b42', '#6c9b62', '#966bb0', '#4c9c9a',
  '#b66d93', '#75864a', '#b45e3c', '#557fa0', '#9b7452', '#6f69a8',
  '#3f8a6e', '#a66f36', '#7c756d', '#8d5a73', '#5f83a8', '#8a8244',
] as const;

export function createLegacyPeriodGameState(
  bytes: Uint8Array,
  period: 1 | 2 | 3 | 4 = 1,
  playerRulerIndex = DEFAULT_PLAYER_RULER_INDEX,
): GameState {
  return createGameStateFromLegacyPeriod(parseBayeLegacyPeriod(bytes, period), playerRulerIndex);
}

export function createGameStateFromLegacyPeriod(
  period: BayeLegacyPeriod,
  requestedPlayerRulerIndex = DEFAULT_PLAYER_RULER_INDEX,
): GameState {
  const activeRulerIndexes = [...new Set(period.cities.flatMap((city) => city.rulerIndex ?? []))];
  if (activeRulerIndexes.length === 0) throw new Error('legacy period contains no playable rulers');
  const playerRulerIndex = activeRulerIndexes.includes(requestedPlayerRulerIndex)
    ? requestedPlayerRulerIndex
    : activeRulerIndexes[0];
  const activeRulers = new Set(activeRulerIndexes);
  const cityIdByPerson = buildCityAssignments(period);
  const cityFactionByPerson = buildCityFactionAssignments(period, activeRulers);
  const assignedPersonIndexes = new Set(Object.keys(cityIdByPerson).map(Number));
  const neutralRulerIndex = period.persons.find(
    (person) =>
      assignedPersonIndexes.has(person.sourceIndex) &&
      (person.rulerIndex === null || !activeRulers.has(person.rulerIndex)),
  )?.sourceIndex;
  if (neutralRulerIndex === undefined) throw new Error('legacy period has no neutral officer bucket');

  const factions: Record<string, Faction> = Object.fromEntries(
    activeRulerIndexes.map((rulerIndex, colorIndex) => {
      const ruler = period.persons[rulerIndex];
      const id = factionId(rulerIndex);
      return [
        id,
        {
          id,
          name: `${ruler.name}军`,
          rulerOfficerId: officerId(rulerIndex),
          color: factionColors[colorIndex % factionColors.length],
          isPlayer: rulerIndex === playerRulerIndex,
          aiProfile: aiProfileFor(ruler.character),
        },
      ];
    }),
  );
  factions[NEUTRAL_FACTION_ID] = {
    id: NEUTRAL_FACTION_ID,
    name: '无所属',
    rulerOfficerId: officerId(neutralRulerIndex),
    color: '#77786f',
    isPlayer: false,
    isNeutral: true,
    aiProfile: 'defensive',
  };
  const items = createItemCatalog();

  const officers: Record<string, Officer> = Object.fromEntries(
    period.persons.map((person) => {
      const isAssigned = assignedPersonIndexes.has(person.sourceIndex);
      // A few period records retain a different active ruler index even though
      // the person is already in another ruler's city queue. The queue is the
      // authoritative current placement; a null/inactive ruler remains free.
      const activeFaction = isAssigned && person.rulerIndex !== null && activeRulers.has(person.rulerIndex)
        ? cityFactionByPerson[person.sourceIndex]
        : NEUTRAL_FACTION_ID;
      const status: Officer['status'] = !isAssigned
        ? 'hidden'
        : activeFaction === NEUTRAL_FACTION_ID ? 'free' : 'serving';
      const armsTypeId = armsTypeIds[person.armsType] ?? armsTypeIds[0];
      const id = officerId(person.sourceIndex);
      const equipmentItemIds = person.equipmentIndexes
        .filter((sourceId): sourceId is number => sourceId !== null)
        .map(itemId);
      const equipment = equipmentItemIds.map((equipmentItemId) => items[equipmentItemId]).filter(Boolean);
      // Baye stores current Force/IQ in the period record: AddGoodsPerson mutates
      // those values when an item is equipped. The Web state keeps immutable
      // base attributes, so remove the imported equipment contribution once.
      const baseForce = person.force - equipment.reduce((sum, item) => sum + item.forceBonus, 0);
      const baseIntelligence = person.intelligence - equipment.reduce((sum, item) => sum + item.intelligenceBonus, 0);
      if (baseForce < 0 || baseIntelligence < 0) throw new Error(`legacy equipment exceeds ${person.name}'s attributes`);
      return [
        id,
        {
          id,
          sourceId: person.sourceIndex,
          name: person.name,
          force: baseForce,
          intelligence: baseIntelligence,
          // The original record has no leadership field. Keep this temporary
          // prototype value isolated from the Baye-compatible battle layer.
          leadership: Math.round((person.force + person.intelligence) / 2),
          armsTypeId,
          equipmentItemIds,
          status,
          factionId: activeFaction,
          ...(isAssigned ? { cityId: cityIdByPerson[person.sourceIndex] } : {}),
          troops: status === 'serving' ? DEFAULT_STARTING_TROOPS : person.troops,
          loyalty: person.loyalty,
          age: person.age,
          stamina: 100,
          level: person.level,
          character: person.character,
          experience: person.experience,
        },
      ];
    }),
  );

  const cities: Record<string, City> = Object.fromEntries(
    period.cities.map((city) => {
      const id = cityId(city.sourceIndex);
      const ownerId = city.rulerIndex !== null && activeRulers.has(city.rulerIndex)
        ? factionId(city.rulerIndex)
        : NEUTRAL_FACTION_ID;
      return [
        id,
        {
          id,
          sourceIndex: city.sourceIndex,
          name: city.name,
          x: 72 + city.mapX * 88,
          y: 62 + city.mapY * 76,
          type: city.rulerIndex !== null && city.personIndexes.includes(city.rulerIndex) ? 'capital' : 'city',
          region: '原版战略地图',
          ownerId,
          neighbors: city.neighborIndexes.map(cityId),
          population: city.population,
          farming: city.farming,
          commerce: city.commerce,
          // AvoidCalamity is not a fortification stat. Keep battle defence at
          // zero until a separately sourced rule is introduced.
          defense: 0,
          money: city.money,
          food: city.food,
          reserveTroops: city.reserveTroops,
          satrapOfficerId: city.satrapIndex === null ? undefined : officerId(city.satrapIndex),
          farmingLimit: city.farmingLimit,
          commerceLimit: city.commerceLimit,
          populationLimit: city.populationLimit,
          publicLoyalty: city.publicLoyalty,
          disasterPrevention: city.disasterPrevention,
          itemIds: city.goodsIndexes
            .filter((rawItemId) => (rawItemId & 0x80) !== 0)
            .map((rawItemId) => itemId(rawItemId & 0x7f)),
          hiddenItemIds: city.goodsIndexes
            .filter((rawItemId) => (rawItemId & 0x80) === 0)
            .map((rawItemId) => itemId(rawItemId & 0x7f)),
        },
      ];
    }),
  );

  const playerFactionId = factionId(playerRulerIndex);
  const state: GameState = {
    schemaVersion: 3,
    scenario: { id: `baye-period-${period.period}`, source: 'baye-legacy', period: period.period },
    turn: 1,
    phase: 'player',
    activeFactionId: playerFactionId,
    factionOrder: activeRulerIndexes.map(factionId),
    rngSeed: (period.year << 8) | period.period,
    calendar: { year: period.year, month: 1 },
    campaignStarted: false,
    playerFactionId,
    actedOfficerIds: [],
    discoveredOfficerIds: [],
    intelReports: {},
    factions,
    cities,
    officers,
    items,
    armsTypes: createArmsTypes(),
    logs: [
      {
        id: 'log-001',
        kind: 'system',
        message: `已载入原版时期 ${period.period}：${Object.keys(cities).length} 城、${assignedPersonIndexes.size} 名当前人物，另保留 ${period.persons.length - assignedPersonIndexes.size} 名未登场人物。`,
        turn: 1,
      },
    ],
  };
  const initialized = updateCitySatraps(state);
  assertValidGameState(initialized);
  return initialized;
}

export function selectPlayerFaction(state: GameState, playerFactionId: string): GameState {
  if (state.campaignStarted) {
    throw new Error('战役开始后不能切换君主');
  }
  const faction = state.factions[playerFactionId];
  if (!faction || faction.isNeutral) throw new Error(`Faction is not playable: ${playerFactionId}`);
  const factions = Object.fromEntries(
    Object.values(state.factions).map((candidate) => [
      candidate.id,
      { ...candidate, isPlayer: candidate.id === playerFactionId },
    ]),
  );
  const next = updateCitySatraps({
    ...state,
    phase: 'player' as const,
    activeFactionId: playerFactionId,
    playerFactionId,
    factions,
  });
  assertValidGameState(next);
  return next;
}

function buildCityAssignments(period: BayeLegacyPeriod): Record<number, string> {
  const result: Record<number, string> = {};
  for (const city of period.cities) {
    for (const personIndex of city.personIndexes) {
      if (result[personIndex]) throw new Error(`person ${personIndex} appears in more than one city queue`);
      result[personIndex] = cityId(city.sourceIndex);
    }
  }
  return result;
}

function buildCityFactionAssignments(
  period: BayeLegacyPeriod,
  activeRulers: ReadonlySet<number>,
): Record<number, string> {
  const result: Record<number, string> = {};
  for (const city of period.cities) {
    const ownerId = city.rulerIndex !== null && activeRulers.has(city.rulerIndex)
      ? factionId(city.rulerIndex)
      : NEUTRAL_FACTION_ID;
    for (const personIndex of city.personIndexes) result[personIndex] = ownerId;
  }
  return result;
}

function createArmsTypes(): Record<string, ArmsType> {
  return {
    cavalry: { id: 'cavalry', name: '骑兵', attackModifier: 1.08, defenseModifier: 0.96, mobility: 5 },
    infantry: { id: 'infantry', name: '步兵', attackModifier: 1, defenseModifier: 1.08, mobility: 4 },
    archer: { id: 'archer', name: '弓兵', attackModifier: 1.04, defenseModifier: 0.92, mobility: 4 },
    navy: { id: 'navy', name: '水兵', attackModifier: 0.98, defenseModifier: 1, mobility: 5 },
    elite: { id: 'elite', name: '极兵', attackModifier: 1.16, defenseModifier: 1.12, mobility: 6 },
    mystic: { id: 'mystic', name: '玄兵', attackModifier: 0.94, defenseModifier: 1.18, mobility: 3 },
  };
}

function aiProfileFor(character: number): Faction['aiProfile'] {
  if (character <= 1) return 'aggressive';
  if (character >= 4) return 'defensive';
  return 'balanced';
}

function cityId(index: number): string {
  return `city-${index}`;
}

function officerId(index: number): string {
  return `officer-${index}`;
}

function factionId(rulerIndex: number): string {
  return `ruler-${rulerIndex}`;
}
