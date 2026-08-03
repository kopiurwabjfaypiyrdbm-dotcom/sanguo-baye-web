import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, canonicalSha256, compareUnicodeScalar } from '../src/core/migration/canonicalJson';
import { governCity } from '../src/core/cityCommands';
import { findOwnedCityRoute, issueTransportOrder } from '../src/core/strategicOrders';
import { issueDiplomaticOrder } from '../src/core/diplomaticOrders';
import { reconnoitreCity } from '../src/core/reconnaissance';
import {
  cancelOfficerOrders,
  killOfficer,
  settleCaptiveEscapes,
  settleNaturalDeaths,
} from '../src/core/officerLifecycle';
import { evaluateOutcome } from '../src/core/outcome';
import { validateGameState } from '../src/core/validation';
import { nextRandom } from '../src/core/random';
import { settleCityEvents } from '../src/core/cityEvents';
import { settleAnnualProgression } from '../src/core/annualProgression';
import { advanceTurn } from '../src/core/turn';
import {
  createProductionSessionState,
  OracleApplicationSession,
  type ApplicationCommandEnvelope,
} from '../src/core/migration/applicationSessionContract';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(root, 'godot/data/fixtures/application-session-suite-v1.json');
const writeMode = process.argv.includes('--write');
const fixture = buildFixture();

if (writeMode) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  process.stdout.write(`[Godot application session] generated ${transactionCaseCount(fixture)} transaction cases\n`);
} else {
  let current: unknown;
  try { current = JSON.parse(readFileSync(path, 'utf8')); } catch { current = null; }
  if (canonicalJson(current) !== canonicalJson(fixture)) {
    throw new Error('godot/data/fixtures/application-session-suite-v1.json differs from TypeScript oracle');
  }
  process.stdout.write(`[Godot application session] PASSED ${transactionCaseCount(fixture)} transaction cases\n`);
}

function transactionCaseCount(value: ReturnType<typeof buildFixture>) {
  return value.steps.length + value.internalAffairsSequence.steps.length
    + value.internalAffairsBoundaryCases.length + value.officerManagementSequence.steps.length
    + value.officerManagementBoundaryCases.length + value.personnelLifecycleSequence.steps.length
    + value.personnelLifecycleBoundaryCases.length + value.strategicLogisticsSequences
      .reduce((total, sequence) => total + sequence.steps.length, 0)
    + value.strategicLogisticsBoundaryCases.length + value.reconnaissanceSequence.steps.length
    + value.reconnaissanceBoundaryCases.length + value.diplomaticOrderSequences
      .reduce((total, sequence) => total + sequence.steps.length, 0)
    + value.diplomaticOrderBoundaryCases.length
    + value.diplomaticOrderSettlementSequences
      .reduce((total, sequence) => total + sequence.steps.length, 0)
    + value.calendarEventCases.length
    + value.annualProgressionCases.length
    + value.annualProgressionPeriodCases.length
    + value.lifecycleOutcomeCases.length
    + value.strategicTurnCases.length
    + value.validationCases.length;
}

export function buildFixture() {
  const initialState = createProductionSessionState(1, 1);
  const initialDigest = canonicalSha256(initialState);
  const session = new OracleApplicationSession(initialState);
  const success: ApplicationCommandEnvelope = {
    commandEnvelopeVersion: 1,
    commandId: 'mb04-develop-0001',
    expectedStateSha256: initialDigest,
    kind: 'develop_farming',
    parameters: { cityId: 'city-12', officerId: 'officer-1' },
  };
  const steps: { id: string; command: unknown; expected: unknown }[] = [];
  const apply = (id: string, command: unknown) => steps.push({ id, command, expected: session.execute(command) });
  const firstResult = session.execute(success);
  steps.push({ id: 'success', command: success, expected: firstResult });
  apply('exact-duplicate', success);
  apply('stale-before-digest', { ...success, commandId: 'mb04-stale-0002' });
  apply('domain-rejection', {
    ...success,
    commandId: 'mb04-domain-0003',
    expectedStateSha256: canonicalSha256(session.snapshot()),
  });
  apply('command-id-conflict', {
    ...success,
    expectedStateSha256: canonicalSha256(session.snapshot()),
    parameters: { cityId: 'city-12', officerId: 'officer-21' },
  });
  apply('unknown-command', {
    ...success,
    commandId: 'mb04-unknown-0004',
    expectedStateSha256: canonicalSha256(session.snapshot()),
    kind: 'unknown',
    parameters: {},
  });
  apply('unsupported-version', {
    ...success,
    commandEnvelopeVersion: 2,
    commandId: 'mb04-version-0005',
    expectedStateSha256: canonicalSha256(session.snapshot()),
  });
  apply('missing-parameter', {
    ...success,
    commandId: 'mb04-missing-0006',
    expectedStateSha256: canonicalSha256(session.snapshot()),
    parameters: { cityId: 'city-12' },
  });
  apply('sorted-unknown-field-error', {
    ...success,
    commandId: 'mb04-fields-0007',
    expectedStateSha256: canonicalSha256(session.snapshot()),
    ['\u{10000}']: true,
    ['\ue000']: true,
  });
  apply('wrong-parameter-type', {
    ...success,
    commandId: 'mb04-invalid-0008',
    expectedStateSha256: canonicalSha256(session.snapshot()),
    parameters: { cityId: 12, officerId: 'officer-1' },
  });
  apply('non-breaking-space-command-id', {
    ...success,
    commandId: '\u00a0',
    expectedStateSha256: canonicalSha256(session.snapshot()),
  });
  const restoredSession = new OracleApplicationSession(firstResult.state);
  const continuationCommand: ApplicationCommandEnvelope = {
    commandEnvelopeVersion: 1,
    commandId: 'mb04-restored-0009',
    expectedStateSha256: canonicalSha256(restoredSession.snapshot()),
    kind: 'develop_farming',
    parameters: { cityId: 'city-12', officerId: 'officer-32' },
  };
  const continuationExpected = restoredSession.execute(continuationCommand);
  const annualProgression = buildAnnualProgressionCases();
  apply('second-success', continuationCommand);
  apply('advanced-duplicate', success);
  const internalAffairsSequence = buildInternalAffairsSequence();
  return {
    applicationSessionFixtureVersion: 1,
    algorithms: {
      canonicalJson: 'canonical-json-v1',
      digest: 'sha256',
      numberDomain: 'safe-integer-or-decimal-6-v1',
    },
    campaign: { periodId: 1, rulerSourceIndex: 1, initialStateSha256: initialDigest },
    steps,
    finalStateSha256: canonicalSha256(session.snapshot()),
    restoredContinuation: {
      command: continuationCommand,
      expected: continuationExpected,
    },
    internalAffairsSequence,
    internalAffairsBoundaryCases: buildInternalAffairsBoundaryCases(),
    officerManagementSequence: buildOfficerManagementSequence(),
    officerManagementBoundaryCases: buildOfficerManagementBoundaryCases(),
    personnelLifecycleSequence: buildPersonnelLifecycleSequence(),
    personnelLifecycleBoundaryCases: buildPersonnelLifecycleBoundaryCases(),
    strategicLogisticsSequences: buildStrategicLogisticsSequences(),
    strategicLogisticsBoundaryCases: buildStrategicLogisticsBoundaryCases(),
    strategicRouteCases: buildStrategicRouteCases(),
    strategicLifecycleCases: buildStrategicLifecycleCases(),
    reconnaissanceSequence: buildReconnaissanceSequence(),
    reconnaissanceBoundaryCases: buildReconnaissanceBoundaryCases(),
    reconnaissanceLegacyReportCase: buildReconnaissanceLegacyReportCase(),
    diplomaticOrderSequences: buildDiplomaticOrderSequences(),
    diplomaticOrderBoundaryCases: buildDiplomaticOrderBoundaryCases(),
    diplomaticOrderSettlementSequences: buildDiplomaticOrderSettlementSequences(),
    calendarEventCases: buildCalendarEventCases(),
    annualProgressionCases: annualProgression.cases,
    annualProgressionPeriodCases: annualProgression.periodCases,
    lifecycleOutcomeCases: buildLifecycleOutcomeCases(),
    strategicTurnCases: buildStrategicTurnCases(),
    validationCases: buildValidationCases(),
    modernRulesetCase: buildModernRulesetCase(),
  };
}

function buildCalendarEventCases() {
  const build = (id: string, configure: (state: ReturnType<typeof createProductionSessionState>, patches: StatePatch[]) => void) => {
    const input = createProductionSessionState(1, 1);
    const patches: StatePatch[] = [];
    for (const cityId of input.cityOrder) {
      const city = input.cities[cityId];
      const faction = input.factions[city.ownerId];
      if (!faction || faction.isNeutral) continue;
      patches.push(
        { path: ['cities', cityId, 'condition'], value: 'normal' },
        { path: ['cities', cityId, 'disasterPrevention'], value: 100 },
        { path: ['cities', cityId, 'publicLoyalty'], value: 100 },
      );
    }
    configure(input, patches);
    applyStatePatches(input as unknown as Record<string, unknown>, patches);
    const beforeLogs = input.logs.length;
    const output = settleCityEvents(structuredClone(input));
    const transitions = input.cityOrder.flatMap((cityId) => {
      const before = input.cities[cityId].condition ?? 'normal';
      const after = output.cities[cityId].condition ?? 'normal';
      return before === after ? [] : [{ cityId, from: before, to: after }];
    });
    return {
      id, campaign: { periodId: 1, rulerSourceIndex: 1 }, patches,
      initialStateSha256: canonicalSha256(input), finalStateSha256: canonicalSha256(output),
      expectedReceipt: {
        kind: 'settle_city_events', beforeSeed: input.rngSeed, afterSeed: output.rngSeed,
        transitions, appendedLogs: structuredClone(output.logs.slice(beforeLogs)),
      },
    };
  };
  const findTargetSeed = (kind: 0 | 2) => {
    const base = createProductionSessionState(1, 1);
    const targetIndex = base.cityOrder.filter((cityId) => {
      const faction = base.factions[base.cities[cityId].ownerId];
      return faction && !faction.isNeutral;
    }).indexOf('city-12');
    for (let candidate = 1; candidate < 1_000_000; candidate += 1) {
      let seed = candidate;
      for (let index = 0; index < targetIndex; index += 1) seed = nextRandom(seed).seed;
      const primary = nextRandom(seed);
      const kindDraw = nextRandom(primary.seed);
      const rebellion = nextRandom(kindDraw.seed);
      if (Math.floor(primary.value * 100) > 0 && Math.floor(kindDraw.value * 5) === kind
        && (kind !== 2 || Math.floor(rebellion.value * 100) > 0)) return candidate;
    }
    throw new Error(`missing period-1 event seed for kind ${kind}`);
  };
  return [
    build('famine-recovery', (_state, patches) => patches.push(
      { path: ['cities', 'city-12', 'condition'], value: 'famine' },
      { path: ['cities', 'city-12', 'food'], value: 100 },
    )),
    build('ongoing-flood-losses', (_state, patches) => patches.push(
      { path: ['cities', 'city-12', 'condition'], value: 'flood' },
      { path: ['cities', 'city-12', 'disasterPrevention'], value: 0 },
      { path: ['cities', 'city-12', 'farming'], value: 101 },
      { path: ['cities', 'city-12', 'commerce'], value: 101 },
      { path: ['cities', 'city-12', 'money'], value: 101 },
      { path: ['cities', 'city-12', 'food'], value: 101 },
      { path: ['cities', 'city-12', 'reserveTroops'], value: 101 },
      { path: ['cities', 'city-12', 'population'], value: 101 },
    )),
    build('new-drought-fixed-draws', (_state, patches) => patches.push(
      { path: ['rngSeed'], value: findTargetSeed(0) },
      { path: ['cities', 'city-12', 'disasterPrevention'], value: 0 },
    )),
    build('new-rebellion-fixed-draws', (_state, patches) => patches.push(
      { path: ['rngSeed'], value: findTargetSeed(2) },
      { path: ['cities', 'city-12', 'disasterPrevention'], value: 0 },
      { path: ['cities', 'city-12', 'publicLoyalty'], value: 0 },
    )),
  ];
}

function buildAnnualProgressionCases() {
  const placedItems = (state: ReturnType<typeof createProductionSessionState>) => new Set([
    ...Object.values(state.cities).flatMap((city) => [...(city.itemIds ?? []), ...(city.hiddenItemIds ?? [])]),
    ...Object.values(state.officers).flatMap((officer) => officer.equipmentItemIds ?? []),
  ]);
  const build = (
    id: string,
    patches: StatePatch[],
    previousCalendar: { year: number; month: number },
    periodId: 1 | 2 | 3 | 4 = 1,
  ) => {
    const input = createProductionSessionState(periodId, 1);
    applyStatePatches(input as unknown as Record<string, unknown>, patches);
    const beforePlaced = placedItems(input);
    const beforeLogs = input.logs.length;
    const output = settleAnnualProgression(structuredClone(input), previousCalendar);
    const appearedOfficerIds = Object.values(output.officers)
      .filter((officer) => input.officers[officer.id].status === 'hidden' && officer.status === 'free')
      .sort((left, right) => (left.sourceId ?? Number.MAX_SAFE_INTEGER) - (right.sourceId ?? Number.MAX_SAFE_INTEGER)
        || compareUnicodeScalar(left.id, right.id))
      .map((officer) => officer.id);
    const afterPlaced = placedItems(output);
    const appearedItemIds = Object.values(output.items)
      .filter((item) => !beforePlaced.has(item.id) && afterPlaced.has(item.id))
      .sort((left, right) => (left.sourceId ?? Number.MAX_SAFE_INTEGER) - (right.sourceId ?? Number.MAX_SAFE_INTEGER)
        || compareUnicodeScalar(left.id, right.id))
      .map((item) => item.id);
    const applied = input.calendar.month === 1 && input.calendar.year === previousCalendar.year + 1;
    return {
      id, campaign: { periodId, rulerSourceIndex: 1 }, patches, previousCalendar,
      initialStateSha256: canonicalSha256(input), finalStateSha256: canonicalSha256(output),
      expectedReceipt: {
        kind: 'settle_annual_progression', applied, beforeSeed: input.rngSeed, afterSeed: output.rngSeed,
        appearedOfficerIds, appearedItemIds, appendedLogs: structuredClone(output.logs.slice(beforeLogs)),
      },
    };
  };
  const base = createProductionSessionState(1, 1);
  const itemId = base.itemOrder[0];
  const itemRemovalPatches: StatePatch[] = [];
  for (const cityId of base.cityOrder) {
    itemRemovalPatches.push(
      { path: ['cities', cityId, 'itemIds'], value: (base.cities[cityId].itemIds ?? []).filter((id) => id !== itemId) },
      { path: ['cities', cityId, 'hiddenItemIds'], value: (base.cities[cityId].hiddenItemIds ?? []).filter((id) => id !== itemId) },
    );
  }
  for (const officerId of base.officerOrder) {
    if (!(base.officers[officerId].equipmentItemIds ?? []).includes(itemId)) continue;
    itemRemovalPatches.push({
      path: ['officers', officerId, 'equipmentItemIds'],
      value: (base.officers[officerId].equipmentItemIds ?? []).filter((id) => id !== itemId),
    });
  }
  const periodRolloverCases = ([1, 2, 3, 4] as const).map((periodId) => {
    const input = createProductionSessionState(periodId, 1);
    return build(
      `period-${periodId}-year-rollover`,
      [{ path: ['calendar'], value: { year: input.calendar.year + 1, month: 1 } }],
      { year: input.calendar.year, month: 12 },
      periodId,
    );
  });
  return {
    cases: [
    build('period-1-year-rollover', [{ path: ['calendar'], value: { year: 191, month: 1 } }], { year: 190, month: 12 }),
    build('age-growth-disabled', [
      { path: ['calendar'], value: { year: 191, month: 1 } },
      { path: ['lifecyclePolicy', 'ageGrowth'], value: 'disabled' },
    ], { year: 190, month: 12 }),
    build('scheduled-item-appears-once', [
      { path: ['calendar'], value: { year: 191, month: 1 } },
      ...itemRemovalPatches,
      { path: ['items', itemId, 'appearanceYear'], value: 191 },
      { path: ['items', itemId, 'appearanceCityId'], value: 'city-12' },
    ], { year: 190, month: 12 }),
    build('non-rollover-no-op', [], { year: 190, month: 1 }),
    ],
    periodCases: periodRolloverCases,
  };
}

function buildLifecycleOutcomeCases() {
  type ProductionState = ReturnType<typeof createProductionSessionState>;
  type Operation = 'settle_captive_escapes' | 'settle_natural_deaths'
    | 'kill_officer' | 'resolve_succession' | 'evaluate_outcome';
  const cases: unknown[] = [];
  const add = (
    id: string,
    operation: Operation,
    input: ProductionState,
    parameters: Record<string, unknown>,
    output: ProductionState,
    expectedReceipt: Record<string, unknown>,
    campaign: { periodId: 1 | 2 | 3 | 4; rulerSourceIndex: number } = { periodId: 1, rulerSourceIndex: 1 },
  ) => {
    const base = createProductionSessionState(campaign.periodId, campaign.rulerSourceIndex);
    const cleanInput = jsonClean(input) as ProductionState;
    const cleanOutput = jsonClean(output) as ProductionState;
    cases.push({
      id,
      campaign,
      patches: collectStatePatches(base as unknown as Record<string, unknown>, cleanInput as unknown as Record<string, unknown>),
      operation,
      parameters: jsonClean(parameters),
      initialStateSha256: canonicalSha256(cleanInput),
      finalStateSha256: canonicalSha256(cleanOutput),
      expectedReceipt: jsonClean(expectedReceipt),
    });
  };
  const lifecycleReceipt = (
    kind: 'settle_captive_escapes' | 'settle_natural_deaths',
    before: ProductionState,
    after: ProductionState,
    affectedOfficerIds: string[],
  ) => ({
    kind,
    beforeSeed: before.rngSeed,
    afterSeed: after.rngSeed,
    affectedOfficerIds,
    phase: after.phase,
    outcome: after.outcome ?? null,
    pendingSuccession: after.pendingSuccession ?? null,
    appendedLogs: structuredClone(after.logs.slice(before.logs.length)),
  });
  const killReceipt = (before: ProductionState, after: ProductionState, officerId: string) => ({
    kind: 'kill_officer', officerId,
    beforeSeed: before.rngSeed, afterSeed: after.rngSeed,
    phase: after.phase, outcome: after.outcome ?? null,
    pendingSuccession: after.pendingSuccession ?? null,
    appendedLogs: structuredClone(after.logs.slice(before.logs.length)),
  });

  {
    const input = createProductionSessionState(1, 1);
    input.lifecyclePolicy.captiveEscape = 'modern-monthly';
    input.rngSeed = 1972;
    input.officers['officer-86'] = {
      ...input.officers['officer-86'], status: 'captive', factionId: 'neutral',
      captorFactionId: 'ruler-1', formerFactionId: 'ruler-13', cityId: 'city-12',
      troops: 0, stamina: 0,
    };
    const output = settleCaptiveEscapes(structuredClone(input));
    add('captive-escape-success', 'settle_captive_escapes', input, {}, output,
      lifecycleReceipt('settle_captive_escapes', input, output, ['officer-86']));
  }
  {
    const input = createProductionSessionState(1, 1);
    input.rngSeed = 1972;
    const output = settleCaptiveEscapes(structuredClone(input));
    add('captive-escape-disabled-no-rng', 'settle_captive_escapes', input, {}, output,
      lifecycleReceipt('settle_captive_escapes', input, output, []));
  }
  {
    const input = createProductionSessionState(1, 1);
    input.lifecyclePolicy.naturalDeath = 'age-90-coinflip';
    input.rngSeed = 1972;
    input.officers['officer-32'].age = 90;
    const output = settleNaturalDeaths(structuredClone(input));
    add('natural-death-non-ruler', 'settle_natural_deaths', input, {}, output,
      lifecycleReceipt('settle_natural_deaths', input, output, ['officer-32']));
  }
  {
    const input = createProductionSessionState(1, 1);
    input.calendar.month = 2;
    input.lifecyclePolicy.naturalDeath = 'age-90-coinflip';
    input.rngSeed = 1972;
    input.officers['officer-32'].age = 90;
    const output = settleNaturalDeaths(structuredClone(input));
    add('natural-death-non-january-no-op', 'settle_natural_deaths', input, {}, output,
      lifecycleReceipt('settle_natural_deaths', input, output, []));
  }
  let pendingPlayerSuccession: ProductionState;
  {
    const input = createProductionSessionState(1, 1);
    const parameters = { officerId: 'officer-1', cause: 'natural-death', cityId: 'city-12' } as const;
    const output = killOfficer(structuredClone(input), parameters);
    pendingPlayerSuccession = output;
    add('player-ruler-death-pauses-for-succession', 'kill_officer', input, parameters, output,
      killReceipt(input, output, parameters.officerId));
  }
  {
    const input = jsonClean(pendingPlayerSuccession);
    const successorOfficerId = input.pendingSuccession!.candidateOfficerIds[0];
    const session = new OracleApplicationSession(input);
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: 'mb11-resolve-succession-001',
      expectedStateSha256: canonicalSha256(jsonClean(input)),
      kind: 'resolve_succession',
      parameters: { successorOfficerId },
    };
    const result = session.execute(command);
    if (!result.ok) throw new Error(`resolve succession command failed: ${result.error}`);
    add('resolve-player-succession', 'resolve_succession', input, {
      successorOfficerId, command,
    }, result.state, result.receipt);
  }
  {
    const input = createProductionSessionState(1, 1);
    const parameters = { officerId: 'officer-13', cause: 'natural-death', cityId: 'city-5' } as const;
    const output = killOfficer(structuredClone(input), parameters);
    add('ai-ruler-deterministic-successor', 'kill_officer', input, parameters, output,
      killReceipt(input, output, parameters.officerId));
  }
  {
    const input = createProductionSessionState(1, 1);
    for (const officerId of ['officer-32', 'officer-33', 'officer-34', 'officer-35', 'officer-36', 'officer-37']) {
      const officer = input.officers[officerId];
      input.officers[officerId] = {
        ...officer, status: 'dead', factionId: 'neutral', cityId: undefined,
        troops: 0, stamina: 0, equipmentItemIds: [],
        death: { cause: 'natural-death', turn: 1, year: 190, month: 1, cityId: 'city-12' },
      };
    }
    const parameters = { officerId: 'officer-1', cause: 'natural-death', cityId: 'city-12' } as const;
    const output = killOfficer(structuredClone(input), parameters);
    add('player-faction-dissolves-without-successor', 'kill_officer', input, parameters, output,
      killReceipt(input, output, parameters.officerId));
  }
  for (const outcome of ['victory', 'defeat'] as const) {
    const input = createProductionSessionState(1, 1);
    for (const city of Object.values(input.cities)) {
      if (outcome === 'victory') city.ownerId = input.playerFactionId;
      else if (city.ownerId === input.playerFactionId) city.ownerId = 'ruler-13';
      city.satrapOfficerId = undefined;
    }
    const output = evaluateOutcome(structuredClone(input));
    const message = outcome === 'victory' ? '天下再无敌对诸侯，战役胜利。' : '我方已失去全部城池，战役失败。';
    add(`campaign-${outcome}`, 'evaluate_outcome', input, {}, output, {
      kind: 'evaluate_outcome', phase: output.phase, outcome: output.outcome ?? null,
      appendedLogs: structuredClone(output.logs.slice(input.logs.length)),
      outcomeMessages: [message],
    });
  }
  for (const outcome of ['victory', 'defeat'] as const) {
    const campaign = { periodId: 1 as const, rulerSourceIndex: 5 };
    const input = createProductionSessionState(campaign.periodId, campaign.rulerSourceIndex);
    input.cities['city-0'].reserveTroops = 500;
    let withTransport = issueTransportOrder(input, {
      sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-57',
      cargo: { money: 10, food: 20, reserveTroops: 30 },
    });
    withTransport = reconnoitreCity(withTransport, {
      sourceCityId: 'city-8', targetCityId: 'city-12', officerId: 'officer-58',
    });
    const withOrders = issueDiplomaticOrder(withTransport, {
      kind: 'alienate', sourceCityId: 'city-8', officerId: 'officer-60', targetOfficerId: 'officer-32',
    });
    for (const city of Object.values(withOrders.cities)) {
      if (outcome === 'victory') city.ownerId = withOrders.playerFactionId;
      else if (city.ownerId === withOrders.playerFactionId) city.ownerId = 'ruler-13';
      city.satrapOfficerId = undefined;
    }
    const output = evaluateOutcome(structuredClone(withOrders));
    const message = outcome === 'victory' ? '天下再无敌对诸侯，战役胜利。' : '我方已失去全部城池，战役失败。';
    add(`campaign-${outcome}-with-active-orders`, 'evaluate_outcome', withOrders, {}, output, {
      kind: 'evaluate_outcome', phase: output.phase, outcome: output.outcome ?? null,
      appendedLogs: structuredClone(output.logs.slice(withOrders.logs.length)),
      outcomeMessages: [message],
    }, campaign);
  }
  return cases;
}

function buildStrategicTurnCases() {
  type ProductionState = ReturnType<typeof createProductionSessionState>;
  const build = (id: string, periodId: 1 | 2 | 3 | 4, configure?: (state: ProductionState, patches: StatePatch[]) => void) => {
    const base = createProductionSessionState(periodId, 1);
    const input = jsonClean(base);
    const patches: StatePatch[] = [];
    const aiServingIds = Object.values(input.officers)
      .filter((officer) => officer.status === 'serving' && officer.factionId !== input.playerFactionId)
      .map((officer) => officer.id)
      .sort(compareUnicodeScalar);
    patches.push({ path: ['actedOfficerIds'], value: aiServingIds });
    configure?.(input, patches);
    applyStatePatches(input as unknown as Record<string, unknown>, patches);
    const output = advanceTurn(jsonClean(input));
    const cleanInput = jsonClean(input) as ProductionState;
    const cleanOutput = jsonClean(output) as ProductionState;
    const aiFactionIds = cleanInput.factionOrder.filter((factionId) => factionId !== cleanInput.playerFactionId);
    return {
      id,
      campaign: { periodId, rulerSourceIndex: 1 },
      patches,
      initialStateSha256: canonicalSha256(cleanInput),
      finalStateSha256: canonicalSha256(cleanOutput),
      expectedReceipt: {
        kind: 'advance_turn',
        phase: cleanOutput.phase,
        turn: cleanOutput.turn,
        calendar: cleanOutput.calendar,
        rngSeed: cleanOutput.rngSeed,
        aiFactionIds,
        appendedLogs: structuredClone(cleanOutput.logs.slice(cleanInput.logs.length)),
      },
    };
  };
  const cases = ([1, 2, 3, 4] as const).map((periodId) => build(`period-${periodId}-unattended-month`, periodId));
  cases.push(build('period-1-ai-food-stabilization', 1, (state, patches) => {
    const firstAiFactionId = state.factionOrder.find((factionId) => factionId !== state.playerFactionId)!;
    const available = Object.values(state.officers)
      .filter((officer) => officer.status === 'serving' && officer.factionId === firstAiFactionId)
      .sort((left, right) => left.id.localeCompare(right.id))[0];
    if (!available?.cityId) throw new Error('MB12 fixture requires a stationed AI officer');
    const cityId = available.cityId;
    const acted = (patches.find((patch) => patch.path.join('.') === 'actedOfficerIds')?.value as string[])
      .filter((officerId) => officerId !== available.id);
    patches.push(
      { path: ['actedOfficerIds'], value: acted },
      { path: ['cities', cityId, 'food'], value: 0 },
      { path: ['cities', cityId, 'money'], value: 2_000 },
    );
  }));
  return cases;
}

function collectStatePatches(
  before: Record<string, unknown>, after: Record<string, unknown>, path: string[] = [],
): StatePatch[] {
  const patches: StatePatch[] = [];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort(compareUnicodeScalar);
  for (const key of keys) {
    const nextPath = [...path, key];
    if (!(key in after)) {
      patches.push({ path: nextPath, value: null, remove: true });
      continue;
    }
    if (!(key in before)) {
      patches.push({ path: nextPath, value: structuredClone(after[key]) });
      continue;
    }
    const left = before[key];
    const right = after[key];
    if (isPlainRecord(left) && isPlainRecord(right)) {
      patches.push(...collectStatePatches(left, right, nextPath));
    } else if (canonicalJson(left) !== canonicalJson(right)) {
      patches.push({ path: nextPath, value: structuredClone(right) });
    }
  }
  return patches;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonClean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildDiplomaticOrderSequences() {
  const configurations = [
    {
      id: 'alienate-success', rulerSourceIndex: 1, seed: 1, kind: 'alienate',
      sourceCityId: 'city-12', officerId: 'officer-1', targetCityId: 'city-0', targetOfficerId: 'officer-56',
      patches: [
        { path: ['officers', 'officer-1', 'intelligence'], value: 100 },
        { path: ['officers', 'officer-56', 'intelligence'], value: 50 },
        { path: ['officers', 'officer-56', 'loyalty'], value: 0 },
        { path: ['officers', 'officer-56', 'character'], value: 0 },
      ],
    },
    {
      id: 'canvass-success', rulerSourceIndex: 1, seed: 2, kind: 'canvass',
      sourceCityId: 'city-12', officerId: 'officer-1', targetCityId: 'city-0', targetOfficerId: 'officer-56',
      patches: [
        { path: ['officers', 'officer-1', 'intelligence'], value: 100 },
        { path: ['officers', 'officer-56', 'intelligence'], value: 0 },
        { path: ['officers', 'officer-56', 'loyalty'], value: 0 },
        { path: ['officers', 'officer-56', 'character'], value: 1 },
      ],
    },
    {
      id: 'counterespionage-success', rulerSourceIndex: 1, seed: 1, kind: 'counterespionage',
      sourceCityId: 'city-12', officerId: 'officer-1', targetCityId: 'city-0', targetOfficerId: 'officer-56',
      patches: [
        { path: ['officers', 'officer-1', 'intelligence'], value: 100 },
        { path: ['officers', 'officer-56', 'intelligence'], value: 50 },
        { path: ['officers', 'officer-56', 'loyalty'], value: 0 },
        { path: ['officers', 'officer-56', 'character'], value: 3 },
      ],
    },
    {
      id: 'induce-success', rulerSourceIndex: 0, seed: 8, kind: 'induce',
      sourceCityId: 'city-15', officerId: 'officer-31', targetCityId: 'city-11', targetOfficerId: 'officer-10',
      patches: [
        { path: ['officers', 'officer-31', 'intelligence'], value: 100 },
        { path: ['officers', 'officer-10', 'intelligence'], value: 50 },
        { path: ['officers', 'officer-10', 'character'], value: 4 },
      ],
    },
  ] as const;
  return configurations.map((configuration) => {
    const initialState = createProductionSessionState(1, configuration.rulerSourceIndex);
    const initialPatches: StatePatch[] = [
      { path: ['rngSeed'], value: configuration.seed },
      ...configuration.patches.map((patch) => ({ path: [...patch.path], value: patch.value })),
    ];
    applyStatePatches(initialState as unknown as Record<string, unknown>, initialPatches);
    const report = buildCurrentIntelReport(initialState, configuration.targetCityId);
    const reportPatch: StatePatch = {
      path: ['intelReports', configuration.targetCityId], value: report,
    };
    initialPatches.push(reportPatch);
    applyStatePatches(initialState as unknown as Record<string, unknown>, [reportPatch]);
    const session = new OracleApplicationSession(initialState);
    const issueCommand: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb10-${configuration.id}-issue`,
      expectedStateSha256: canonicalSha256(initialState),
      kind: `issue_${configuration.kind}_order`,
      parameters: {
        sourceCityId: configuration.sourceCityId,
        officerId: configuration.officerId,
        targetOfficerId: configuration.targetOfficerId,
      },
    };
    const issueResult = session.execute(issueCommand);
    if (!issueResult.ok) throw new Error(`${configuration.id} issue failed: ${issueResult.error}`);
    const { state: _issueState, ...issueCore } = issueResult;
    const advanceInputSha256 = canonicalSha256(session.snapshot());
    const advanceResult = session.advanceDiplomaticOrders();
    if (!advanceResult.ok) throw new Error(`${configuration.id} advance failed: ${advanceResult.error}`);
    const { state: _advanceState, ...advanceCore } = advanceResult;
    return {
      id: configuration.id,
      campaign: { periodId: 1, rulerSourceIndex: configuration.rulerSourceIndex },
      initialPatches,
      initialStateSha256: canonicalSha256(initialState),
      initialSeed: configuration.seed,
      steps: [
        { id: 'issue', operation: 'command' as const, command: issueCommand, expectedCore: issueCore },
        {
          id: 'advance', operation: 'advance' as const,
          preStateSha256: advanceInputSha256, expectedCore: advanceCore,
        },
      ],
      finalStateSha256: canonicalSha256(session.snapshot()),
    };
  });
}

function buildCurrentIntelReport(state: ReturnType<typeof createProductionSessionState>, cityId: string) {
  const city = state.cities[cityId];
  const stationed = Object.values(state.officers)
    .filter((officer) => officer.status === 'serving' && officer.cityId === cityId)
    .sort((left, right) => compareUnicodeScalar(left.id, right.id));
  const satrapName = city.satrapOfficerId ? state.officers[city.satrapOfficerId]?.name : undefined;
  return {
    cityId,
    observedTurn: state.turn,
    observedYear: state.calendar.year,
    observedMonth: state.calendar.month,
    population: city.population,
    money: city.money,
    food: city.food,
    reserveTroops: city.reserveTroops,
    farming: city.farming,
    commerce: city.commerce,
    defense: city.defense,
    publicLoyalty: city.publicLoyalty,
    ...(satrapName === undefined ? {} : { satrapName }),
    officerIds: stationed.map((officer) => officer.id),
    officerCount: stationed.length,
    totalTroops: stationed.reduce((total, officer) => total + officer.troops, 0),
  };
}

function buildDiplomaticOrderBoundaryCases() {
  type Setup = {
    id: string;
    kind?: 'alienate' | 'canvass' | 'counterespionage' | 'induce';
    parameters?: Record<string, unknown>;
    patches?: StatePatch[];
    reportMode?: 'current' | 'none' | 'stale' | 'legacy' | 'without-target';
  };
  const valid = { sourceCityId: 'city-12', officerId: 'officer-1', targetOfficerId: 'officer-56' };
  const setups: Setup[] = [
    { id: 'modern-cost-success', patches: [{ path: ['rulesetId'], value: 'modern-balanced-v1' }] },
    { id: 'missing-intelligence-rejected', reportMode: 'none' },
    { id: 'stale-intelligence-rejected', patches: [
      { path: ['turn'], value: 2 }, { path: ['calendar', 'month'], value: 2 },
    ], reportMode: 'stale' },
    { id: 'legacy-report-without-officers-rejected', reportMode: 'legacy' },
    { id: 'report-without-target-rejected', reportMode: 'without-target' },
    { id: 'acted-executor-rejected', patches: [{ path: ['actedOfficerIds'], value: ['officer-1'] }] },
    { id: 'classic-stamina-insufficient', patches: [{ path: ['officers', 'officer-1', 'stamina'], value: 19 }] },
    { id: 'money-insufficient', patches: [{ path: ['cities', 'city-12', 'money'], value: 49 }] },
    { id: 'serial-exhausted', patches: [{ path: ['nextDiplomaticOrderSerial'], value: Number.MAX_SAFE_INTEGER }] },
    { id: 'counterespionage-requires-satrap', kind: 'counterespionage', parameters: {
      ...valid, targetOfficerId: 'officer-57',
    } },
    { id: 'induce-requires-ruler', kind: 'induce' },
    { id: 'target-moved-after-report', patches: [
      { path: ['officers', 'officer-56', 'cityId'], value: 'city-3' },
      { path: ['cities', 'city-0', 'satrapOfficerId'], value: 'officer-57' },
    ] },
    { id: 'sorted-unknown-parameter', parameters: {
      ...valid, ['\u{10000}']: true, ['\ue000']: true,
    } },
    { id: 'missing-target-parameter', parameters: {
      sourceCityId: 'city-12', officerId: 'officer-1',
    } },
  ];
  return setups.map((setup, index) => {
    const input = createProductionSessionState(1, 1);
    const patches: StatePatch[] = (setup.patches ?? []).map((patch) => ({
      path: [...patch.path], value: patch.value,
    }));
    applyStatePatches(input as unknown as Record<string, unknown>, patches);
    const reportMode = setup.reportMode ?? 'current';
    if (reportMode !== 'none') {
      const report = buildCurrentIntelReport(input, 'city-0');
      if (reportMode === 'stale') {
        report.observedTurn = 1;
        report.observedYear = 190;
        report.observedMonth = 1;
      } else if (reportMode === 'legacy') {
        delete (report as Partial<typeof report>).officerIds;
      } else if (reportMode === 'without-target') {
        report.officerIds = report.officerIds.filter((id) => id !== 'officer-56');
        report.officerCount = report.officerIds.length;
      }
      const reportPatch: StatePatch = { path: ['intelReports', 'city-0'], value: report };
      patches.push(reportPatch);
      applyStatePatches(input as unknown as Record<string, unknown>, [reportPatch]);
    }
    const session = new OracleApplicationSession(input);
    const orderKind = setup.kind ?? 'alienate';
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb10-boundary-${String(index + 1).padStart(3, '0')}`,
      expectedStateSha256: canonicalSha256(input),
      kind: `issue_${orderKind}_order`,
      parameters: setup.parameters ?? valid,
    };
    const expected = session.execute(command);
    const { state: _stateEvidence, ...expectedCore } = expected;
    return {
      id: setup.id, campaign: { periodId: 1, rulerSourceIndex: 1 }, patches,
      inputStateSha256: canonicalSha256(input), command, expectedCore,
      expectedStateSha256: canonicalSha256(expected.state),
    };
  });
}

function buildDiplomaticOrderSettlementSequences() {
  const build = (
    id: string,
    initialPatches: StatePatch[],
    commands: Array<{ kind: string; sourceCityId: string; officerId: string; targetOfficerId: string }>,
    advancePatches: StatePatch[] = [],
    rulerSourceIndex = 1,
  ) => {
    const initialState = createProductionSessionState(1, rulerSourceIndex);
    const patches = initialPatches.map((patch) => ({
      path: [...patch.path], value: patch.value, ...(patch.remove ? { remove: true } : {}),
    }));
    applyStatePatches(initialState as unknown as Record<string, unknown>, patches);
    const reportCityId = initialState.officers[commands[0].targetOfficerId].cityId!;
    const report = buildCurrentIntelReport(initialState, reportCityId);
    const reportPatch: StatePatch = { path: ['intelReports', reportCityId], value: report };
    patches.push(reportPatch);
    applyStatePatches(initialState as unknown as Record<string, unknown>, [reportPatch]);
    const session = new OracleApplicationSession(initialState);
    const steps: Array<Record<string, unknown>> = [];
    commands.forEach((commandInput, commandIndex) => {
      const command: ApplicationCommandEnvelope = {
        commandEnvelopeVersion: 1,
        commandId: `mb10-${id}-${String(commandIndex + 1).padStart(3, '0')}`,
        expectedStateSha256: canonicalSha256(session.snapshot()),
        kind: commandInput.kind,
        parameters: {
          sourceCityId: commandInput.sourceCityId,
          officerId: commandInput.officerId,
          targetOfficerId: commandInput.targetOfficerId,
        },
      };
      const result = session.execute(command);
      if (!result.ok) throw new Error(`${id} issue ${commandIndex + 1} failed: ${result.error}`);
      const { state: _stateEvidence, ...expectedCore } = result;
      steps.push({ id: `issue-${commandIndex + 1}`, operation: 'command', command, expectedCore });
    });
    let preStateSha256 = canonicalSha256(session.snapshot());
    if (advancePatches.length > 0) {
      const patched = session.snapshot();
      applyStatePatches(patched as unknown as Record<string, unknown>, advancePatches);
      session.restoreSnapshot(patched);
      preStateSha256 = canonicalSha256(patched);
    }
    const advanced = session.advanceDiplomaticOrders();
    if (!advanced.ok) throw new Error(`${id} advance failed: ${advanced.error}`);
    const { state: _stateEvidence, ...expectedCore } = advanced;
    steps.push({
      id: 'advance', operation: 'advance', prePatches: advancePatches,
      preStateSha256, expectedCore,
    });
    return {
      id, campaign: { periodId: 1, rulerSourceIndex }, initialPatches: patches,
      initialStateSha256: canonicalSha256(initialState), initialSeed: initialState.rngSeed,
      steps, finalStateSha256: canonicalSha256(session.snapshot()),
    };
  };
  const alienate = {
    kind: 'issue_alienate_order', sourceCityId: 'city-12',
    officerId: 'officer-1', targetOfficerId: 'officer-56',
  };
  const preissuedAiInduce = () => {
    const initialState = createProductionSessionState(1, 1);
    const initialPatches: StatePatch[] = [
      { path: ['rngSeed'], value: 8 },
      { path: ['officers', 'officer-31', 'intelligence'], value: 100 },
      { path: ['officers', 'officer-10', 'intelligence'], value: 50 },
      { path: ['officers', 'officer-10', 'character'], value: 1 },
      { path: ['officers', 'officer-31', 'cityId'], value: null, remove: true },
      { path: ['diplomaticOrders'], value: {
        'diplomatic-order-1': {
          id: 'diplomatic-order-1', kind: 'induce', factionId: 'ruler-0',
          officerId: 'officer-31', sourceCityId: 'city-15', targetOfficerId: 'officer-10',
          targetFactionId: 'ruler-10', targetCityId: 'city-11', createdTurn: 1,
          createdYear: 190, createdMonth: 1, durationMonths: 1, remainingMonths: 1,
          moneyCost: 50,
        },
      } },
      { path: ['nextDiplomaticOrderSerial'], value: 2 },
      { path: ['actedOfficerIds'], value: ['officer-31'] },
    ];
    applyStatePatches(initialState as unknown as Record<string, unknown>, initialPatches);
    const session = new OracleApplicationSession(initialState);
    const preStateSha256 = canonicalSha256(initialState);
    const advanced = session.advanceDiplomaticOrders();
    if (!advanced.ok) throw new Error(`failed-induce-ai advance failed: ${advanced.error}`);
    const { state: _stateEvidence, ...expectedCore } = advanced;
    return {
      id: 'failed-induce-ai', campaign: { periodId: 1, rulerSourceIndex: 1 },
      initialPatches, initialStateSha256: preStateSha256, initialSeed: initialState.rngSeed,
      steps: [{ id: 'advance', operation: 'advance', prePatches: [], preStateSha256, expectedCore }],
      finalStateSha256: canonicalSha256(session.snapshot()),
    };
  };
  return [
    build('failed-alienate', [
      { path: ['rngSeed'], value: 1 },
      { path: ['officers', 'officer-1', 'intelligence'], value: 100 },
      { path: ['officers', 'officer-56', 'intelligence'], value: 50 },
      { path: ['officers', 'officer-56', 'loyalty'], value: 100 },
    ], [alienate]),
    build('target-moved-without-rng', [
      { path: ['rngSeed'], value: 1 },
    ], [alienate], [
      { path: ['officers', 'officer-56', 'cityId'], value: 'city-3' },
      { path: ['cities', 'city-0', 'satrapOfficerId'], value: 'officer-57' },
    ]),
    build('numeric-order-and-equipment', [
      { path: ['rngSeed'], value: 1 },
      { path: ['nextDiplomaticOrderSerial'], value: 9 },
      { path: ['items', 'item-16', 'intelligenceBonus'], value: 50 },
      { path: ['cities', 'city-12', 'hiddenItemIds'], value: ['item-20'] },
      { path: ['officers', 'officer-1', 'intelligence'], value: 30 },
      { path: ['officers', 'officer-1', 'equipmentItemIds'], value: ['item-16'] },
      { path: ['officers', 'officer-56', 'intelligence'], value: 80 },
      { path: ['officers', 'officer-56', 'loyalty'], value: 4 },
      { path: ['officers', 'officer-56', 'character'], value: 0 },
    ], [alienate, {
      kind: 'issue_alienate_order', sourceCityId: 'city-12',
      officerId: 'officer-32', targetOfficerId: 'officer-57',
    }]),
    build('source-city-lost-stable-fallback', [
      { path: ['rngSeed'], value: 1 },
      { path: ['officers', 'officer-56', 'intelligence'], value: 100 },
      { path: ['officers', 'officer-32', 'intelligence'], value: 50 },
      { path: ['officers', 'officer-32', 'loyalty'], value: 100 },
    ], [{
      kind: 'issue_alienate_order', sourceCityId: 'city-0',
      officerId: 'officer-56', targetOfficerId: 'officer-32',
    }], [
      { path: ['cities', 'city-0', 'ownerId'], value: 'ruler-1' },
      { path: ['cities', 'city-0', 'satrapOfficerId'], value: null, remove: true },
      { path: ['officers', 'officer-57', 'cityId'], value: 'city-3' },
    ], 5),
    build('counterespionage-reuses-rebel-and-liberates-captive', [
      { path: ['rngSeed'], value: 1 },
      { path: ['officers', 'officer-1', 'intelligence'], value: 100 },
      { path: ['officers', 'officer-56', 'intelligence'], value: 50 },
      { path: ['officers', 'officer-56', 'loyalty'], value: 0 },
      { path: ['officers', 'officer-56', 'character'], value: 3 },
      { path: ['factions', 'rebel-officer-56'], value: {
        id: 'rebel-officer-56', name: '韩遂军', rulerOfficerId: 'officer-56',
        color: '#123456', isPlayer: false, aiProfile: 'balanced',
      } },
      { path: ['factionOrder'], value: [
        'ruler-5', 'ruler-16', 'ruler-17', 'ruler-9', 'ruler-13', 'ruler-2', 'ruler-7',
        'ruler-11', 'ruler-0', 'ruler-10', 'ruler-1', 'ruler-6', 'ruler-18', 'ruler-8',
        'ruler-3', 'ruler-15', 'ruler-14', 'ruler-4', 'rebel-officer-56',
      ] },
      { path: ['officers', 'officer-161', 'status'], value: 'captive' },
      { path: ['officers', 'officer-161', 'factionId'], value: 'neutral' },
      { path: ['officers', 'officer-161', 'captorFactionId'], value: 'ruler-5' },
      { path: ['officers', 'officer-161', 'formerFactionId'], value: 'rebel-officer-56' },
      { path: ['officers', 'officer-161', 'troops'], value: 0 },
      { path: ['officers', 'officer-161', 'stamina'], value: 0 },
    ], [{
      kind: 'issue_counterespionage_order', sourceCityId: 'city-12',
      officerId: 'officer-1', targetOfficerId: 'officer-56',
    }]),
    build('induce-absorbs-faction-orders-and-captive', [
      { path: ['rngSeed'], value: 8 },
      { path: ['officers', 'officer-31', 'intelligence'], value: 100 },
      { path: ['officers', 'officer-10', 'intelligence'], value: 50 },
      { path: ['officers', 'officer-10', 'character'], value: 4 },
      { path: ['strategicOrders'], value: {
        'strategic-order-1': {
          id: 'strategic-order-1', kind: 'move', factionId: 'ruler-10',
          officerId: 'officer-81', sourceCityId: 'city-11', targetCityId: 'city-5',
          routeCityIds: ['city-11', 'city-5'], createdTurn: 1, createdYear: 190,
          createdMonth: 1, durationMonths: 1, remainingMonths: 1,
          cargo: { money: 0, food: 0, reserveTroops: 0 },
        },
      } },
      { path: ['nextStrategicOrderSerial'], value: 2 },
      { path: ['officers', 'officer-81', 'cityId'], value: null, remove: true },
      { path: ['actedOfficerIds'], value: ['officer-81'] },
      { path: ['officers', 'officer-110', 'status'], value: 'captive' },
      { path: ['officers', 'officer-110', 'factionId'], value: 'neutral' },
      { path: ['officers', 'officer-110', 'cityId'], value: 'city-11' },
      { path: ['officers', 'officer-110', 'captorFactionId'], value: 'ruler-10' },
      { path: ['officers', 'officer-110', 'formerFactionId'], value: 'ruler-0' },
      { path: ['officers', 'officer-110', 'troops'], value: 0 },
      { path: ['officers', 'officer-110', 'stamina'], value: 0 },
    ], [{
      kind: 'issue_induce_order', sourceCityId: 'city-15',
      officerId: 'officer-31', targetOfficerId: 'officer-10',
    }], [], 0),
    build('landless-executor-released-without-rng', [
      { path: ['rngSeed'], value: 1 },
    ], [alienate], [
      { path: ['cities', 'city-12', 'ownerId'], value: 'ruler-0' },
      { path: ['cities', 'city-12', 'satrapOfficerId'], value: null, remove: true },
      ...['officer-32', 'officer-33', 'officer-34', 'officer-35', 'officer-36', 'officer-37']
        .flatMap((officerId): StatePatch[] => [
          { path: ['officers', officerId, 'status'], value: 'free' },
          { path: ['officers', officerId, 'factionId'], value: 'neutral' },
          { path: ['officers', officerId, 'troops'], value: 0 },
          { path: ['officers', officerId, 'stamina'], value: 0 },
        ]),
    ]),
    build('failed-canvass-dialog-draw', [
      { path: ['rngSeed'], value: 1 },
      { path: ['officers', 'officer-1', 'intelligence'], value: 100 },
      { path: ['officers', 'officer-56', 'intelligence'], value: 50 },
      { path: ['officers', 'officer-56', 'loyalty'], value: 100 },
    ], [{
      kind: 'issue_canvass_order', sourceCityId: 'city-12',
      officerId: 'officer-1', targetOfficerId: 'officer-56',
    }]),
    build('failed-counterespionage-dialog-draw', [
      { path: ['rngSeed'], value: 1 },
      { path: ['officers', 'officer-1', 'intelligence'], value: 100 },
      { path: ['officers', 'officer-56', 'intelligence'], value: 50 },
      { path: ['officers', 'officer-56', 'loyalty'], value: 100 },
    ], [{
      kind: 'issue_counterespionage_order', sourceCityId: 'city-12',
      officerId: 'officer-1', targetOfficerId: 'officer-56',
    }]),
    build('failed-induce-player-dialog-draw', [
      { path: ['rngSeed'], value: 8 },
      { path: ['officers', 'officer-31', 'intelligence'], value: 100 },
      { path: ['officers', 'officer-10', 'intelligence'], value: 50 },
      { path: ['officers', 'officer-10', 'character'], value: 1 },
    ], [{
      kind: 'issue_induce_order', sourceCityId: 'city-15',
      officerId: 'officer-31', targetOfficerId: 'officer-10',
    }], [], 0),
    preissuedAiInduce(),
    build('induce-dominance-lost-without-rng', [
      { path: ['rngSeed'], value: 8 },
    ], [{
      kind: 'issue_induce_order', sourceCityId: 'city-15',
      officerId: 'officer-31', targetOfficerId: 'officer-10',
    }], [
      { path: ['cities', 'city-19', 'ownerId'], value: 'ruler-10' },
    ], 0),
    build('target-allegiance-changed-without-rng', [
      { path: ['rngSeed'], value: 1 },
    ], [alienate], [
      { path: ['officers', 'officer-56', 'status'], value: 'free' },
      { path: ['officers', 'officer-56', 'factionId'], value: 'neutral' },
      { path: ['officers', 'officer-56', 'troops'], value: 0 },
      { path: ['officers', 'officer-56', 'stamina'], value: 0 },
      { path: ['cities', 'city-0', 'satrapOfficerId'], value: 'officer-57' },
    ]),
    build('mixed-strategic-and-diplomatic-month', [
      { path: ['rngSeed'], value: 1 },
      { path: ['officers', 'officer-56', 'loyalty'], value: 100 },
      { path: ['strategicOrders'], value: {
        'strategic-order-1': {
          id: 'strategic-order-1', kind: 'move', factionId: 'ruler-5',
          officerId: 'officer-57', sourceCityId: 'city-0', targetCityId: 'city-3',
          routeCityIds: ['city-0', 'city-3'], createdTurn: 1, createdYear: 190,
          createdMonth: 1, durationMonths: 1, remainingMonths: 1,
          cargo: { money: 0, food: 0, reserveTroops: 0 },
        },
      } },
      { path: ['nextStrategicOrderSerial'], value: 2 },
      { path: ['officers', 'officer-57', 'cityId'], value: null, remove: true },
      { path: ['actedOfficerIds'], value: ['officer-57'] },
    ], [alienate]),
  ];
}

function buildReconnaissanceSequence() {
  const initialState = createProductionSessionState(1, 1);
  const initialStateSha256 = canonicalSha256(initialState);
  const initialSeed = initialState.rngSeed;
  const session = new OracleApplicationSession(initialState);
  const steps: Array<{
    id: string; prePatches: StatePatch[]; preStateSha256: string;
    command: ApplicationCommandEnvelope; expectedCore: unknown; expectedStateSha256: string;
  }> = [];
  let serial = 1;
  const apply = (id: string, officerId: string, prePatches: StatePatch[] = []) => {
    if (prePatches.length > 0) {
      const patched = session.snapshot();
      applyStatePatches(patched as unknown as Record<string, unknown>, prePatches);
      session.restoreSnapshot(patched);
    }
    const preStateSha256 = canonicalSha256(session.snapshot());
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb09-recon-${String(serial).padStart(3, '0')}`,
      expectedStateSha256: preStateSha256,
      kind: 'reconnoitre_city',
      parameters: { sourceCityId: 'city-12', targetCityId: 'city-0', officerId },
    };
    serial += 1;
    const expected = session.execute(command);
    const { state: _stateEvidence, ...expectedCore } = expected;
    steps.push({
      id, prePatches, preStateSha256, command, expectedCore,
      expectedStateSha256: canonicalSha256(expected.state),
    });
  };
  apply('classic-success', 'officer-1');
  apply('overwrite-stale-report', 'officer-32', [
    { path: ['cities', 'city-0', 'money'], value: 777 },
    { path: ['officers', 'officer-57', 'cityId'], value: 'city-3' },
  ]);
  return {
    campaign: { periodId: 1, rulerSourceIndex: 1 }, initialStateSha256, initialSeed,
    steps, finalStateSha256: canonicalSha256(session.snapshot()),
  };
}

function buildReconnaissanceBoundaryCases() {
  const cases: unknown[] = [];
  let serial = 1;
  const add = (
    id: string,
    parameters: Record<string, unknown>,
    patches: StatePatch[] = [],
  ) => {
    const input = createProductionSessionState(1, 1);
    applyStatePatches(input as unknown as Record<string, unknown>, patches);
    const session = new OracleApplicationSession(input);
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb09-boundary-${String(serial).padStart(3, '0')}`,
      expectedStateSha256: canonicalSha256(input),
      kind: 'reconnoitre_city',
      parameters,
    };
    serial += 1;
    const expected = session.execute(command);
    const { state: _stateEvidence, ...expectedCore } = expected;
    cases.push({
      id, patches, inputStateSha256: canonicalSha256(input), command, expectedCore,
      expectedStateSha256: canonicalSha256(expected.state),
    });
  };
  const valid = { sourceCityId: 'city-12', targetCityId: 'city-0', officerId: 'officer-1' };
  add('modern-success', valid, [{ path: ['rulesetId'], value: 'modern-balanced-v1' }]);
  add('unknown-source-rejected', { ...valid, sourceCityId: 'city-999' });
  add('friendly-target-rejected', { ...valid, targetCityId: 'city-12' });
  add('officer-elsewhere-rejected', { ...valid, officerId: 'officer-56' });
  add('acted-officer-rejected', valid, [{ path: ['actedOfficerIds'], value: ['officer-1'] }]);
  add('stamina-insufficient', valid, [{ path: ['officers', 'officer-1', 'stamina'], value: 9 }]);
  add('money-insufficient', valid, [{ path: ['cities', 'city-12', 'money'], value: 19 }]);
  add('target-total-troops-safe-integer-overflow', valid, [
    { path: ['officers', 'officer-56', 'troops'], value: 5_000_000_000_000_000 },
    { path: ['officers', 'officer-57', 'troops'], value: 5_000_000_000_000_000 },
  ]);
  add('stable-officer-id-ordinal-order', valid, [
    { path: ['officers', 'officer-99', 'factionId'], value: 'ruler-5' },
    { path: ['officers', 'officer-99', 'cityId'], value: 'city-0' },
    { path: ['officers', 'officer-100', 'factionId'], value: 'ruler-5' },
    { path: ['officers', 'officer-100', 'cityId'], value: 'city-0' },
  ]);
  add('sorted-unknown-parameter', {
    ...valid, ['\u{10000}']: true, ['\ue000']: true,
  });
  add('missing-target-parameter', {
    sourceCityId: 'city-12', officerId: 'officer-1',
  });
  return cases;
}

function buildReconnaissanceLegacyReportCase() {
  const state = createProductionSessionState(1, 1);
  const session = new OracleApplicationSession(state);
  const command: ApplicationCommandEnvelope = {
    commandEnvelopeVersion: 1,
    commandId: 'mb09-legacy-report-001',
    expectedStateSha256: canonicalSha256(state),
    kind: 'reconnoitre_city',
    parameters: { sourceCityId: 'city-12', targetCityId: 'city-0', officerId: 'officer-1' },
  };
  const result = session.execute(command);
  const legacy = structuredClone(result.state);
  delete legacy.intelReports['city-0'].officerIds;
  const issues = validateGameState(legacy);
  if (issues.length > 0) throw new Error(`legacy intel report must remain valid: ${issues[0].path}`);
  return { state: legacy, stateSha256: canonicalSha256(legacy) };
}

function buildStrategicLogisticsSequences() {
  const build = (
    id: string,
    seed: number,
    transportOnly = false,
    advancePatches: StatePatch[] = [],
  ) => {
    const initialState = createProductionSessionState(1, 5);
    const initialPatches: StatePatch[] = [
      { path: ['rngSeed'], value: seed },
      { path: ['cities', 'city-0', 'reserveTroops'], value: 500 },
    ];
    applyStatePatches(initialState as unknown as Record<string, unknown>, initialPatches);
    const session = new OracleApplicationSession(initialState);
    const steps: Array<{ id: string; operation: 'command' | 'advance'; command?: ApplicationCommandEnvelope; expectedCore: unknown }> = [];
    let serial = 1;
    const command = (stepId: string, kind: string, parameters: Record<string, unknown>) => {
      const envelope: ApplicationCommandEnvelope = {
        commandEnvelopeVersion: 1,
        commandId: `mb08-${id}-${String(serial).padStart(3, '0')}`,
        expectedStateSha256: canonicalSha256(session.snapshot()),
        kind,
        parameters,
      };
      serial += 1;
      const { state: _stateEvidence, ...expectedCore } = session.execute(envelope);
      steps.push({ id: stepId, operation: 'command', command: envelope, expectedCore });
    };
    const advance = (stepId: string, prePatches: StatePatch[] = []) => {
      let preStateSha256 = canonicalSha256(session.snapshot());
      if (prePatches.length > 0) {
        const patched = session.snapshot();
        applyStatePatches(patched as unknown as Record<string, unknown>, prePatches);
        session.restoreSnapshot(patched);
        preStateSha256 = canonicalSha256(patched);
      }
      const { state: _stateEvidence, ...expectedCore } = session.advanceStrategicOrders();
      steps.push({ id: stepId, operation: 'advance', prePatches, preStateSha256, expectedCore } as typeof steps[number]);
    };
    if (!transportOnly) {
      command('issue-multihop-move', 'issue_move_order', {
        sourceCityId: 'city-0', targetCityId: 'city-8', officerId: 'officer-56',
      });
      advance('move-month-1');
      advance('move-arrival');
    }
    command(transportOnly ? 'issue-loss-transport' : 'issue-success-transport', 'issue_transport_order', {
      sourceCityId: 'city-0', targetCityId: 'city-3', officerId: transportOnly ? 'officer-56' : 'officer-57',
      cargo: { money: 10, food: 20, reserveTroops: 30 },
    });
    advance(transportOnly ? `transport-${id}` : 'transport-success', advancePatches);
    return {
      id,
      campaign: { periodId: 1, rulerSourceIndex: 5 },
      initialPatches,
      initialStateSha256: canonicalSha256(initialState),
      steps,
      finalStateSha256: canonicalSha256(session.snapshot()),
    };
  };
  const targetCapturedPatches: StatePatch[] = [
    { path: ['cities', 'city-3', 'ownerId'], value: 'ruler-0' },
    { path: ['cities', 'city-3', 'satrapOfficerId'], value: 'officer-19' },
    { path: ['officers', 'officer-19', 'cityId'], value: 'city-3' },
    { path: ['officers', 'officer-64', 'cityId'], value: 'city-8' },
  ];
  const noMoneySettlementPatches: StatePatch[] = Object.keys(createProductionSessionState(1, 5).cities)
    .map((cityId) => ({ path: ['cities', cityId, 'money'], value: Number.MAX_SAFE_INTEGER }));
  const splitSettlementPatches: StatePatch[] = [];
  for (const cityId of Object.keys(createProductionSessionState(1, 5).cities)) {
    if (cityId !== 'city-0') splitSettlementPatches.push({ path: ['cities', cityId, 'money'], value: Number.MAX_SAFE_INTEGER });
    if (cityId !== 'city-3') splitSettlementPatches.push({ path: ['cities', cityId, 'food'], value: Number.MAX_SAFE_INTEGER });
    if (cityId !== 'city-8') splitSettlementPatches.push({ path: ['cities', cityId, 'reserveTroops'], value: Number.MAX_SAFE_INTEGER });
  }
  const sourceLostPatches: StatePatch[] = [
    { path: ['cities', 'city-0', 'ownerId'], value: 'ruler-0' },
    { path: ['cities', 'city-0', 'satrapOfficerId'], value: 'officer-19' },
    { path: ['officers', 'officer-19', 'cityId'], value: 'city-0' },
    { path: ['officers', 'officer-57', 'cityId'], value: 'city-3' },
  ];
  const buildMultiOrder = () => {
    const initialState = createProductionSessionState(1, 5);
    const initialPatches: StatePatch[] = [{ path: ['cities', 'city-8', 'reserveTroops'], value: 500 }];
    applyStatePatches(initialState as unknown as Record<string, unknown>, initialPatches);
    const session = new OracleApplicationSession(initialState);
    const steps: Array<{ id: string; operation: 'command' | 'advance'; command?: ApplicationCommandEnvelope; expectedCore: unknown }> = [];
    for (const [index, officerId, cargo] of [
      [1, 'officer-58', { money: 11, food: 21, reserveTroops: 31 }],
      [2, 'officer-60', { money: 12, food: 22, reserveTroops: 32 }],
    ] as const) {
      const command: ApplicationCommandEnvelope = {
        commandEnvelopeVersion: 1,
        commandId: `mb08-multi-${index}`,
        expectedStateSha256: canonicalSha256(session.snapshot()),
        kind: 'issue_transport_order',
        parameters: { sourceCityId: 'city-8', targetCityId: 'city-3', officerId, cargo },
      };
      const { state: _stateEvidence, ...expectedCore } = session.execute(command);
      steps.push({ id: `issue-transport-${index}`, operation: 'command', command, expectedCore });
    }
    // Rename the two valid orders to 2 and 10 so the fixture distinguishes the
    // constrained-ASCII ordinal contract (10 before 2) from numeric sorting.
    const beforeAdvance = session.snapshot();
    const firstOrder = { ...beforeAdvance.strategicOrders['strategic-order-1'], id: 'strategic-order-2' };
    const secondOrder = { ...beforeAdvance.strategicOrders['strategic-order-2'], id: 'strategic-order-10' };
    const prePatches: StatePatch[] = [
      { path: ['strategicOrders'], value: { 'strategic-order-2': firstOrder, 'strategic-order-10': secondOrder } },
      { path: ['nextStrategicOrderSerial'], value: 11 },
    ];
    applyStatePatches(beforeAdvance as unknown as Record<string, unknown>, prePatches);
    session.restoreSnapshot(beforeAdvance);
    const preStateSha256 = canonicalSha256(beforeAdvance);
    const { state: _stateEvidence, ...expectedCore } = session.advanceStrategicOrders();
    steps.push({ id: 'advance-stable-order-ids', operation: 'advance', prePatches, preStateSha256, expectedCore } as typeof steps[number]);
    return {
      id: 'multi-order', campaign: { periodId: 1, rulerSourceIndex: 5 },
      initialPatches, initialStateSha256: canonicalSha256(initialState), steps,
      finalStateSha256: canonicalSha256(session.snapshot()),
    };
  };
  const buildLandless = () => {
    const initialState = createProductionSessionState(1, 5);
    const initialPatches: StatePatch[] = [{ path: ['cities', 'city-8', 'reserveTroops'], value: 500 }];
    applyStatePatches(initialState as unknown as Record<string, unknown>, initialPatches);
    const session = new OracleApplicationSession(initialState);
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1, commandId: 'mb08-landless-001',
      expectedStateSha256: canonicalSha256(session.snapshot()), kind: 'issue_transport_order',
      parameters: {
        sourceCityId: 'city-8', targetCityId: 'city-3', officerId: 'officer-5',
        cargo: { money: 10, food: 20, reserveTroops: 30 },
      },
    };
    const issued = session.execute(command);
    const { state: _issuedState, ...issuedCore } = issued;
    const prePatches: StatePatch[] = [
      ...[['city-0', 'officer-19'], ['city-3', 'officer-20'], ['city-8', 'officer-21']]
        .flatMap(([cityId, satrapOfficerId]) => [
          { path: ['cities', cityId, 'ownerId'], value: 'ruler-0' },
          { path: ['cities', cityId, 'satrapOfficerId'], value: satrapOfficerId },
          { path: ['officers', satrapOfficerId, 'cityId'], value: cityId },
        ] as StatePatch[]),
      ...['officer-56', 'officer-57', 'officer-58', 'officer-60', 'officer-61', 'officer-62', 'officer-63', 'officer-64', 'officer-65', 'officer-66']
        .map((officerId) => ({ path: ['officers', officerId, 'factionId'], value: 'ruler-0' })),
    ];
    const beforeAdvance = session.snapshot();
    applyStatePatches(beforeAdvance as unknown as Record<string, unknown>, prePatches);
    session.restoreSnapshot(beforeAdvance);
    const preStateSha256 = canonicalSha256(beforeAdvance);
    const { state: _advancedState, ...advancedCore } = session.advanceStrategicOrders();
    return {
      id: 'landless-ruler-transport', campaign: { periodId: 1, rulerSourceIndex: 5 },
      initialPatches, initialStateSha256: canonicalSha256(initialState),
      steps: [
        { id: 'issue-landless-ruler-transport', operation: 'command', command, expectedCore: issuedCore },
        { id: 'advance-landless-ruler-transport', operation: 'advance', prePatches, preStateSha256, expectedCore: advancedCore },
      ],
      finalStateSha256: canonicalSha256(session.snapshot()),
    };
  };
  return [
    build('success', 0),
    build('loss', 1_972, true),
    build('target-full', 48_641, true, [{ path: ['cities', 'city-3', 'money'], value: Number.MAX_SAFE_INTEGER }]),
    build('target-captured', 48_641, true, targetCapturedPatches),
    build('source-lost', 0, true, sourceLostPatches),
    build('split-cargo', 48_641, true, splitSettlementPatches),
    build('unsettleable-cargo', 48_641, true, noMoneySettlementPatches),
    buildMultiOrder(),
    buildLandless(),
  ];
}

function buildStrategicLogisticsBoundaryCases() {
  const cases: unknown[] = [];
  let serial = 1;
  const add = (
    id: string,
    kind: string,
    parameters: Record<string, unknown>,
    patches: StatePatch[] = [],
  ) => {
    const input = createProductionSessionState(1, 5);
    applyStatePatches(input as unknown as Record<string, unknown>, patches);
    const session = new OracleApplicationSession(input);
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb08-boundary-${String(serial).padStart(3, '0')}`,
      expectedStateSha256: canonicalSha256(input),
      kind,
      parameters,
    };
    serial += 1;
    const expected = session.execute(command);
    const { state: _stateEvidence, ...expectedCore } = expected;
    cases.push({ id, campaign: { periodId: 1, rulerSourceIndex: 5 }, patches, command, expectedCore, expectedStateSha256: canonicalSha256(expected.state) });
  };
  const directRoute: StatePatch[] = [
    { path: ['cities', 'city-0', 'reserveTroops'], value: 100 },
  ];
  add('non-owned-target', 'issue_move_order', {
    sourceCityId: 'city-0', targetCityId: 'city-9', officerId: 'officer-56',
  });
  add('negative-cargo', 'issue_transport_order', {
    sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56',
    cargo: { money: -1, food: 0, reserveTroops: 0 },
  }, directRoute);
  add('fractional-cargo', 'issue_transport_order', {
    sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56',
    cargo: { money: 0.5, food: 0, reserveTroops: 0 },
  }, directRoute);
  add('empty-cargo', 'issue_transport_order', {
    sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56',
    cargo: { money: 0, food: 0, reserveTroops: 0 },
  }, directRoute);
  add('insufficient-cargo', 'issue_transport_order', {
    sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56',
    cargo: { money: 203, food: 0, reserveTroops: 0 },
  }, directRoute);
  add('extra-cargo-field', 'issue_transport_order', {
    sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56',
    cargo: { money: 1, food: 0, reserveTroops: 0, gems: 1 },
  }, directRoute);
  add('target-safe-integer-overflow', 'issue_transport_order', {
    sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56',
    cargo: { money: 1, food: 0, reserveTroops: 0 },
  }, [...directRoute, { path: ['cities', 'city-3', 'money'], value: Number.MAX_SAFE_INTEGER }]);
  add('acted-officer', 'issue_move_order', {
    sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56',
  }, [...directRoute, { path: ['actedOfficerIds'], value: ['officer-56'] }]);
  add('stamina-insufficient', 'issue_transport_order', {
    sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56',
    cargo: { money: 1, food: 0, reserveTroops: 0 },
  }, [...directRoute, { path: ['officers', 'officer-56', 'stamina'], value: 7 }]);
  add('no-owned-route', 'issue_move_order', {
    sourceCityId: 'city-0', targetCityId: 'city-8', officerId: 'officer-56',
  }, [
    { path: ['cities', 'city-3', 'ownerId'], value: 'ruler-0' },
    { path: ['cities', 'city-3', 'satrapOfficerId'], value: 'officer-19' },
    { path: ['officers', 'officer-19', 'cityId'], value: 'city-3' },
    { path: ['officers', 'officer-64', 'cityId'], value: 'city-8' },
  ]);
  return cases;
}

function buildStrategicRouteCases() {
  const equalRoute = createProductionSessionState(3, 4);
  const disconnected = createProductionSessionState(1, 5);
  disconnected.cities['city-3'].ownerId = 'ruler-0';
  return [
    {
      id: 'equal-length-route-uses-ordinal-neighbor-order',
      campaign: { periodId: 3, rulerSourceIndex: 4 }, ownershipPatches: [],
      factionId: 'ruler-4', sourceCityId: 'city-1', targetCityId: 'city-11',
      expectedRouteCityIds: findOwnedCityRoute(equalRoute, 'ruler-4', 'city-1', 'city-11') ?? [],
    },
    {
      id: 'owned-endpoints-with-hostile-cut-have-no-route',
      campaign: { periodId: 1, rulerSourceIndex: 5 },
      ownershipPatches: [{ cityId: 'city-3', ownerId: 'ruler-0' }],
      factionId: 'ruler-5', sourceCityId: 'city-0', targetCityId: 'city-8',
      expectedRouteCityIds: findOwnedCityRoute(disconnected, 'ruler-5', 'city-0', 'city-8') ?? [],
    },
  ];
}

function buildStrategicLifecycleCases() {
  const build = (id: string, prePatches: StatePatch[], cargo: { money: number; food: number; reserveTroops: number }) => {
    const initialState = createProductionSessionState(1, 5);
    const session = new OracleApplicationSession(initialState);
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1, commandId: `mb08-lifecycle-${id}`,
      expectedStateSha256: canonicalSha256(session.snapshot()), kind: 'issue_transport_order',
      parameters: { sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56', cargo },
    };
    const issued = session.execute(command);
    if (!issued.ok) throw new Error(`failed to build strategic lifecycle case: ${id}`);
    const cancellationInput = session.snapshot();
    applyStatePatches(cancellationInput as unknown as Record<string, unknown>, prePatches);
    const expected = cancelOfficerOrders(cancellationInput, 'officer-56');
    return {
      id, campaign: { periodId: 1, rulerSourceIndex: 5 }, command, prePatches,
      cancellationInputSha256: canonicalSha256(cancellationInput),
      expectedStateSha256: canonicalSha256(expected),
      expectedLog: expected.logs.at(-1)?.message ?? '',
    };
  };
  return [
    build('source-lost-prefers-source-salvage', [
      { path: ['cities', 'city-0', 'ownerId'], value: 'ruler-0' },
      { path: ['cities', 'city-0', 'satrapOfficerId'], value: 'officer-19' },
      { path: ['officers', 'officer-19', 'cityId'], value: 'city-0' },
      { path: ['officers', 'officer-57', 'cityId'], value: 'city-3' },
    ], { money: 10, food: 20, reserveTroops: 0 }),
    build('source-index-salvage-order', [
      ...['city-0', 'city-1', 'city-3', 'city-8']
        .map((cityId) => ({ path: ['cities', cityId, 'money'], value: Number.MAX_SAFE_INTEGER })),
    ], { money: 10, food: 0, reserveTroops: 0 }),
  ];
}

function buildPersonnelLifecycleSequence() {
  const initialState = createProductionSessionState(1, 1);
  const initialPatches: StatePatch[] = [
    { path: ['discoveredOfficerIds'], value: ['officer-126'] },
    ...captivePatches('officer-30', 0),
    { path: ['officers', 'officer-33', 'intelligence'], value: 255 },
  ];
  applyStatePatches(initialState as unknown as Record<string, unknown>, initialPatches);
  const session = new OracleApplicationSession(initialState);
  const steps: { id: string; command: ApplicationCommandEnvelope; expectedCore: unknown }[] = [];
  let serial = 1;
  const apply = (id: string, kind: string, parameters: Record<string, unknown>) => {
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb07-${String(serial).padStart(4, '0')}`,
      expectedStateSha256: canonicalSha256(session.snapshot()),
      kind,
      parameters,
    };
    serial += 1;
    const { state: _stateEvidence, ...expectedCore } = session.execute(command);
    steps.push({ id, command, expectedCore });
  };
  apply('explicit-recruit-attempt', 'recruit_free_officer', {
    cityId: 'city-12', executorOfficerId: 'officer-1', targetOfficerId: 'officer-126',
  });
  apply('search-real-city', 'search_city', { cityId: 'city-12', officerId: 'officer-32' });
  apply('captive-surrender-success', 'recruit_captive', {
    cityId: 'city-12', executorOfficerId: 'officer-33', captiveOfficerId: 'officer-30',
  });
  apply('banish-recruited-captive', 'banish_officer', {
    cityId: 'city-12', officerId: 'officer-30',
  });
  return {
    initialPatches,
    initialStateSha256: canonicalSha256(initialState),
    steps,
    finalStateSha256: canonicalSha256(session.snapshot()),
  };
}

function buildPersonnelLifecycleBoundaryCases() {
  const cases: unknown[] = [];
  let serial = 1;
  const add = (
    id: string,
    kind: string,
    parameters: Record<string, unknown>,
    patches: StatePatch[],
  ) => {
    const input = createProductionSessionState(1, 1);
    applyStatePatches(input as unknown as Record<string, unknown>, patches);
    const session = new OracleApplicationSession(input);
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb07-boundary-${String(serial).padStart(3, '0')}`,
      expectedStateSha256: canonicalSha256(input),
      kind,
      parameters,
    };
    serial += 1;
    const expected = session.execute(command);
    const { state: _stateEvidence, ...expectedCore } = expected;
    cases.push({ id, patches, command, expectedCore, expectedStateSha256: canonicalSha256(expected.state) });
  };
  add('search-direct-recruit-branch', 'search_city', {
    cityId: 'city-12', officerId: 'officer-1',
  }, [{ path: ['rngSeed'], value: 43 }]);
  add('search-hidden-item-branch', 'search_city', {
    cityId: 'city-12', officerId: 'officer-1',
  }, [{ path: ['rngSeed'], value: 42 }]);
  add('search-no-result-branch', 'search_city', {
    cityId: 'city-12', officerId: 'officer-1',
  }, [{ path: ['rngSeed'], value: 1 }]);
  add('search-food-branch', 'search_city', {
    cityId: 'city-12', officerId: 'officer-1',
  }, [{ path: ['rngSeed'], value: 1327 }]);
  add('search-discovery-recruit-failure', 'search_city', {
    cityId: 'city-12', officerId: 'officer-1',
  }, [
    { path: ['rngSeed'], value: 53 },
    { path: ['officers', 'officer-1', 'intelligence'], value: 20 },
  ]);
  add('search-money-soft-cap', 'search_city', {
    cityId: 'city-12', officerId: 'officer-1',
  }, [
    { path: ['rngSeed'], value: 682 },
    { path: ['cities', 'city-12', 'money'], value: 30_000 },
  ]);
  add('explicit-recruit-failure', 'recruit_free_officer', {
    cityId: 'city-12', executorOfficerId: 'officer-1', targetOfficerId: 'officer-126',
  }, [
    { path: ['discoveredOfficerIds'], value: ['officer-126'] },
    { path: ['officers', 'officer-1', 'intelligence'], value: 0 },
    { path: ['rngSeed'], value: 1 },
  ]);
  add('surrender-intelligence-gate-failure', 'recruit_captive', {
    cityId: 'city-12', executorOfficerId: 'officer-32', captiveOfficerId: 'officer-30',
  }, [
    ...captivePatches('officer-30', 50),
    { path: ['officers', 'officer-32', 'intelligence'], value: 0 },
    { path: ['officers', 'officer-30', 'intelligence'], value: 255 },
  ]);
  add('surrender-high-loyalty-reduction', 'recruit_captive', {
    cityId: 'city-12', executorOfficerId: 'officer-32', captiveOfficerId: 'officer-30',
  }, [
    ...captivePatches('officer-30', 90),
    { path: ['officers', 'officer-32', 'intelligence'], value: 255 },
    { path: ['officers', 'officer-30', 'intelligence'], value: 0 },
  ]);
  add('surrender-effective-intelligence-equipment-flip', 'recruit_captive', {
    cityId: 'city-12', executorOfficerId: 'officer-32', captiveOfficerId: 'officer-30',
  }, [
    ...captivePatches('officer-30', 90),
    { path: ['rngSeed'], value: 707 },
    { path: ['officers', 'officer-32', 'intelligence'], value: 50 },
    { path: ['officers', 'officer-30', 'intelligence'], value: 50 },
    { path: ['officers', 'officer-4', 'equipmentItemIds'], value: ['item-10'] },
    { path: ['officers', 'officer-32', 'equipmentItemIds'], value: ['item-13'] },
  ]);
  add('surrender-character-resistance-two-draw-failure', 'recruit_captive', {
    cityId: 'city-12', executorOfficerId: 'officer-32', captiveOfficerId: 'officer-30',
  }, [
    ...captivePatches('officer-30', 60),
    { path: ['rngSeed'], value: 1 },
    { path: ['officers', 'officer-32', 'intelligence'], value: 255 },
    { path: ['officers', 'officer-30', 'intelligence'], value: 0 },
    { path: ['officers', 'officer-30', 'character'], value: 4 },
  ]);
  add('modern-surrender-cost', 'recruit_captive', {
    cityId: 'city-12', executorOfficerId: 'officer-32', captiveOfficerId: 'officer-30',
  }, [
    ...captivePatches('officer-30', 0),
    { path: ['rulesetId'], value: 'modern-balanced-v1' },
    { path: ['officers', 'officer-32', 'intelligence'], value: 255 },
  ]);
  add('release-captive', 'release_captive', {
    cityId: 'city-12', captiveOfficerId: 'officer-30',
  }, captivePatches('officer-30', 50));
  add('execute-equipped-captive', 'execute_captive', {
    cityId: 'city-12', captiveOfficerId: 'officer-20',
  }, captivePatches('officer-20', 95));
  add('banish-captive-stable-destination', 'banish_officer', {
    cityId: 'city-12', officerId: 'officer-30',
  }, [...captivePatches('officer-30', 35), { path: ['rngSeed'], value: 1 }]);
  add('banish-manual-satrap-repairs-city', 'banish_officer', {
    cityId: 'city-12', officerId: 'officer-32',
  }, [
    { path: ['rulesetId'], value: 'modern-balanced-v1' },
    { path: ['cities', 'city-12', 'satrapOfficerId'], value: 'officer-32' },
    { path: ['rngSeed'], value: 1 },
  ]);
  add('confiscate-non-ruler-equipment', 'confiscate_equipment', {
    cityId: 'city-12', officerId: 'officer-34', itemId: 'item-16',
  }, equipmentPatches('officer-34', 'item-16'));
  add('confiscate-player-ruler-preserves-seed', 'confiscate_equipment', {
    cityId: 'city-12', officerId: 'officer-1', itemId: 'item-16',
  }, equipmentPatches('officer-1', 'item-16'));
  add('ruler-banish-rejected', 'banish_officer', {
    cityId: 'city-12', officerId: 'officer-1',
  }, []);
  add('sorted-personnel-parameter-error', 'recruit_captive', {
    cityId: 'city-12', executorOfficerId: 'officer-32', captiveOfficerId: 'officer-30',
    ['\u{10000}']: true, ['\ue000']: true,
  }, []);
  add('missing-captive-precedes-blank-city', 'recruit_captive', {
    cityId: '', executorOfficerId: 'officer-32',
  }, []);
  return cases;
}

function captivePatches(officerId: string, loyalty: number): StatePatch[] {
  const initial = createProductionSessionState(1, 1).officers[officerId];
  return [
    { path: ['officers', officerId, 'status'], value: 'captive' },
    { path: ['officers', officerId, 'factionId'], value: 'neutral' },
    { path: ['officers', officerId, 'cityId'], value: 'city-12' },
    { path: ['officers', officerId, 'captorFactionId'], value: 'ruler-1' },
    { path: ['officers', officerId, 'formerFactionId'], value: initial.factionId },
    { path: ['officers', officerId, 'loyalty'], value: loyalty },
    { path: ['officers', officerId, 'troops'], value: 0 },
    { path: ['officers', officerId, 'stamina'], value: 0 },
  ];
}

function equipmentPatches(officerId: string, itemId: string): StatePatch[] {
  const state = createProductionSessionState(1, 1);
  return [
    {
      path: ['cities', 'city-12', 'hiddenItemIds'],
      value: (state.cities['city-12'].hiddenItemIds ?? []).filter((candidate) => candidate !== itemId),
    },
    { path: ['officers', officerId, 'equipmentItemIds'], value: [itemId] },
  ];
}

function buildOfficerManagementSequence() {
  const initialState = createProductionSessionState(1, 1);
  const initialPatches: StatePatch[] = [
    { path: ['cities', 'city-12', 'itemIds'], value: ['item-16', 'item-32'] },
    { path: ['cities', 'city-12', 'hiddenItemIds'], value: ['item-20'] },
    { path: ['cities', 'city-2', 'hiddenItemIds'], value: [] },
  ];
  applyStatePatches(initialState as unknown as Record<string, unknown>, initialPatches);
  const session = new OracleApplicationSession(initialState);
  const steps: { id: string; command: ApplicationCommandEnvelope; expectedCore: unknown }[] = [];
  let serial = 1;
  const apply = (id: string, kind: string, parameters: Record<string, unknown>) => {
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb06-${String(serial).padStart(4, '0')}`,
      expectedStateSha256: canonicalSha256(session.snapshot()),
      kind,
      parameters,
    };
    serial += 1;
    const { state: _stateEvidence, ...expectedCore } = session.execute(command);
    steps.push({ id, command, expectedCore });
  };
  apply('reward-success', 'reward_officer', { cityId: 'city-12', officerId: 'officer-34' });
  apply('give-normal-item-success', 'give_item', {
    cityId: 'city-12', officerId: 'officer-34', itemId: 'item-16',
  });
  apply('unequip-success', 'unequip_item', {
    cityId: 'city-12', officerId: 'officer-34', itemId: 'item-16',
  });
  apply('give-arms-token-success', 'give_item', {
    cityId: 'city-12', officerId: 'officer-36', itemId: 'item-32',
  });
  apply('classic-appointment-rejected', 'appoint_satrap', {
    cityId: 'city-12', officerId: 'officer-32',
  });
  apply('ruler-reward-rejected', 'reward_officer', {
    cityId: 'city-12', officerId: 'officer-1',
  });
  return {
    initialPatches,
    initialStateSha256: canonicalSha256(initialState),
    steps,
    finalStateSha256: canonicalSha256(session.snapshot()),
  };
}

function buildOfficerManagementBoundaryCases() {
  const cases: unknown[] = [];
  let serial = 1;
  const add = (
    id: string,
    kind: string,
    parameters: Record<string, unknown>,
    patches: StatePatch[],
  ) => {
    const input = createProductionSessionState(1, 1);
    applyStatePatches(input as unknown as Record<string, unknown>, patches);
    const session = new OracleApplicationSession(input);
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb06-boundary-${String(serial).padStart(3, '0')}`,
      expectedStateSha256: canonicalSha256(input),
      kind,
      parameters,
    };
    serial += 1;
    const expected = session.execute(command);
    const { state: _stateEvidence, ...expectedCore } = expected;
    cases.push({ id, patches, command, expectedCore, expectedStateSha256: canonicalSha256(expected.state) });
  };
  add('modern-appointment-success', 'appoint_satrap', {
    cityId: 'city-12', officerId: 'officer-32',
  }, [{ path: ['rulesetId'], value: 'modern-balanced-v1' }]);
  add('reward-loyalty-cap', 'reward_officer', {
    cityId: 'city-12', officerId: 'officer-34',
  }, [{ path: ['officers', 'officer-34', 'loyalty'], value: 97 }]);
  add('reward-money-rejected-before-officer', 'reward_officer', {
    cityId: 'city-12', officerId: 'unknown-officer',
  }, [{ path: ['cities', 'city-12', 'money'], value: 0 }]);
  add('ruler-give-preserves-loyalty', 'give_item', {
    cityId: 'city-12', officerId: 'officer-1', itemId: 'item-16',
  }, [
    { path: ['cities', 'city-12', 'itemIds'], value: ['item-16'] },
    { path: ['cities', 'city-12', 'hiddenItemIds'], value: ['item-20'] },
  ]);
  add('elite-token-threshold-rejected', 'give_item', {
    cityId: 'city-12', officerId: 'officer-32', itemId: 'item-30',
  }, [
    { path: ['cities', 'city-12', 'itemIds'], value: ['item-30'] },
    { path: ['cities', 'city-9', 'hiddenItemIds'], value: [] },
  ]);
  add('elite-token-success', 'give_item', {
    cityId: 'city-12', officerId: 'officer-32', itemId: 'item-30',
  }, [
    { path: ['cities', 'city-12', 'itemIds'], value: ['item-30'] },
    { path: ['cities', 'city-9', 'hiddenItemIds'], value: [] },
    { path: ['cities', 'city-16', 'hiddenItemIds'], value: ['item-8', 'item-12'] },
    { path: ['officers', 'officer-32', 'force'], value: 100 },
    { path: ['officers', 'officer-32', 'equipmentItemIds'], value: ['item-7'] },
  ]);
  add('mystic-token-threshold-rejected', 'give_item', {
    cityId: 'city-12', officerId: 'officer-34', itemId: 'item-31',
  }, [
    { path: ['cities', 'city-12', 'itemIds'], value: ['item-31'] },
    { path: ['cities', 'city-1', 'hiddenItemIds'], value: [] },
  ]);
  add('mystic-token-success', 'give_item', {
    cityId: 'city-12', officerId: 'officer-34', itemId: 'item-31',
  }, [
    { path: ['cities', 'city-12', 'itemIds'], value: ['item-31'] },
    { path: ['cities', 'city-1', 'hiddenItemIds'], value: [] },
    { path: ['cities', 'city-17', 'hiddenItemIds'], value: ['item-15'] },
    { path: ['officers', 'officer-34', 'intelligence'], value: 100 },
    { path: ['officers', 'officer-34', 'equipmentItemIds'], value: ['item-11'] },
  ]);
  add('arms-token-full-slots-rejected', 'give_item', {
    cityId: 'city-12', officerId: 'officer-32', itemId: 'item-32',
  }, [
    { path: ['cities', 'city-12', 'itemIds'], value: ['item-32'] },
    { path: ['cities', 'city-12', 'hiddenItemIds'], value: [] },
    { path: ['cities', 'city-2', 'hiddenItemIds'], value: [] },
    { path: ['officers', 'officer-32', 'equipmentItemIds'], value: ['item-16', 'item-20'] },
  ]);
  add('ordered-unequip-success', 'unequip_item', {
    cityId: 'city-12', officerId: 'officer-32', itemId: 'item-16',
  }, [
    { path: ['cities', 'city-12', 'hiddenItemIds'], value: [] },
    { path: ['officers', 'officer-32', 'equipmentItemIds'], value: ['item-16', 'item-20'] },
  ]);
  add('unequip-missing-item-rejected', 'unequip_item', {
    cityId: 'city-12', officerId: 'officer-32', itemId: 'item-16',
  }, []);
  add('sorted-officer-parameter-error', 'give_item', {
    cityId: 'city-12', officerId: 'officer-32', itemId: 'item-16',
    ['\u{10000}']: true, ['\ue000']: true,
  }, []);
  add('missing-item-precedes-blank-city', 'give_item', {
    cityId: '', officerId: 'officer-32',
  }, []);
  return cases;
}

type StatePatch = { path: string[]; value: unknown; remove?: boolean };

function buildInternalAffairsBoundaryCases() {
  const base = createProductionSessionState(1, 1);
  const city = base.cities['city-12'];
  const hiddenWithoutItem16 = (city.hiddenItemIds ?? []).filter((id) => id !== 'item-16');
  const cases: unknown[] = [];
  let serial = 1;
  const add = (
    id: string,
    kind: string,
    parameters: Record<string, unknown>,
    patches: StatePatch[],
  ) => {
    const input = createProductionSessionState(1, 1);
    applyStatePatches(input as unknown as Record<string, unknown>, patches);
    const session = new OracleApplicationSession(input);
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb05-boundary-${String(serial).padStart(3, '0')}`,
      expectedStateSha256: canonicalSha256(input),
      kind,
      parameters,
    };
    serial += 1;
    const expected = session.execute(command);
    const { state: _stateEvidence, ...expectedCore } = expected;
    cases.push({ id, patches, command, expectedCore, expectedStateSha256: canonicalSha256(expected.state) });
  };
  add('farming-limit-rejected', 'develop_farming', { cityId: 'city-12', officerId: 'officer-1' }, [
    { path: ['cities', 'city-12', 'farming'], value: city.farmingLimit },
  ]);
  add('commerce-limit-rejected', 'develop_commerce', { cityId: 'city-12', officerId: 'officer-1' }, [
    { path: ['cities', 'city-12', 'commerce'], value: city.commerceLimit },
  ]);
  add('govern-abnormal-city', 'govern_city', { cityId: 'city-12', officerId: 'officer-1' }, [
    { path: ['cities', 'city-12', 'condition'], value: 'flood' },
    { path: ['cities', 'city-12', 'disasterPrevention'], value: 100 },
  ]);
  add('inspect-both-limits-rejected', 'inspect_city', { cityId: 'city-12', officerId: 'officer-1' }, [
    { path: ['cities', 'city-12', 'publicLoyalty'], value: 100 },
    { path: ['cities', 'city-12', 'population'], value: city.populationLimit },
  ]);
  add('commerce-equipped-intelligence', 'develop_commerce', { cityId: 'city-12', officerId: 'officer-1' }, [
    { path: ['cities', 'city-12', 'hiddenItemIds'], value: hiddenWithoutItem16 },
    { path: ['officers', 'officer-1', 'equipmentItemIds'], value: ['item-16'] },
  ]);
  add('banquet-ruler-full-rejected', 'banquet_officer', { cityId: 'city-12', targetOfficerId: 'officer-1' }, []);
  add('plunder-resource-caps', 'plunder_city', { cityId: 'city-12', officerId: 'officer-1' }, [
    { path: ['cities', 'city-12', 'money'], value: 30_000 },
    { path: ['cities', 'city-12', 'food'], value: 30_000 },
  ]);
  for (const [id, kind, parameters] of [
    ['modern-inspect-cost', 'inspect_city', { cityId: 'city-12', officerId: 'officer-1' }],
    ['modern-trade-cost', 'trade_food', { cityId: 'city-12', officerId: 'officer-1', direction: 'sell', amount: 1 }],
    ['modern-banquet-cost', 'banquet_officer', { cityId: 'city-12', targetOfficerId: 'officer-36' }],
    ['modern-plunder-cost', 'plunder_city', { cityId: 'city-12', officerId: 'officer-1' }],
  ] as const) {
    add(id, kind, parameters, [{ path: ['rulesetId'], value: 'modern-balanced-v1' }]);
  }
  return cases;
}

function buildValidationCases() {
  const reconInput = createProductionSessionState(1, 1);
  const reconSession = new OracleApplicationSession(reconInput);
  const reconResult = reconSession.execute({
    commandEnvelopeVersion: 1,
    commandId: 'mb09-validation-report',
    expectedStateSha256: canonicalSha256(reconInput),
    kind: 'reconnoitre_city',
    parameters: { sourceCityId: 'city-12', targetCityId: 'city-0', officerId: 'officer-1' },
  });
  const validReport = structuredClone(reconResult.state.intelReports['city-0']);
  const missingRequiredReport = structuredClone(validReport) as Partial<typeof validReport>;
  delete missingRequiredReport.population;
  const validOrder = {
    id: 'strategic-order-1', kind: 'transport', factionId: 'ruler-5', officerId: 'officer-56',
    sourceCityId: 'city-0', targetCityId: 'city-3', routeCityIds: ['city-0', 'city-3'],
    createdTurn: 1, createdYear: 190, createdMonth: 1, durationMonths: 1, remainingMonths: 1,
    cargo: { money: 1, food: 0, reserveTroops: 0 },
  };
  const validDiplomaticOrder = {
    id: 'diplomatic-order-1', kind: 'alienate', factionId: 'ruler-1', officerId: 'officer-1',
    sourceCityId: 'city-12', targetOfficerId: 'officer-56', targetFactionId: 'ruler-5',
    targetCityId: 'city-0', createdTurn: 1, createdYear: 190, createdMonth: 1,
    durationMonths: 1, remainingMonths: 1, moneyCost: 50,
  };
  const successionBase = createProductionSessionState(1, 1);
  const validSuccession = jsonClean(killOfficer(structuredClone(successionBase), {
    officerId: 'officer-1', cause: 'natural-death', cityId: 'city-12',
  }));
  const validSuccessionPatches = collectStatePatches(
    successionBase as unknown as Record<string, unknown>,
    validSuccession as unknown as Record<string, unknown>,
  );
  return [
    {
      id: 'unsafe-city-money',
      patches: [{ path: ['cities', 'city-12', 'money'], value: '9007199254740992' }],
      expectedPath: 'cities.city-12.money',
      expectedMessage: 'must be a non-negative safe integer',
    },
    {
      id: 'malformed-city-record-does-not-crash-validator',
      patches: [{ path: ['cities', 'city-0'], value: 'malformed' }],
      expectedPath: 'cities.city-0',
      expectedMessage: 'must be an object',
    },
    {
      id: 'captive-former-faction-cannot-be-captor',
      patches: [
        ...captivePatches('officer-30', 35),
        { path: ['officers', 'officer-30', 'formerFactionId'], value: 'ruler-1' },
      ],
      expectedPath: 'officers.officer-30.formerFactionId',
      expectedMessage: 'captive officer cannot be held by their former faction',
    },
    {
      id: 'dead-officer-requires-death-record',
      patches: [
        { path: ['officers', 'officer-30', 'status'], value: 'dead' },
        { path: ['officers', 'officer-30', 'factionId'], value: 'neutral' },
        { path: ['officers', 'officer-30', 'cityId'], value: null },
        { path: ['officers', 'officer-30', 'troops'], value: 0 },
        { path: ['officers', 'officer-30', 'stamina'], value: 0 },
        { path: ['officers', 'officer-30', 'equipmentItemIds'], value: [] },
      ],
      expectedPath: 'officers.officer-30.death',
      expectedMessage: 'dead officer must retain a death record',
    },
    {
      id: 'succession-phase-requires-pending-decision',
      patches: [{ path: ['phase'], value: 'succession' }],
      expectedPath: 'pendingSuccession',
      expectedMessage: 'is required during the succession phase',
    },
    {
      id: 'malformed-pending-succession-does-not-crash-validator',
      patches: [
        { path: ['phase'], value: 'succession' },
        { path: ['pendingSuccession'], value: [] },
      ],
      expectedPath: 'pendingSuccession',
      expectedMessage: 'must be an object',
    },
    {
      id: 'pending-succession-rejects-empty-candidates',
      patches: [
        ...validSuccessionPatches,
        { path: ['pendingSuccession', 'candidateOfficerIds'], value: [] },
      ],
      expectedPath: 'pendingSuccession.candidateOfficerIds',
      expectedMessage: 'must contain at least one candidate',
    },
    {
      id: 'pending-succession-rejects-invalid-ai-cursor',
      patches: [
        ...validSuccessionPatches,
        { path: ['pendingSuccession', 'resumePhase'], value: 'ai' },
        { path: ['pendingSuccession', 'resumeActiveFactionId'], value: 'ruler-13' },
        { path: ['pendingSuccession', 'resumeAiFactionIndex'], value: 999 },
      ],
      expectedPath: 'pendingSuccession.resumeAiFactionIndex',
      expectedMessage: 'must resume after the active AI faction',
    },
    {
      id: 'ended-phase-requires-outcome',
      patches: [{ path: ['phase'], value: 'ended' }],
      expectedPath: 'outcome',
      expectedMessage: 'is required when the game has ended',
    },
    {
      id: 'active-phase-rejects-outcome',
      patches: [{ path: ['outcome'], value: 'victory' }],
      expectedPath: 'outcome',
      expectedMessage: 'is only allowed when the game has ended',
    },
    {
      id: 'strategic-order-unknown-field',
      patches: [
        { path: ['strategicOrders'], value: { 'strategic-order-1': { ...validOrder, surprise: true } } },
        { path: ['nextStrategicOrderSerial'], value: 2 },
      ],
      expectedPath: 'strategicOrders.strategic-order-1.surprise',
      expectedMessage: 'is an unknown field',
    },
    {
      id: 'strategic-cargo-missing-field',
      patches: [
        { path: ['strategicOrders'], value: { 'strategic-order-1': { ...validOrder, cargo: { money: 1, reserveTroops: 0 } } } },
        { path: ['nextStrategicOrderSerial'], value: 2 },
      ],
      expectedPath: 'strategicOrders.strategic-order-1.cargo.food',
      expectedMessage: 'must be a non-negative safe integer',
    },
    {
      id: 'strategic-cargo-nested-value-does-not-crash-validator',
      patches: [
        { path: ['strategicOrders'], value: { 'strategic-order-1': { ...validOrder, cargo: { money: {}, food: 0, reserveTroops: 0 } } } },
        { path: ['nextStrategicOrderSerial'], value: 2 },
      ],
      expectedPath: 'strategicOrders.strategic-order-1.cargo.money',
      expectedMessage: 'must be a non-negative safe integer',
    },
    {
      id: 'strategic-order-leading-zero-id',
      patches: [
        { path: ['strategicOrders'], value: { 'strategic-order-01': { ...validOrder, id: 'strategic-order-01' } } },
        { path: ['nextStrategicOrderSerial'], value: 2 },
      ],
      expectedPath: 'strategicOrders.strategic-order-01.id',
      expectedMessage: 'must use strategic-order-N format',
    },
    {
      id: 'strategic-order-broken-road',
      patches: [
        { path: ['strategicOrders'], value: { 'strategic-order-1': { ...validOrder, targetCityId: 'city-8', routeCityIds: ['city-0', 'city-8'] } } },
        { path: ['nextStrategicOrderSerial'], value: 2 },
      ],
      expectedPath: 'strategicOrders.strategic-order-1.routeCityIds.1',
      expectedMessage: 'must follow an existing road',
    },
    {
      id: 'strategic-route-malformed-neighbors-does-not-crash-validator',
      patches: [
        { path: ['strategicOrders'], value: { 'strategic-order-1': validOrder } },
        { path: ['nextStrategicOrderSerial'], value: 2 },
        { path: ['cities', 'city-0', 'neighbors'], value: 'malformed' },
      ],
      expectedPath: 'cities.city-0.neighbors',
      expectedMessage: 'must be an array',
    },
    {
      id: 'strategic-order-clock-mismatch',
      patches: [
        { path: ['strategicOrders'], value: { 'strategic-order-1': { ...validOrder, durationMonths: 2, remainingMonths: 1 } } },
        { path: ['nextStrategicOrderSerial'], value: 2 },
      ],
      expectedPath: 'strategicOrders.strategic-order-1.remainingMonths',
      expectedMessage: 'must agree with durationMonths and elapsed campaign turns',
    },
    {
      id: 'strategic-order-duplicate-executor',
      patches: [
        { path: ['strategicOrders'], value: {
          'strategic-order-1': validOrder,
          'strategic-order-2': { ...validOrder, id: 'strategic-order-2' },
        } },
        { path: ['nextStrategicOrderSerial'], value: 3 },
      ],
      expectedPath: 'strategicOrders.strategic-order-2.officerId',
      expectedMessage: 'officer already has an active order',
    },
    {
      id: 'strategic-order-serial-not-monotonic',
      patches: [
        { path: ['strategicOrders'], value: { 'strategic-order-1': validOrder } },
        { path: ['nextStrategicOrderSerial'], value: 1 },
      ],
      expectedPath: 'nextStrategicOrderSerial',
      expectedMessage: 'must exceed every active strategic order serial',
    },
    {
      id: 'diplomatic-order-malformed-record',
      patches: [{ path: ['diplomaticOrders'], value: { 'diplomatic-order-1': 'malformed' } }],
      expectedPath: 'diplomaticOrders.diplomatic-order-1',
      expectedMessage: 'must be an object',
    },
    {
      id: 'diplomatic-order-unknown-field',
      patches: [
        { path: ['diplomaticOrders'], value: { 'diplomatic-order-1': { ...validDiplomaticOrder, surprise: true } } },
        { path: ['nextDiplomaticOrderSerial'], value: 2 },
        { path: ['officers', 'officer-1', 'cityId'], value: null },
      ],
      expectedPath: 'diplomaticOrders.diplomatic-order-1.surprise',
      expectedMessage: 'is an unknown field',
    },
    {
      id: 'diplomatic-order-leading-zero-id',
      patches: [
        { path: ['diplomaticOrders'], value: { 'diplomatic-order-01': { ...validDiplomaticOrder, id: 'diplomatic-order-01' } } },
        { path: ['nextDiplomaticOrderSerial'], value: 2 },
        { path: ['officers', 'officer-1', 'cityId'], value: null },
      ],
      expectedPath: 'diplomaticOrders.diplomatic-order-01.id',
      expectedMessage: 'must use diplomatic-order-N format',
    },
    {
      id: 'diplomatic-order-same-target-faction',
      patches: [
        { path: ['diplomaticOrders'], value: { 'diplomatic-order-1': { ...validDiplomaticOrder, targetFactionId: 'ruler-1' } } },
        { path: ['nextDiplomaticOrderSerial'], value: 2 },
        { path: ['officers', 'officer-1', 'cityId'], value: null },
      ],
      expectedPath: 'diplomaticOrders.diplomatic-order-1.targetFactionId',
      expectedMessage: 'must differ from the issuing faction',
    },
    {
      id: 'diplomatic-order-unknown-target-officer',
      patches: [
        { path: ['diplomaticOrders'], value: { 'diplomatic-order-1': { ...validDiplomaticOrder, targetOfficerId: 'officer-999' } } },
        { path: ['nextDiplomaticOrderSerial'], value: 2 },
        { path: ['officers', 'officer-1', 'cityId'], value: null },
      ],
      expectedPath: 'diplomaticOrders.diplomatic-order-1.targetOfficerId',
      expectedMessage: 'unknown officer: officer-999',
    },
    {
      id: 'diplomatic-order-clock-mismatch',
      patches: [
        { path: ['diplomaticOrders'], value: { 'diplomatic-order-1': { ...validDiplomaticOrder, durationMonths: 2, remainingMonths: 1 } } },
        { path: ['nextDiplomaticOrderSerial'], value: 2 },
        { path: ['officers', 'officer-1', 'cityId'], value: null },
      ],
      expectedPath: 'diplomaticOrders.diplomatic-order-1.remainingMonths',
      expectedMessage: 'must agree with durationMonths and elapsed campaign turns',
    },
    {
      id: 'diplomatic-order-unsafe-money-cost',
      patches: [
        { path: ['diplomaticOrders'], value: { 'diplomatic-order-1': { ...validDiplomaticOrder, moneyCost: '9007199254740992' } } },
        { path: ['nextDiplomaticOrderSerial'], value: 2 },
        { path: ['officers', 'officer-1', 'cityId'], value: null },
      ],
      expectedPath: 'diplomaticOrders.diplomatic-order-1.moneyCost',
      expectedMessage: 'must be a non-negative safe integer',
    },
    {
      id: 'diplomatic-order-future-calendar',
      patches: [
        { path: ['diplomaticOrders'], value: { 'diplomatic-order-1': { ...validDiplomaticOrder, createdYear: 191 } } },
        { path: ['nextDiplomaticOrderSerial'], value: 2 },
        { path: ['officers', 'officer-1', 'cityId'], value: null },
      ],
      expectedPath: 'diplomaticOrders.diplomatic-order-1.createdYear',
      expectedMessage: 'creation date must not be later than the current calendar',
    },
    {
      id: 'diplomatic-order-serial-not-monotonic',
      patches: [
        { path: ['diplomaticOrders'], value: { 'diplomatic-order-1': validDiplomaticOrder } },
        { path: ['nextDiplomaticOrderSerial'], value: 1 },
        { path: ['officers', 'officer-1', 'cityId'], value: null },
      ],
      expectedPath: 'nextDiplomaticOrderSerial',
      expectedMessage: 'must be greater than every existing diplomatic order serial',
    },
    {
      id: 'diplomatic-order-malformed-turn-does-not-crash-validator',
      patches: [
        { path: ['diplomaticOrders'], value: { 'diplomatic-order-1': validDiplomaticOrder } },
        { path: ['nextDiplomaticOrderSerial'], value: 2 },
        { path: ['officers', 'officer-1', 'cityId'], value: null },
        { path: ['turn'], value: {} },
      ],
      expectedPath: 'turn',
      expectedMessage: 'must be a positive integer',
    },
    {
      id: 'diplomatic-order-serial-unsafe',
      patches: [{ path: ['nextDiplomaticOrderSerial'], value: '9007199254740992' }],
      expectedPath: 'nextDiplomaticOrderSerial',
      expectedMessage: 'must be a positive safe integer',
    },
    {
      id: 'ended-campaign-rejects-active-diplomatic-order',
      patches: [
        { path: ['phase'], value: 'ended' },
        { path: ['outcome'], value: 'victory' },
        { path: ['diplomaticOrders'], value: { 'diplomatic-order-1': validDiplomaticOrder } },
        { path: ['nextDiplomaticOrderSerial'], value: 2 },
        { path: ['officers', 'officer-1', 'cityId'], value: null },
      ],
      expectedPath: 'strategicOrders',
      expectedMessage: 'all active campaign orders must be empty when the campaign has ended',
    },
    {
      id: 'intel-report-malformed-record',
      patches: [{ path: ['intelReports'], value: { 'city-0': 'malformed' } }],
      expectedPath: 'intelReports.city-0',
      expectedMessage: 'must be an object',
    },
    {
      id: 'intel-report-unknown-field',
      patches: [{ path: ['intelReports'], value: { 'city-0': { ...validReport, surprise: true } } }],
      expectedPath: 'intelReports.city-0.surprise',
      expectedMessage: 'is an unknown field',
    },
    {
      id: 'intel-report-missing-required-field',
      patches: [{ path: ['intelReports'], value: { 'city-0': missingRequiredReport } }],
      expectedPath: 'intelReports.city-0.population',
      expectedMessage: 'must be a non-negative safe integer',
    },
    {
      id: 'intel-report-future-turn',
      patches: [{ path: ['intelReports'], value: { 'city-0': { ...validReport, observedTurn: 2 } } }],
      expectedPath: 'intelReports.city-0.observedTurn',
      expectedMessage: 'must not be later than the current turn',
    },
    {
      id: 'intel-report-future-calendar',
      patches: [{ path: ['intelReports'], value: { 'city-0': { ...validReport, observedYear: 191 } } }],
      expectedPath: 'intelReports.city-0.observedYear',
      expectedMessage: 'observation date must not be later than the current calendar',
    },
    {
      id: 'intel-report-duplicate-officer-id',
      patches: [{ path: ['intelReports'], value: { 'city-0': {
        ...validReport, officerIds: ['officer-56', 'officer-56'], officerCount: 2,
      } } }],
      expectedPath: 'intelReports.city-0.officerIds',
      expectedMessage: 'contains duplicate officer ids',
    },
    {
      id: 'intel-report-officer-count-mismatch',
      patches: [{ path: ['intelReports'], value: { 'city-0': { ...validReport, officerCount: 1 } } }],
      expectedPath: 'intelReports.city-0.officerIds',
      expectedMessage: 'must agree with officerCount',
    },
    {
      id: 'intel-report-unknown-officer',
      patches: [{ path: ['intelReports'], value: { 'city-0': {
        ...validReport, officerIds: ['officer-999'], officerCount: 1,
      } } }],
      expectedPath: 'intelReports.city-0.officerIds',
      expectedMessage: 'unknown officer: officer-999',
    },
    {
      id: 'intel-report-key-mismatch',
      patches: [{ path: ['intelReports'], value: { 'city-1': validReport } }],
      expectedPath: 'intelReports.city-1.cityId',
      expectedMessage: 'must match record key',
    },
    {
      id: 'intel-report-malformed-calendar-does-not-crash-validator',
      patches: [
        { path: ['intelReports'], value: { 'city-0': validReport } },
        { path: ['calendar'], value: 'malformed' },
      ],
      expectedPath: 'calendar',
      expectedMessage: 'must be an object',
    },
    {
      id: 'intel-report-malformed-turn-does-not-crash-validator',
      patches: [
        { path: ['intelReports'], value: { 'city-0': validReport } },
        { path: ['turn'], value: {} },
      ],
      expectedPath: 'turn',
      expectedMessage: 'must be a positive integer',
    },
    {
      id: 'intel-report-malformed-calendar-member-does-not-crash-validator',
      patches: [
        { path: ['intelReports'], value: { 'city-0': validReport } },
        { path: ['calendar', 'year'], value: {} },
      ],
      expectedPath: 'calendar.year',
      expectedMessage: 'must be a positive integer',
    },
  ];
}

function applyStatePatches(target: Record<string, unknown>, patches: StatePatch[]) {
  for (const patch of patches) {
    let cursor: Record<string, unknown> = target;
    for (const segment of patch.path.slice(0, -1)) cursor = cursor[segment] as Record<string, unknown>;
    if (patch.remove) delete cursor[patch.path.at(-1)!];
    else cursor[patch.path.at(-1)!] = structuredClone(patch.value);
  }
}

function buildModernRulesetCase() {
  const input = createProductionSessionState(1, 1);
  input.rulesetId = 'modern-balanced-v1';
  const parameters = { cityId: 'city-12', officerId: 'officer-1' };
  const expected = governCity(input, parameters);
  return {
    kind: 'govern_city',
    parameters,
    inputStateSha256: canonicalSha256(input),
    expectedStateSha256: canonicalSha256(expected),
    expectedMoneyCost: input.cities['city-12'].money - expected.cities['city-12'].money,
    expectedStaminaCost: input.officers['officer-1'].stamina - expected.officers['officer-1'].stamina,
  };
}

function buildInternalAffairsSequence() {
  const initialState = createProductionSessionState(1, 1);
  const session = new OracleApplicationSession(initialState);
  const steps: { id: string; command: ApplicationCommandEnvelope; expectedCore: unknown }[] = [];
  let serial = 1;
  const apply = (id: string, kind: string, parameters: Record<string, unknown>) => {
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb05-${String(serial).padStart(4, '0')}`,
      expectedStateSha256: canonicalSha256(session.snapshot()),
      kind,
      parameters,
    };
    serial += 1;
    const { state: _stateEvidence, ...expectedCore } = session.execute(command);
    steps.push({ id, command, expectedCore });
  };
  apply('trade-sell-success', 'trade_food', {
    cityId: 'city-12', officerId: 'officer-1', direction: 'sell', amount: 100,
  });
  apply('farming-success', 'develop_farming', { cityId: 'city-12', officerId: 'officer-32' });
  apply('commerce-success', 'develop_commerce', { cityId: 'city-12', officerId: 'officer-33' });
  apply('govern-success', 'govern_city', { cityId: 'city-12', officerId: 'officer-34' });
  apply('inspect-success', 'inspect_city', { cityId: 'city-12', officerId: 'officer-35' });
  apply('banquet-success', 'banquet_officer', { cityId: 'city-12', targetOfficerId: 'officer-36' });
  apply('plunder-success', 'plunder_city', { cityId: 'city-12', officerId: 'officer-37' });
  apply('trade-buy-resource-rejected', 'trade_food', {
    cityId: 'city-12', officerId: 'officer-36', direction: 'buy', amount: 30000,
  });
  apply('trade-buy-success', 'trade_food', {
    cityId: 'city-12', officerId: 'officer-36', direction: 'buy', amount: 1,
  });
  apply('invalid-trade-amount', 'trade_food', {
    cityId: 'city-12', officerId: 'officer-21', direction: 'buy', amount: 0,
  });
  apply('sorted-internal-parameter-error', 'develop_commerce', {
    cityId: 'city-12', officerId: 'officer-21', ['\u{10000}']: true, ['\ue000']: true,
  });
  apply('acted-officer-rejected', 'develop_commerce', {
    cityId: 'city-12', officerId: 'officer-1',
  });
  return {
    initialStateSha256: canonicalSha256(initialState),
    steps,
    finalStateSha256: canonicalSha256(session.snapshot()),
  };
}
