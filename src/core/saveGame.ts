import type { GameState } from './types';
import { assertValidGameState } from './validation';
import { releaseLandlessFactionOfficers } from './administration';
import { getOfficerEquipmentIds } from './equipment';
import { appendLogs } from './logs';
import { nextRandom } from './random';
import { createBundledScenario, type BundledPeriodId } from '../data/bundledScenarios';
import { createSampleState } from './sampleState';
import { PERSON_APPEAR_AGE } from './annualProgression';

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
  if (input.schemaVersion === 4) {
    return restoreLegacyAppearanceSchedules(normalizeItemInventories(restoreSampleInventories(restoreLegacyScenarioItems(
      releaseLandlessFactionOfficers(structuredClone(input) as GameState),
    ))));
  }
  if (input.schemaVersion === 3) {
    return restoreLegacyAppearanceSchedules(normalizeItemInventories(restoreSampleInventories(restoreLegacyScenarioItems(
      releaseLandlessFactionOfficers({
        ...structuredClone(input),
        schemaVersion: 4,
        strategicOrders: {},
        nextStrategicOrderSerial: 1,
      } as GameState),
    ))));
  }
  if (input.schemaVersion === 2) {
    return restoreLegacyAppearanceSchedules(normalizeItemInventories(restoreSampleInventories(restoreLegacyScenarioItems(
      releaseLandlessFactionOfficers({
        ...structuredClone(input),
        schemaVersion: 4,
        intelReports: {},
        strategicOrders: {},
        nextStrategicOrderSerial: 1,
      } as GameState),
    ))));
  }
  if (input.schemaVersion === 1) {
    return restoreLegacyAppearanceSchedules(normalizeItemInventories(restoreSampleInventories(restoreLegacyScenarioItems(releaseLandlessFactionOfficers({
      ...structuredClone(input),
      schemaVersion: 4,
      discoveredOfficerIds: Array.isArray(input.discoveredOfficerIds) ? [...input.discoveredOfficerIds] : [],
      intelReports: {},
      strategicOrders: {},
      nextStrategicOrderSerial: 1,
    } as GameState)))));
  }
  throw new Error(`不支持的游戏状态版本：${String(input.schemaVersion)}`);
}

function restoreLegacyAppearanceSchedules(state: GameState): GameState {
  const period = state.scenario?.source === 'baye-legacy' ? state.scenario.period : undefined;
  if (![1, 2, 3, 4].includes(period ?? 0)) return state;
  const ruler = state.officers[state.factions[state.playerFactionId]?.rulerOfficerId];
  if (ruler?.sourceId === undefined) return state;

  const baseline = createBundledScenario(period as BundledPeriodId, ruler.sourceId);
  const baselineSchedules = Object.values(baseline.officers).filter(
    (officer) => officer.appearanceYear !== undefined,
  );
  const hasCityWithoutYear = Object.values(state.officers).some(
    (officer) => officer.appearanceCityId !== undefined && officer.appearanceYear === undefined,
  );
  const isEntireLayerMissing = baselineSchedules.every((baselineOfficer) => {
    const officer = state.officers[baselineOfficer.id];
    return officer?.appearanceYear === undefined && officer?.appearanceCityId === undefined;
  });
  const hasCompleteBaselineLayer = baselineSchedules.every((baselineOfficer) => {
    const officer = state.officers[baselineOfficer.id];
    return officer?.appearanceYear === baselineOfficer.appearanceYear
      && officer.appearanceCityId === baselineOfficer.appearanceCityId;
  });
  if (hasCityWithoutYear || (!isEntireLayerMissing && !hasCompleteBaselineLayer)) {
    throw new Error('人物登场日程字段不完整，无法安全迁移该存档');
  }
  if (hasCompleteBaselineLayer) return state;

  const catchUpYears = baselineSchedules.length > 0
    ? Math.max(0, state.calendar.year - baseline.calendar.year)
    : 0;
  const officers = Object.fromEntries(
    Object.values(state.officers).map((officer) => [
      officer.id,
      catchUpYears > 0 ? { ...officer, age: officer.age + catchUpYears } : officer,
    ]),
  );
  const orderedCities = Object.values(state.cities).sort(
    (left, right) => (left.sourceIndex ?? Number.MAX_SAFE_INTEGER) - (right.sourceIndex ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id),
  );
  const neutralFactionId = Object.values(state.factions).find((faction) => faction.isNeutral)?.id ?? 'neutral';
  let seed = state.rngSeed;
  let restoredCount = 0;
  let appearedCount = 0;

  for (const baselineOfficer of baselineSchedules.sort(
    (left, right) => (left.sourceId ?? Number.MAX_SAFE_INTEGER) - (right.sourceId ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id),
  )) {
    const officer = officers[baselineOfficer.id];
    if (!officer || baselineOfficer.appearanceYear === undefined) continue;

    restoredCount += 1;
    const appearanceFields = {
      appearanceYear: baselineOfficer.appearanceYear,
      ...(baselineOfficer.appearanceCityId
        ? { appearanceCityId: baselineOfficer.appearanceCityId }
        : {}),
    };
    if (officer.status !== 'hidden') {
      officers[officer.id] = { ...officer, ...appearanceFields };
      continue;
    }
    if (baselineOfficer.appearanceYear > state.calendar.year) {
      officers[officer.id] = {
        ...officer,
        ...appearanceFields,
      };
      continue;
    }

    let targetCityId = baselineOfficer.appearanceCityId;
    if (!targetCityId) {
      const random = nextRandom(seed);
      seed = random.seed;
      targetCityId = orderedCities[Math.floor(random.value * orderedCities.length)]?.id;
    }
    if (!targetCityId || !state.cities[targetCityId]) continue;
    officers[officer.id] = {
      ...officer,
      status: 'free',
      factionId: neutralFactionId,
      cityId: targetCityId,
      troops: 0,
      age: PERSON_APPEAR_AGE + state.calendar.year - baselineOfficer.appearanceYear,
      ...appearanceFields,
    };
    appearedCount += 1;
  }

  if (restoredCount === 0) return state;
  return appendLogs(
    { ...state, rngSeed: seed, officers },
    'system',
    [
      `存档迁移：补全 ${restoredCount} 名人物的登场日程`
        + (catchUpYears > 0 ? `，全员补计 ${catchUpYears} 次年度年龄` : '')
        + (appearedCount > 0 ? `，其中 ${appearedCount} 人按已到年份进入在野` : '')
        + '。',
    ],
  );
}

function restoreSampleInventories(state: GameState): GameState {
  if (state.scenario?.id !== 'sample-190' || !Object.values(state.cities).every(
    (city) => city.itemIds === undefined && city.hiddenItemIds === undefined,
  )) return state;
  const baseline = createSampleState();
  const cities = Object.fromEntries(Object.values(state.cities).map((city) => [city.id, {
    ...city,
    itemIds: [...(baseline.cities[city.id]?.itemIds ?? [])],
    hiddenItemIds: [...(baseline.cities[city.id]?.hiddenItemIds ?? [])],
  }]));
  return { ...state, cities };
}

/**
 * Builds the item layer for saves made before the campaign exposed items.
 * Those builds could not discover, move, equip or consume an item, so the
 * bundled scenario baseline is still authoritative and no player action can
 * be overwritten by this one-time migration.
 */
function restoreLegacyScenarioItems(state: GameState): GameState {
  const period = state.scenario?.source === 'baye-legacy' ? state.scenario.period : undefined;
  if (![1, 2, 3, 4].includes(period ?? 0) || Object.keys(state.items ?? {}).length > 0) return state;
  const ruler = state.officers[state.factions[state.playerFactionId]?.rulerOfficerId];
  if (ruler?.sourceId === undefined) return state;
  const baseline = createBundledScenario(period as BundledPeriodId, ruler.sourceId);
  const cities = Object.fromEntries(Object.values(state.cities).map((city) => [city.id, {
    ...city,
    itemIds: [...(baseline.cities[city.id]?.itemIds ?? [])],
    hiddenItemIds: [...(baseline.cities[city.id]?.hiddenItemIds ?? [])],
  }]));
  const officers = Object.fromEntries(Object.values(state.officers).map((officer) => {
    const baselineOfficer = baseline.officers[officer.id];
    const equipmentItemIds = [...(baselineOfficer?.equipmentItemIds ?? [])];
    const forceBonus = equipmentItemIds.reduce((sum, itemId) => sum + (baseline.items[itemId]?.forceBonus ?? 0), 0);
    const intelligenceBonus = equipmentItemIds.reduce(
      (sum, itemId) => sum + (baseline.items[itemId]?.intelligenceBonus ?? 0),
      0,
    );
    return [officer.id, {
      ...officer,
      force: officer.force - forceBonus,
      intelligence: officer.intelligence - intelligenceBonus,
      equipmentItemIds,
    }];
  }));
  return { ...state, items: baseline.items, cities, officers };
}

function normalizeItemInventories(state: GameState): GameState {
  const overflowByCity = new Map<string, string[]>();
  const officers = Object.fromEntries(Object.values(state.officers).map((officer) => {
    const legacyEquipmentItemIds = getOfficerEquipmentIds(officer);
    const equipmentItemIds = officer.equipmentItemIds === undefined
      ? legacyEquipmentItemIds.slice(0, 2)
      : legacyEquipmentItemIds;
    if (officer.equipmentItemIds === undefined && legacyEquipmentItemIds.length > 2) {
      const targetCityId = officer.cityId && state.cities[officer.cityId]
        ? officer.cityId
        : Object.values(state.cities)
          .filter((city) => city.ownerId === officer.factionId)
          .sort((a, b) => a.id.localeCompare(b.id))[0]?.id;
      if (!targetCityId) throw new Error(`无法迁移${officer.name}的溢出装备`);
      overflowByCity.set(targetCityId, [
        ...(overflowByCity.get(targetCityId) ?? []),
        ...legacyEquipmentItemIds.slice(2),
      ]);
    }
    const {
      weaponItemId: _weaponItemId,
      intelligenceItemId: _intelligenceItemId,
      mountItemId: _mountItemId,
      ...canonicalOfficer
    } = officer;
    return [officer.id, { ...canonicalOfficer, equipmentItemIds }];
  }));
  const cities = Object.fromEntries(Object.values(state.cities).map((city) => [city.id, {
    ...city,
    itemIds: [
      ...(Array.isArray(city.itemIds) ? city.itemIds : []),
      ...(overflowByCity.get(city.id) ?? []),
    ],
    hiddenItemIds: Array.isArray(city.hiddenItemIds) ? [...city.hiddenItemIds] : [],
  }]));
  return { ...state, cities, officers };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
