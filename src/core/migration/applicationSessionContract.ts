import {
  banquetOfficer,
  developCommerce,
  developFarming,
  governCity,
  inspectCity,
  plunderCity,
  tradeFood,
} from '../cityCommands';
import {
  appointSatrap,
  giveItemToOfficer,
  recruitFreeOfficer,
  rewardOfficer,
  searchCity,
  unequipOfficerItem,
} from '../personnelCommands';
import { recruitCaptive, releaseCaptive } from '../captiveCommands';
import {
  banishOfficer,
  confiscateOfficerEquipment,
  executeCaptive,
} from '../officerLifecycle';
import { advanceStrategicOrders, issueMoveOrder, issueTransportOrder } from '../strategicOrders';
import { reconnoitreCity } from '../reconnaissance';
import type { GameState } from '../types';
import { selectPlayerFaction } from '../../data/legacyScenario';
import { canonicalSha256, compareUnicodeScalar } from './canonicalJson';
import { buildProductionEnvelope } from './productionDataContract';

export const APPLICATION_COMMAND_ENVELOPE_VERSION = 1 as const;
export const APPLICATION_RESULT_ENVELOPE_VERSION = 1 as const;

export type ApplicationCommandEnvelope = {
  commandEnvelopeVersion: number;
  commandId: string;
  expectedStateSha256: string;
  kind: string;
  parameters: unknown;
};

export type ApplicationCommandResult = {
  resultEnvelopeVersion: 1;
  commandEnvelopeVersion: unknown;
  commandId: unknown;
  kind: unknown;
  ok: boolean;
  code: string;
  error: string;
  stateChanged: boolean;
  beforeStateSha256: string;
  afterStateSha256: string;
  receipt: Record<string, unknown>;
  state: GameState;
};

export type ApplicationAdvanceResult = {
  ok: boolean;
  error: string;
  stateChanged: boolean;
  beforeStateSha256: string;
  afterStateSha256: string;
  receipt: Record<string, unknown>;
  state: GameState;
};

type ResultCore = Omit<ApplicationCommandResult, 'state'>;
type CompletedCommand = { requestSha256: string; resultCore: ResultCore };
const IDEMPOTENCY_WINDOW_LIMIT = 256;

export function createProductionSessionState(periodId: 1 | 2 | 3 | 4, rulerSourceIndex: number): GameState {
  const envelope = buildProductionEnvelope(periodId);
  const candidate = envelope.scenario.playerCandidates
    .find((entry) => entry.sourceIndex === rulerSourceIndex);
  if (!candidate) throw new Error(`ruler source index ${rulerSourceIndex} is not a player candidate for period ${periodId}`);
  // The checked-in cross-language contract is JSON-shaped. Round-tripping here
  // removes optional `undefined` properties that do not exist in that contract.
  const contractState = JSON.parse(JSON.stringify(envelope.state)) as GameState;
  return JSON.parse(JSON.stringify(selectPlayerFaction(contractState, candidate.factionId))) as GameState;
}

export class OracleApplicationSession {
  private state: GameState;

  private readonly completed = new Map<string, CompletedCommand>();

  private readonly completedOrder: string[] = [];

  constructor(initialState: GameState) { this.state = structuredClone(initialState); }

  snapshot(): GameState { return structuredClone(this.state); }

  restoreSnapshot(snapshot: GameState): void {
    this.state = structuredClone(snapshot);
    this.completed.clear();
    this.completedOrder.length = 0;
  }

  advanceStrategicOrders(): ApplicationAdvanceResult {
    const before = this.snapshot();
    const beforeDigest = canonicalSha256(before);
    try {
      const settling: GameState = {
        ...before,
        turn: before.turn + 1,
        calendar: before.calendar.month === 12
          ? { year: before.calendar.year + 1, month: 1 }
          : { year: before.calendar.year, month: before.calendar.month + 1 },
        phase: 'player',
        activeFactionId: before.playerFactionId,
        actedOfficerIds: [],
      };
      const next = JSON.parse(JSON.stringify(advanceStrategicOrders(settling))) as GameState;
      const afterDigest = canonicalSha256(next);
      const beforeOrderIds = Object.keys(before.strategicOrders).sort(compareUnicodeScalar);
      const completedOrderIds = beforeOrderIds.filter((id) => !next.strategicOrders[id]);
      const receipt = {
        kind: 'advance_strategic_orders',
        state: projectStrategicState(next),
        completedOrderIds,
        activeOrders: Object.values(next.strategicOrders)
          .sort((left, right) => compareUnicodeScalar(left.id, right.id))
          .map((order) => structuredClone(order)),
        appendedLogs: structuredClone(next.logs.slice(before.logs.length)),
      };
      this.state = structuredClone(next);
      return {
        ok: true,
        error: '',
        stateChanged: afterDigest !== beforeDigest,
        beforeStateSha256: beforeDigest,
        afterStateSha256: afterDigest,
        receipt,
        state: structuredClone(next),
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        stateChanged: false,
        beforeStateSha256: beforeDigest,
        afterStateSha256: beforeDigest,
        receipt: {},
        state: before,
      };
    }
  }

  execute(raw: unknown): ApplicationCommandResult {
    const before = this.snapshot();
    const beforeDigest = canonicalSha256(before);
    const validation = validateEnvelope(raw);
    if (!validation.ok) return failure(raw, validation.code, validation.error, before, beforeDigest);
    const envelope = validation.envelope;
    let requestSha256: string;
    try { requestSha256 = canonicalSha256(envelope); }
    catch (error) {
      return failure(
        envelope,
        'invalid_envelope',
        error instanceof Error ? error.message : String(error),
        before,
        beforeDigest,
      );
    }
    const completed = this.completed.get(envelope.commandId);
    if (completed) {
      if (completed.requestSha256 === requestSha256) {
        if (completed.resultCore.afterStateSha256 === beforeDigest) {
          return { ...structuredClone(completed.resultCore), state: before };
        }
        return {
          ...base(envelope, true, 'already_committed', ''),
          stateChanged: false,
          beforeStateSha256: beforeDigest,
          afterStateSha256: beforeDigest,
          receipt: structuredClone(completed.resultCore.receipt),
          state: before,
        };
      }
      return failure(envelope, 'command_id_conflict', 'commandId was already used for a different request', before, beforeDigest);
    }
    if (envelope.expectedStateSha256 !== beforeDigest) {
      return failure(envelope, 'stale_state', 'expectedStateSha256 does not match current state', before, beforeDigest);
    }

    try {
      const next = JSON.parse(JSON.stringify(executeDomainCommand(before, envelope))) as GameState;
      const afterDigest = canonicalSha256(next);
      const result: ApplicationCommandResult = {
        ...base(envelope, true, 'ok', ''),
        stateChanged: true,
        beforeStateSha256: beforeDigest,
        afterStateSha256: afterDigest,
        receipt: projectReceipt(envelope.kind, before, next, envelope.parameters as Record<string, unknown>),
        state: structuredClone(next),
      };
      this.state = structuredClone(next);
      const { state: _evidenceState, ...resultCore } = result;
      if (this.completedOrder.length >= IDEMPOTENCY_WINDOW_LIMIT) {
        const evicted = this.completedOrder.shift();
        if (evicted) this.completed.delete(evicted);
      }
      this.completedOrder.push(envelope.commandId);
      this.completed.set(envelope.commandId, { requestSha256, resultCore: structuredClone(resultCore) });
      return result;
    } catch (error) {
      return failure(
        envelope,
        'domain_rejected',
        error instanceof Error ? error.message : String(error),
        before,
        beforeDigest,
      );
    }
  }
}

export function validateEnvelope(raw: unknown):
  | { ok: true; envelope: ApplicationCommandEnvelope }
  | { ok: false; code: string; error: string } {
  if (!isRecord(raw)) return rejected('invalid_envelope', 'command envelope must be an object');
  const allowed = ['commandEnvelopeVersion', 'commandId', 'expectedStateSha256', 'kind', 'parameters'];
  const rootKeys = Object.keys(raw);
  if (rootKeys.some((key) => !isUnicodeScalarSequence(key))) {
    return rejected('invalid_envelope', 'command envelope field names must be Unicode scalar sequences');
  }
  const unknown = rootKeys.filter((key) => !allowed.includes(key)).sort(compareUnicodeScalar);
  if (unknown.length > 0) return rejected('invalid_envelope', `unknown command envelope field: ${unknown[0]}`);
  for (const key of allowed) {
    if (!(key in raw)) return rejected('invalid_envelope', `missing command envelope field: ${key}`);
  }
  if (!Number.isInteger(raw.commandEnvelopeVersion) || raw.commandEnvelopeVersion !== 1) {
    return rejected('unsupported_version', 'commandEnvelopeVersion must be 1');
  }
  if (!isNonBlank(raw.commandId)) return rejected('invalid_command_id', 'commandId must be a non-blank string');
  if (!isUnicodeScalarSequence(raw.commandId)) return rejected('invalid_envelope', 'commandId must be a Unicode scalar sequence');
  if (typeof raw.expectedStateSha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(raw.expectedStateSha256)) {
    return rejected('invalid_expected_digest', 'expectedStateSha256 must be a lowercase SHA-256 digest');
  }
  if (!isNonBlank(raw.kind)) return rejected('invalid_kind', 'kind must be a non-blank string');
  if (!isUnicodeScalarSequence(raw.kind)) return rejected('invalid_envelope', 'kind must be a Unicode scalar sequence');
  if (!isRecord(raw.parameters)) return rejected('invalid_parameters', 'parameters must be an object');
  const parameterKeysByKind: Record<string, string[]> = {
    develop_farming: ['cityId', 'officerId'],
    develop_commerce: ['cityId', 'officerId'],
    govern_city: ['cityId', 'officerId'],
    inspect_city: ['cityId', 'officerId'],
    trade_food: ['cityId', 'officerId', 'direction', 'amount'],
    banquet_officer: ['cityId', 'targetOfficerId'],
    plunder_city: ['cityId', 'officerId'],
    reward_officer: ['cityId', 'officerId'],
    appoint_satrap: ['cityId', 'officerId'],
    give_item: ['cityId', 'officerId', 'itemId'],
    unequip_item: ['cityId', 'officerId', 'itemId'],
    search_city: ['cityId', 'officerId'],
    recruit_free_officer: ['cityId', 'executorOfficerId', 'targetOfficerId'],
    recruit_captive: ['cityId', 'executorOfficerId', 'captiveOfficerId'],
    release_captive: ['cityId', 'captiveOfficerId'],
    execute_captive: ['cityId', 'captiveOfficerId'],
    banish_officer: ['cityId', 'officerId'],
    confiscate_equipment: ['cityId', 'officerId', 'itemId'],
    issue_move_order: ['sourceCityId', 'targetCityId', 'officerId'],
    issue_transport_order: ['sourceCityId', 'targetCityId', 'officerId', 'cargo'],
    reconnoitre_city: ['sourceCityId', 'targetCityId', 'officerId'],
  };
  const parameterKeys = parameterKeysByKind[raw.kind];
  if (!parameterKeys) return rejected('unknown_command', `unsupported command kind: ${raw.kind}`);
  const parameterRecordKeys = Object.keys(raw.parameters);
  if (parameterRecordKeys.some((key) => !isUnicodeScalarSequence(key))) {
    return rejected('invalid_parameters', 'parameter field names must be Unicode scalar sequences');
  }
  const unknownParameters = parameterRecordKeys
    .filter((key) => !parameterKeys.includes(key)).sort(compareUnicodeScalar);
  if (unknownParameters.length > 0) {
    return rejected(
      'invalid_parameters',
      `unknown ${raw.kind} parameter: ${unknownParameters[0]}`,
    );
  }
  if (raw.kind === 'develop_farming') {
    for (const key of parameterKeys) {
      if (!isNonBlank(raw.parameters[key])) return rejected('invalid_parameters', `${key} must be a non-blank string`);
      if (!isUnicodeScalarSequence(raw.parameters[key])) {
        return rejected('invalid_parameters', `${key} must be a Unicode scalar sequence`);
      }
    }
  } else {
    for (const key of parameterKeys) {
      if (!(key in raw.parameters)) return rejected('invalid_parameters', `${key} is required`);
    }
    for (const key of [
      'cityId', 'sourceCityId', 'targetCityId', 'officerId', 'executorOfficerId',
      'targetOfficerId', 'captiveOfficerId', 'itemId',
    ]) {
      if (!parameterKeys.includes(key)) continue;
      if (!isNonBlank(raw.parameters[key])) return rejected('invalid_parameters', `${key} must be a non-blank string`);
      if (!isUnicodeScalarSequence(raw.parameters[key] as string)) {
        return rejected('invalid_parameters', `${key} must be a Unicode scalar sequence`);
      }
    }
  }
  if (raw.kind === 'trade_food') {
    if (raw.parameters.direction !== 'buy' && raw.parameters.direction !== 'sell') {
      return rejected('invalid_parameters', 'direction must be buy or sell');
    }
    if (!Number.isSafeInteger(raw.parameters.amount) || (raw.parameters.amount as number) <= 0) {
      return rejected('invalid_parameters', 'amount must be a positive safe integer');
    }
  }
  if (raw.kind === 'issue_transport_order' && !isRecord(raw.parameters.cargo)) {
    return rejected('invalid_parameters', 'cargo must be an object');
  }
  return { ok: true, envelope: structuredClone(raw) as ApplicationCommandEnvelope };
}

function executeDomainCommand(before: GameState, envelope: ApplicationCommandEnvelope): GameState {
  const parameters = envelope.parameters as Record<string, unknown>;
  switch (envelope.kind) {
    case 'develop_farming':
      return developFarming(before, parameters as { cityId: string; officerId: string });
    case 'develop_commerce':
      return developCommerce(before, parameters as { cityId: string; officerId: string });
    case 'govern_city':
      return governCity(before, parameters as { cityId: string; officerId: string });
    case 'inspect_city':
      return inspectCity(before, parameters as { cityId: string; officerId: string });
    case 'trade_food':
      return tradeFood(before, parameters as {
        cityId: string; officerId: string; direction: 'buy' | 'sell'; amount: number;
      });
    case 'banquet_officer':
      return banquetOfficer(before, parameters as { cityId: string; targetOfficerId: string });
    case 'plunder_city':
      return plunderCity(before, parameters as { cityId: string; officerId: string });
    case 'reward_officer':
      return rewardOfficer(before, parameters as { cityId: string; officerId: string });
    case 'appoint_satrap':
      return appointSatrap(before, parameters as { cityId: string; officerId: string });
    case 'give_item':
      return giveItemToOfficer(before, parameters as { cityId: string; officerId: string; itemId: string });
    case 'unequip_item':
      return unequipOfficerItem(before, parameters as { cityId: string; officerId: string; itemId: string });
    case 'search_city':
      return searchCity(before, parameters as { cityId: string; officerId: string });
    case 'recruit_free_officer':
      return recruitFreeOfficer(before, parameters as {
        cityId: string; executorOfficerId: string; targetOfficerId: string;
      });
    case 'recruit_captive':
      return recruitCaptive(before, parameters as {
        cityId: string; executorOfficerId: string; captiveOfficerId: string;
      });
    case 'release_captive':
      return releaseCaptive(before, parameters as { cityId: string; captiveOfficerId: string });
    case 'execute_captive':
      return executeCaptive(before, parameters as { cityId: string; captiveOfficerId: string });
    case 'banish_officer':
      return banishOfficer(before, parameters as { cityId: string; officerId: string });
    case 'confiscate_equipment':
      return confiscateOfficerEquipment(before, parameters as {
        cityId: string; officerId: string; itemId: string;
      });
    case 'issue_move_order':
      return issueMoveOrder(before, parameters as {
        sourceCityId: string; targetCityId: string; officerId: string;
      });
    case 'issue_transport_order': {
      const input = parameters as {
        sourceCityId: string; targetCityId: string; officerId: string;
        cargo: Record<string, unknown>;
      };
      const cargoKeys = Object.keys(input.cargo).sort(compareUnicodeScalar);
      if (cargoKeys.length !== 3 || !['money', 'food', 'reserveTroops'].every((key) => cargoKeys.includes(key))) {
        throw new Error('输送物资必须且只能包含 money、food、reserveTroops');
      }
      return issueTransportOrder(before, input as unknown as Parameters<typeof issueTransportOrder>[1]);
    }
    case 'reconnoitre_city':
      return reconnoitreCity(before, parameters as {
        sourceCityId: string; targetCityId: string; officerId: string;
      });
    default:
      throw new Error(`unsupported command kind: ${envelope.kind}`);
  }
}

function projectReceipt(
  kind: string,
  before: GameState,
  after: GameState,
  command: Record<string, unknown>,
): Record<string, unknown> {
  if (kind === 'issue_move_order' || kind === 'issue_transport_order') {
    return projectStrategicOrderReceipt(kind, before, after, command);
  }
  if (kind === 'reconnoitre_city') {
    return projectReconnaissanceReceipt(before, after, command);
  }
  if ([
    'search_city', 'recruit_free_officer', 'recruit_captive', 'release_captive',
    'execute_captive', 'banish_officer', 'confiscate_equipment',
  ].includes(kind)) {
    return projectPersonnelLifecycleReceipt(kind, before, after, command);
  }
  if (['reward_officer', 'appoint_satrap', 'give_item', 'unequip_item'].includes(kind)) {
    return projectOfficerManagementReceipt(kind, before, after, command);
  }
  if (kind === 'develop_farming') {
    return projectDevelopFarmingReceipt(
      before,
      after,
      command as { cityId: string; officerId: string },
    );
  }
  const cityId = command.cityId as string;
  const beforeCity = before.cities[cityId];
  const afterCity = after.cities[cityId];
  const appendedLog = after.logs.at(-1);
  if (!beforeCity || !afterCity || !appendedLog) {
    throw new Error(`Successful ${kind} transaction is missing observable output`);
  }
  const receipt: Record<string, unknown> = {
    kind,
    state: {
      turn: after.turn,
      rngSeed: after.rngSeed,
      campaignStarted: after.campaignStarted,
      actedOfficerIds: [...after.actedOfficerIds],
      logCount: after.logs.length,
    },
    city: {
      id: cityId,
      before: projectCityResources(beforeCity),
      after: projectCityResources(afterCity),
    },
    appendedLog: structuredClone(appendedLog),
  };
  if (typeof command.officerId === 'string') {
    receipt.officer = {
      id: command.officerId,
      before: projectOfficerValues(before.officers[command.officerId]),
      after: projectOfficerValues(after.officers[command.officerId]),
    };
  }
  if (typeof command.targetOfficerId === 'string') {
    receipt.targetOfficer = {
      id: command.targetOfficerId,
      before: projectOfficerValues(before.officers[command.targetOfficerId]),
      after: projectOfficerValues(after.officers[command.targetOfficerId]),
    };
  }
  return receipt;
}

function projectReconnaissanceReceipt(
  before: GameState,
  after: GameState,
  command: Record<string, unknown>,
): Record<string, unknown> {
  const sourceCityId = command.sourceCityId as string;
  const targetCityId = command.targetCityId as string;
  const officerId = command.officerId as string;
  const appendedLog = after.logs.at(-1);
  const report = after.intelReports[targetCityId];
  if (!appendedLog || !report) {
    throw new Error('Successful reconnoitre_city transaction is missing observable output');
  }
  return {
    kind: 'reconnoitre_city',
    state: projectStrategicState(after),
    sourceCity: {
      id: sourceCityId,
      before: { money: before.cities[sourceCityId].money },
      after: { money: after.cities[sourceCityId].money },
    },
    targetCity: { id: targetCityId },
    officer: {
      id: officerId,
      before: { stamina: before.officers[officerId].stamina },
      after: { stamina: after.officers[officerId].stamina },
    },
    report: structuredClone(report),
    appendedLog: structuredClone(appendedLog),
  };
}

function projectStrategicOrderReceipt(
  kind: string,
  before: GameState,
  after: GameState,
  command: Record<string, unknown>,
): Record<string, unknown> {
  const order = Object.values(after.strategicOrders)
    .filter((candidate) => !before.strategicOrders[candidate.id])
    .sort((left, right) => compareUnicodeScalar(left.id, right.id))[0];
  const sourceCityId = command.sourceCityId as string;
  const targetCityId = command.targetCityId as string;
  const officerId = command.officerId as string;
  const appendedLog = after.logs.at(-1);
  if (!order || !appendedLog) throw new Error(`Successful ${kind} transaction is missing observable output`);
  return {
    kind,
    state: projectStrategicState(after),
    order: structuredClone(order),
    sourceCity: {
      id: sourceCityId,
      before: projectStrategicCity(before.cities[sourceCityId]),
      after: projectStrategicCity(after.cities[sourceCityId]),
    },
    targetCity: {
      id: targetCityId,
      before: projectStrategicCity(before.cities[targetCityId]),
      after: projectStrategicCity(after.cities[targetCityId]),
    },
    officer: {
      id: officerId,
      before: projectTransitOfficer(before.officers[officerId]),
      after: projectTransitOfficer(after.officers[officerId]),
    },
    appendedLog: structuredClone(appendedLog),
  };
}

function projectStrategicState(state: GameState) {
  return {
    turn: state.turn,
    rngSeed: state.rngSeed,
    campaignStarted: state.campaignStarted,
    actedOfficerIds: [...state.actedOfficerIds],
    logCount: state.logs.length,
  };
}

function projectStrategicCity(city: GameState['cities'][string]) {
  return {
    money: city.money,
    food: city.food,
    reserveTroops: city.reserveTroops,
    satrapOfficerId: city.satrapOfficerId ?? null,
  };
}

function projectTransitOfficer(officer: GameState['officers'][string]) {
  return {
    status: officer.status,
    factionId: officer.factionId,
    cityId: officer.cityId ?? null,
    stamina: officer.stamina,
  };
}

function projectOfficerManagementReceipt(
  kind: string,
  before: GameState,
  after: GameState,
  command: Record<string, unknown>,
): Record<string, unknown> {
  const cityId = command.cityId as string;
  const officerId = command.officerId as string;
  const beforeCity = before.cities[cityId];
  const afterCity = after.cities[cityId];
  const beforeOfficer = before.officers[officerId];
  const afterOfficer = after.officers[officerId];
  const appendedLog = after.logs.at(-1);
  if (!beforeCity || !afterCity || !beforeOfficer || !afterOfficer || !appendedLog) {
    throw new Error(`Successful ${kind} transaction is missing observable output`);
  }
  return {
    kind,
    state: {
      turn: after.turn,
      rngSeed: after.rngSeed,
      campaignStarted: after.campaignStarted,
      actedOfficerIds: [...after.actedOfficerIds],
      logCount: after.logs.length,
    },
    city: {
      id: cityId,
      before: {
        money: beforeCity.money,
        satrapOfficerId: beforeCity.satrapOfficerId ?? null,
        itemIds: [...(beforeCity.itemIds ?? [])],
      },
      after: {
        money: afterCity.money,
        satrapOfficerId: afterCity.satrapOfficerId ?? null,
        itemIds: [...(afterCity.itemIds ?? [])],
      },
    },
    officer: {
      id: officerId,
      before: {
        loyalty: beforeOfficer.loyalty,
        armsTypeId: beforeOfficer.armsTypeId,
        equipmentItemIds: [...(beforeOfficer.equipmentItemIds ?? [])],
      },
      after: {
        loyalty: afterOfficer.loyalty,
        armsTypeId: afterOfficer.armsTypeId,
        equipmentItemIds: [...(afterOfficer.equipmentItemIds ?? [])],
      },
    },
    appendedLog: structuredClone(appendedLog),
  };
}

function projectPersonnelLifecycleReceipt(
  kind: string,
  before: GameState,
  after: GameState,
  command: Record<string, unknown>,
): Record<string, unknown> {
  const cityId = command.cityId as string;
  const beforeCity = before.cities[cityId];
  const afterCity = after.cities[cityId];
  const appendedLog = after.logs.at(-1);
  if (!beforeCity || !afterCity || !appendedLog) {
    throw new Error(`Successful ${kind} transaction is missing observable output`);
  }
  let participantIds: string[];
  switch (kind) {
    case 'search_city':
    case 'banish_officer':
    case 'confiscate_equipment':
      participantIds = [command.officerId as string];
      break;
    case 'recruit_free_officer':
      participantIds = [command.executorOfficerId as string, command.targetOfficerId as string];
      break;
    case 'recruit_captive':
      participantIds = [command.executorOfficerId as string, command.captiveOfficerId as string];
      break;
    case 'release_captive':
    case 'execute_captive':
      participantIds = [command.captiveOfficerId as string];
      break;
    default:
      throw new Error(`Unsupported personnel lifecycle receipt: ${kind}`);
  }
  return {
    kind,
    state: {
      turn: after.turn,
      rngSeed: after.rngSeed,
      campaignStarted: after.campaignStarted,
      actedOfficerIds: [...after.actedOfficerIds],
      discoveredOfficerIds: [...after.discoveredOfficerIds],
      logCount: after.logs.length,
    },
    city: {
      id: cityId,
      before: projectPersonnelCity(beforeCity),
      after: projectPersonnelCity(afterCity),
    },
    officers: participantIds.map((officerId) => ({
      id: officerId,
      before: projectLifecycleOfficer(before.officers[officerId]),
      after: projectLifecycleOfficer(after.officers[officerId]),
    })),
    appendedLog: structuredClone(appendedLog),
  };
}

function projectPersonnelCity(city: GameState['cities'][string]) {
  return {
    farming: city.farming,
    commerce: city.commerce,
    money: city.money,
    food: city.food,
    satrapOfficerId: city.satrapOfficerId ?? null,
    itemIds: [...(city.itemIds ?? [])],
    hiddenItemIds: [...(city.hiddenItemIds ?? [])],
  };
}

function projectLifecycleOfficer(officer: GameState['officers'][string]) {
  if (!officer) throw new Error('Successful personnel transaction is missing an officer');
  return {
    status: officer.status,
    factionId: officer.factionId,
    cityId: officer.cityId ?? null,
    captorFactionId: officer.captorFactionId ?? null,
    formerFactionId: officer.formerFactionId ?? null,
    loyalty: officer.loyalty,
    stamina: officer.stamina,
    troops: officer.troops,
    equipmentItemIds: [...(officer.equipmentItemIds ?? [])],
    death: officer.death ? structuredClone(officer.death) : null,
  };
}

function projectCityResources(city: GameState['cities'][string]) {
  return {
    farming: city.farming,
    commerce: city.commerce,
    population: city.population,
    publicLoyalty: city.publicLoyalty,
    disasterPrevention: city.disasterPrevention,
    condition: city.condition ?? 'normal',
    money: city.money,
    food: city.food,
  };
}

function projectOfficerValues(officer: GameState['officers'][string]) {
  if (!officer) throw new Error('Successful internal-affairs transaction is missing an officer');
  return { stamina: officer.stamina, loyalty: officer.loyalty };
}

function projectDevelopFarmingReceipt(
  before: GameState,
  after: GameState,
  command: { cityId: string; officerId: string },
): Record<string, unknown> {
  const beforeCity = before.cities[command.cityId];
  const afterCity = after.cities[command.cityId];
  const beforeOfficer = before.officers[command.officerId];
  const afterOfficer = after.officers[command.officerId];
  const appendedLog = after.logs.at(-1);
  if (!beforeCity || !afterCity || !beforeOfficer || !afterOfficer || !appendedLog) {
    throw new Error('Successful developFarming transaction is missing observable output');
  }
  return {
    gain: afterCity.farming - beforeCity.farming,
    costs: {
      money: beforeCity.money - afterCity.money,
      stamina: beforeOfficer.stamina - afterOfficer.stamina,
    },
    state: {
      turn: after.turn,
      rngSeed: after.rngSeed,
      campaignStarted: after.campaignStarted,
      actedOfficerIds: [...after.actedOfficerIds],
      logCount: after.logs.length,
    },
    city: { id: afterCity.id, resources: { farming: afterCity.farming, money: afterCity.money } },
    officer: { id: afterOfficer.id, stamina: afterOfficer.stamina },
    appendedLog: structuredClone(appendedLog),
  };
}

function failure(
  raw: unknown,
  code: string,
  error: string,
  state: GameState,
  digest: string,
): ApplicationCommandResult {
  return {
    ...base(raw, false, code, error),
    stateChanged: false,
    beforeStateSha256: digest,
    afterStateSha256: digest,
    receipt: {},
    state: structuredClone(state),
  };
}

function base(raw: unknown, ok: boolean, code: string, error: string) {
  const record = isRecord(raw) ? raw : {};
  return {
    resultEnvelopeVersion: APPLICATION_RESULT_ENVELOPE_VERSION,
    commandEnvelopeVersion: record.commandEnvelopeVersion ?? null,
    commandId: record.commandId ?? '',
    kind: record.kind ?? '',
    ok,
    code,
    error,
  };
}

function rejected(code: string, error: string) { return { ok: false as const, code, error }; }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNonBlank(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  for (const character of value) {
    if (!isEcmaScriptTrimCodePoint(character.codePointAt(0)!)) return true;
  }
  return false;
}
function isEcmaScriptTrimCodePoint(codePoint: number): boolean {
  return (codePoint >= 0x0009 && codePoint <= 0x000d)
    || (codePoint >= 0x2000 && codePoint <= 0x200a)
    || codePoint === 0x0020
    || codePoint === 0x00a0
    || codePoint === 0x1680
    || codePoint === 0x2028
    || codePoint === 0x2029
    || codePoint === 0x202f
    || codePoint === 0x205f
    || codePoint === 0x3000
    || codePoint === 0xfeff;
}
function isUnicodeScalarSequence(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}
