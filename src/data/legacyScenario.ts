import type { ArmsType, City, Faction, GameState, Officer } from '../core/types';
import { updateCitySatraps } from '../core/administration';
import { assertValidGameState } from '../core/validation';
import { parseBayeLegacyPeriod, type BayeLegacyPeriod } from '../compat/baye/legacyScenario';

const NEUTRAL_FACTION_ID = 'neutral';
const DEFAULT_PLAYER_RULER_INDEX = 1; // Cao Cao in period 1.
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

  const officers: Record<string, Officer> = Object.fromEntries(
    period.persons.map((person) => {
      const isAssigned = assignedPersonIndexes.has(person.sourceIndex);
      const activeFaction = isAssigned && person.rulerIndex !== null && activeRulers.has(person.rulerIndex)
        ? factionId(person.rulerIndex)
        : NEUTRAL_FACTION_ID;
      const isPlayer = activeFaction === factionId(playerRulerIndex);
      const status: Officer['status'] = !isAssigned
        ? 'hidden'
        : activeFaction === NEUTRAL_FACTION_ID ? 'free' : 'serving';
      const armsTypeId = armsTypeIds[person.armsType] ?? armsTypeIds[0];
      const id = officerId(person.sourceIndex);
      return [
        id,
        {
          id,
          sourceId: person.sourceIndex,
          name: person.name,
          force: person.force,
          intelligence: person.intelligence,
          // The original record has no leadership field. Keep this temporary
          // prototype value isolated from the Baye-compatible battle layer.
          leadership: Math.round((person.force + person.intelligence) / 2),
          armsTypeId,
          status,
          factionId: activeFaction,
          ...(isAssigned ? { cityId: cityIdByPerson[person.sourceIndex] } : {}),
          troops: status === 'hidden' ? person.troops : isPlayer ? 100 : 800,
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
          food: ownerId === factionId(playerRulerIndex) ? city.food : city.food + 1000,
          reserveTroops: city.reserveTroops,
          satrapOfficerId: city.satrapIndex === null ? undefined : officerId(city.satrapIndex),
          farmingLimit: city.farmingLimit,
          commerceLimit: city.commerceLimit,
          populationLimit: city.populationLimit,
          publicLoyalty: city.publicLoyalty,
          disasterPrevention: city.disasterPrevention,
        },
      ];
    }),
  );

  const playerFactionId = factionId(playerRulerIndex);
  const state: GameState = {
    schemaVersion: 2,
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
    factions,
    cities,
    officers,
    items: {},
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
  const officers = state.scenario?.source === 'baye-legacy'
    ? Object.fromEntries(
        Object.values(state.officers).map((officer) => [
          officer.id,
          {
            ...officer,
            troops: officer.status === 'hidden' ? officer.troops : officer.factionId === playerFactionId ? 100 : 800,
          },
        ]),
      )
    : state.officers;
  const cities = state.scenario?.source === 'baye-legacy'
    ? Object.fromEntries(
        Object.values(state.cities).map((city) => {
          let food = city.food;
          if (city.ownerId === state.playerFactionId) food += 1000;
          if (city.ownerId === playerFactionId) food = Math.max(0, food - 1000);
          return [city.id, { ...city, food }];
        }),
      )
    : state.cities;
  const next = updateCitySatraps({
    ...state,
    phase: 'player' as const,
    activeFactionId: playerFactionId,
    playerFactionId,
    factions,
    cities,
    officers,
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

function createArmsTypes(): Record<string, ArmsType> {
  return {
    cavalry: { id: 'cavalry', name: '骑兵', attackModifier: 1.08, defenseModifier: 0.96, mobility: 4 },
    infantry: { id: 'infantry', name: '步兵', attackModifier: 1, defenseModifier: 1.08, mobility: 3 },
    archer: { id: 'archer', name: '弓兵', attackModifier: 1.04, defenseModifier: 0.92, mobility: 3 },
    navy: { id: 'navy', name: '水兵', attackModifier: 0.98, defenseModifier: 1, mobility: 3 },
    elite: { id: 'elite', name: '极兵', attackModifier: 1.16, defenseModifier: 1.12, mobility: 4 },
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
