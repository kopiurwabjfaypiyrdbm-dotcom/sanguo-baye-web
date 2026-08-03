import { describe, expect, it } from 'vitest';
import { canonicalSha256 } from './canonicalJson';
import {
  createProductionSessionState,
  OracleApplicationSession,
  validateEnvelope,
} from './applicationSessionContract';
import { buildProductionDataBundle } from './productionDataContract';
import { killOfficer } from '../officerLifecycle';

describe('Godot production application session oracle', () => {
  it('starts every declared candidate without consuming the period seed', () => {
    const bundle = buildProductionDataBundle();
    for (const envelope of bundle.envelopes) {
      for (const candidate of envelope.scenario.playerCandidates) {
        const state = createProductionSessionState(envelope.scenario.periodId, candidate.sourceIndex);
        expect(state.rngSeed).toBe(envelope.state.rngSeed);
        expect(state.playerFactionId).toBe(candidate.factionId);
        expect(state.activeFactionId).toBe(candidate.factionId);
        expect(Object.values(state.factions).filter((faction) => faction.isPlayer)).toHaveLength(1);
      }
    }
  });

  it('commits once and returns the original result for an exact duplicate', () => {
    const initial = createProductionSessionState(1, 1);
    const session = new OracleApplicationSession(initial);
    const command = {
      commandEnvelopeVersion: 1,
      commandId: 'test-0001',
      expectedStateSha256: canonicalSha256(initial),
      kind: 'develop_farming',
      parameters: { cityId: 'city-12', officerId: 'officer-1' },
    };
    const first = session.execute(command);
    const duplicate = session.execute(command);
    expect(first.ok).toBe(true);
    expect(duplicate).toEqual(first);
    expect(canonicalSha256(session.snapshot())).toBe(first.afterStateSha256);
  });

  it('issues an intelligence-gated diplomatic order and settles it through the oracle bridge', () => {
    const initial = createProductionSessionState(1, 1);
    const session = new OracleApplicationSession(initial);
    const reconnaissance = session.execute({
      commandEnvelopeVersion: 1,
      commandId: 'test-diplomacy-recon',
      expectedStateSha256: canonicalSha256(initial),
      kind: 'reconnoitre_city',
      parameters: { sourceCityId: 'city-12', targetCityId: 'city-0', officerId: 'officer-32' },
    });
    expect(reconnaissance.ok).toBe(true);
    const issued = session.execute({
      commandEnvelopeVersion: 1,
      commandId: 'test-diplomacy-issue',
      expectedStateSha256: reconnaissance.afterStateSha256,
      kind: 'issue_alienate_order',
      parameters: { sourceCityId: 'city-12', officerId: 'officer-1', targetOfficerId: 'officer-56' },
    });
    expect(issued).toMatchObject({ ok: true, stateChanged: true });
    expect(issued.state.diplomaticOrders['diplomatic-order-1']).toMatchObject({
      kind: 'alienate', officerId: 'officer-1', targetOfficerId: 'officer-56', remainingMonths: 1,
    });
    expect(issued.state.rngSeed).toBe(initial.rngSeed);

    const settled = session.advanceDiplomaticOrders();
    expect(settled.ok).toBe(true);
    expect(settled.state.diplomaticOrders).toEqual({});
    expect(settled.state.officers['officer-1'].cityId).toBe('city-12');
    expect(settled.state.rngSeed).not.toBe(initial.rngSeed);
    expect(settled.receipt).toMatchObject({
      kind: 'advance_diplomatic_orders',
      completedOrderIds: ['diplomatic-order-1'],
      activeOrders: [],
    });
  });

  it('uses stable closed-envelope validation errors', () => {
    expect(validateEnvelope({ z: 1, a: 2 })).toEqual({
      ok: false,
      code: 'invalid_envelope',
      error: 'unknown command envelope field: a',
    });
    expect(validateEnvelope({
      commandEnvelopeVersion: 1,
      commandId: '\u00a0',
      expectedStateSha256: '0'.repeat(64),
      kind: 'develop_farming',
      parameters: { cityId: 'city-12', officerId: 'officer-1' },
    })).toEqual({
      ok: false,
      code: 'invalid_command_id',
      error: 'commandId must be a non-blank string',
    });
  });

  it('resolves a durable player succession through the idempotent application envelope', () => {
    const initial = createProductionSessionState(1, 1);
    const pending = JSON.parse(JSON.stringify(killOfficer(initial, {
      officerId: 'officer-1', cause: 'natural-death', cityId: 'city-12',
    }))) as typeof initial;
    const successorOfficerId = pending.pendingSuccession!.candidateOfficerIds[0];
    const session = new OracleApplicationSession(pending);
    const command = {
      commandEnvelopeVersion: 1,
      commandId: 'test-succession-0001',
      expectedStateSha256: canonicalSha256(pending),
      kind: 'resolve_succession',
      parameters: { successorOfficerId },
    };
    const first = session.execute(command);
    const duplicate = session.execute(command);

    expect(first).toMatchObject({ ok: true, stateChanged: true, code: 'ok' });
    expect(first.state.phase).toBe('player');
    expect(first.state.pendingSuccession).toBeUndefined();
    expect(first.state.factions[first.state.playerFactionId].rulerOfficerId).toBe(successorOfficerId);
    expect(first.receipt).toMatchObject({ kind: 'resolve_succession', successorOfficerId });
    expect(duplicate).toEqual(first);
  });

  it('rejects malformed Unicode without throwing from canonical hashing', () => {
    const initial = createProductionSessionState(1, 1);
    const session = new OracleApplicationSession(initial);
    const result = session.execute({
      commandEnvelopeVersion: 1,
      commandId: '\ud800',
      expectedStateSha256: canonicalSha256(initial),
      kind: 'develop_farming',
      parameters: { cityId: 'city-12', officerId: 'officer-1' },
    });
    expect(result).toMatchObject({ ok: false, code: 'invalid_envelope', stateChanged: false });
    expect(canonicalSha256(session.snapshot())).toBe(canonicalSha256(initial));
  });
});
