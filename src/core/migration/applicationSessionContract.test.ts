import { describe, expect, it } from 'vitest';
import { canonicalSha256 } from './canonicalJson';
import {
  createProductionSessionState,
  OracleApplicationSession,
  validateEnvelope,
} from './applicationSessionContract';
import { buildProductionDataBundle } from './productionDataContract';

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

  it('uses stable closed-envelope validation errors', () => {
    expect(validateEnvelope({ z: 1, a: 2 })).toEqual({
      ok: false,
      code: 'invalid_envelope',
      error: 'unknown command envelope field: a',
    });
  });
});
