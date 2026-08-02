import { developFarming } from '../cityCommands';
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

    const parameters = envelope.parameters as { cityId: string; officerId: string };
    try {
      const next = JSON.parse(JSON.stringify(developFarming(before, parameters))) as GameState;
      const afterDigest = canonicalSha256(next);
      const result: ApplicationCommandResult = {
        ...base(envelope, true, 'ok', ''),
        stateChanged: true,
        beforeStateSha256: beforeDigest,
        afterStateSha256: afterDigest,
        receipt: projectReceipt(before, next, parameters),
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
  if (raw.kind !== 'develop_farming') return rejected('unknown_command', `unsupported command kind: ${raw.kind}`);
  const parameterKeys = ['cityId', 'officerId'];
  const parameterRecordKeys = Object.keys(raw.parameters);
  if (parameterRecordKeys.some((key) => !isUnicodeScalarSequence(key))) {
    return rejected('invalid_parameters', 'parameter field names must be Unicode scalar sequences');
  }
  const unknownParameters = parameterRecordKeys
    .filter((key) => !parameterKeys.includes(key)).sort(compareUnicodeScalar);
  if (unknownParameters.length > 0) {
    return rejected('invalid_parameters', `unknown develop_farming parameter: ${unknownParameters[0]}`);
  }
  for (const key of parameterKeys) {
    if (!isNonBlank(raw.parameters[key])) return rejected('invalid_parameters', `${key} must be a non-blank string`);
    if (!isUnicodeScalarSequence(raw.parameters[key])) {
      return rejected('invalid_parameters', `${key} must be a Unicode scalar sequence`);
    }
  }
  return { ok: true, envelope: structuredClone(raw) as ApplicationCommandEnvelope };
}

function projectReceipt(
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
