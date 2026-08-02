import { describe, expect, it } from 'vitest';
import { canonicalSha256 } from './migration/canonicalJson';
import {
  buildProductionCatalog,
  buildProductionDataBundle,
  validateProductionCatalog,
  validateProductionEnvelope,
} from './migration/productionDataContract';

describe('Godot production domain data contract', () => {
  it('builds four ordered, valid and deterministic campaign envelopes', () => {
    const first = buildProductionDataBundle();
    const second = buildProductionDataBundle();
    expect(first.envelopes.map((envelope) => envelope.scenario.periodId)).toEqual([1, 2, 3, 4]);
    expect(first.envelopes.map(validateProductionEnvelope)).toEqual([[], [], [], []]);
    expect(validateProductionCatalog(first.catalog, first.envelopes)).toEqual([]);
    expect(canonicalSha256(first)).toBe(canonicalSha256(second));
    for (const envelope of first.envelopes) {
      expect(envelope.state.cityOrder).toHaveLength(38);
      expect(envelope.state.graph).toMatchObject({ cityCount: 38, roadCount: 54, directedNeighborReferenceCount: 108 });
      expect(envelope.stateSha256).toBe(canonicalSha256(envelope.state));
      expect(envelope.scenario.playerCandidates.length).toBeGreaterThan(0);
    }
  });

  it('rejects contract, ruleset, graph, reference, order, digest and numeric corruption deterministically', () => {
    const { envelopes } = buildProductionDataBundle();
    const mutations: Array<[string, (value: any) => void, string]> = [
      ['version', (value) => { value.productionDataContractVersion = 99; }, 'productionDataContractVersion'],
      ['ruleset', (value) => { value.scenario.rulesetId = 'unknown'; }, 'scenario.rulesetId'],
      ['road', (value) => { value.state.cities['city-3'].neighbors = value.state.cities['city-3'].neighbors.filter((id: string) => id !== 'city-0'); }, 'road is not reciprocal'],
      ['officer', (value) => { value.state.officers['officer-1'].cityId = 'missing-city'; }, 'unknown city'],
      ['item', (value) => { value.state.items['item-0'].armsTypeOverride = 'missing-arms'; }, 'unknown arms type'],
      ['arms', (value) => { value.state.officers['officer-1'].armsTypeId = 'missing-arms'; }, 'unknown arms type'],
      ['duplicate-order', (value) => { value.state.cityOrder[1] = value.state.cityOrder[0]; }, 'contains duplicate ids'],
      ['reordered-order', (value) => { value.state.cityOrder.reverse(); }, 'stateSha256'],
      ['digest', (value) => { value.stateSha256 = '0'.repeat(64); }, 'stateSha256'],
      ['number-domain', (value) => {
        value.state.armsTypes[value.state.armsTypeOrder[0]].attackModifier = 1.2345678;
      }, 'at most 6 decimal places'],
      ['missing-title', (value) => { delete value.scenario.title; }, 'scenario.title: missing field'],
      ['unknown-scenario-field', (value) => { value.scenario.unexpected = true; }, 'scenario.unexpected: unknown field'],
      ['missing-calendar', (value) => { delete value.state.calendar; }, 'state.calendar: missing field'],
      ['missing-graph', (value) => { value.state.graph = null; }, 'state.graph: expected object'],
      ['graph-roads', (value) => { value.state.graph.roads.pop(); }, 'state.graph.roads'],
      ['turn', (value) => { value.state.turn = 2; }, 'state.turn'],
      ['rng-domain', (value) => { value.state.rngSeed = 0x1_0000_0000; }, 'state.rngSeed'],
      ['faction-name-type', (value) => { value.state.factions['ruler-0'].name = 123; }, 'state.factions.ruler-0.name'],
      ['scenario-source-type', (value) => { value.state.scenario.source = 123; }, 'state.scenario.source'],
      ['city-type-type', (value) => { value.state.cities['city-0'].type = 123; }, 'state.cities.city-0.type'],
      ['arms-modifier-type', (value) => { value.state.armsTypes.archer.attackModifier = '1'; }, 'state.armsTypes.archer.attackModifier'],
      ['log-message-type', (value) => { value.state.logs[0].message = 123; }, 'state.logs[0].message'],
      ['unsafe-scenario-period-type', (value) => { value.state.scenario.period = {}; }, 'state.scenario.period'],
      ['unsafe-city-source-type', (value) => { value.state.cities['city-0'].sourceIndex = {}; }, 'state.cities.city-0.sourceIndex'],
      ['empty-faction-name', (value) => { value.state.factions['ruler-0'].name = ''; }, 'state.factions.ruler-0.name'],
      ['unknown-log-kind', (value) => { value.state.logs[0].kind = 'unknown'; }, 'state.logs[0].kind'],
      ['empty-satrap-reference', (value) => { value.state.cities['city-0'].satrapOfficerId = ''; }, 'state.cities.city-0.satrapOfficerId'],
      ['empty-arms-override', (value) => { value.state.items['item-0'].armsTypeOverride = ''; }, 'state.items.item-0.armsTypeOverride'],
    ];
    for (const [, mutate, expected] of mutations) {
      const value = structuredClone(envelopes[0]);
      mutate(value);
      const first = validateProductionEnvelope(value);
      expect(first.join('\n')).toContain(expected);
      expect(validateProductionEnvelope(value)).toEqual(first);
    }
  });

  it('keeps validation issue ordering independent of record insertion order', () => {
    const { envelopes } = buildProductionDataBundle();
    const first = structuredClone(envelopes[0]);
    first.state.cities['city-0'].ownerId = 'missing-a';
    first.state.cities['city-1'].ownerId = 'missing-b';
    const reordered = structuredClone(first);
    reordered.state.cities = Object.fromEntries(Object.entries(reordered.state.cities).reverse());
    expect(validateProductionEnvelope(reordered)).toEqual(validateProductionEnvelope(first));
  });

  it('rejects catalog reordering and incorrect envelope digests', () => {
    const { catalog, envelopes } = buildProductionDataBundle();
    const reordered = structuredClone(catalog);
    reordered.periods.reverse();
    expect(validateProductionCatalog(reordered, envelopes).join('\n')).toContain('strictly ascending');
    const badDigest = buildProductionCatalog(envelopes);
    badDigest.periods[0].envelopeSha256 = '0'.repeat(64);
    expect(validateProductionCatalog(badDigest, envelopes)).toContain('periods[0].envelopeSha256: mismatch');
    const badUsage = structuredClone(catalog) as any;
    badUsage.usage.unexpected = true;
    expect(validateProductionCatalog(badUsage, envelopes)).toContain('usage.unexpected: unknown field');
    badUsage.usage.scope = 42;
    expect(validateProductionCatalog(badUsage, envelopes).join('\n')).toContain('usage.scope: must be a non-empty string');
  });
});
