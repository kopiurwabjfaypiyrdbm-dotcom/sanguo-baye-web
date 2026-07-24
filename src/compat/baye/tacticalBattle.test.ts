import { describe, expect, it } from 'vitest';
import fixture from '../../../references/fixtures/battle-c-oracle.json';
import {
  adjustBayeTerrainValue,
  buildBayeAttackAttributes,
  countBayeAttackDamage,
  resolveBayeArmsType,
  resolveBayeStrategicBattle,
  type BayeArmsType,
  type BayeTerrain,
} from './tacticalBattle';

describe('Baye C battle formula compatibility', () => {
  it('matches all six arms types across all eight terrain defence factors', () => {
    expect(fixture.results.attackAttributes).toHaveLength(6 * 8);
    for (const expected of fixture.results.attackAttributes) {
      expect(
        buildBayeAttackAttributes({
          force: expected.force,
          intelligence: expected.intelligence,
          level: expected.level,
          armsType: expected.armsType as BayeArmsType,
          terrain: expected.terrain as BayeTerrain,
          terrainShift: expected.terrainShift,
        }),
      ).toEqual({ attack: expected.attack, defence: expected.defence });
    }
  });

  it('matches the independently compiled 6x6 arms-subdual damage matrix', () => {
    const { input, values } = fixture.results.damageMatrix;
    expect(values).toHaveLength(6);
    for (let attacker = 0; attacker < values.length; attacker += 1) {
      expect(values[attacker]).toHaveLength(6);
      for (let defender = 0; defender < values[attacker].length; defender += 1) {
        expect(
          countBayeAttackDamage({
            ...input,
            attackerArmsType: attacker as BayeArmsType,
            defenderArmsType: defender as BayeArmsType,
          }),
        ).toBe(values[attacker][defender]);
      }
    }
  });

  it('preserves C shift, clamp, unsigned-cast, and U16 wrap semantics', () => {
    for (const expected of fixture.results.terrainShiftCases) {
      expect(adjustBayeTerrainValue(expected.input, expected.shift)).toBe(expected.value);
    }
  });

  it('matches equipment arm overrides, including second-slot precedence', () => {
    for (const expected of fixture.results.armsTypeCases) {
      expect(
        resolveBayeArmsType(
          expected.baseArmsType as BayeArmsType,
          expected.toolArmCodes as [number, number],
        ),
      ).toBe(expected.value);
    }
  });

  it('keeps strategic auto-resolution separate and matches every probability boundary', () => {
    for (const expected of fixture.results.strategicCases) {
      expect(resolveBayeStrategicBattle(expected)).toBe(expected.result);
    }
  });

  it('rejects ambiguous zero-troop and invalid damage inputs', () => {
    expect(() =>
      resolveBayeStrategicBattle({
        attackerTroops: 0,
        defenderTroops: 100,
        attackerFood: 0,
        defenderFood: 0,
        randomValue: 50,
      }),
    ).toThrow('zero-troop outcomes');
    expect(() =>
      countBayeAttackDamage({
        attack: 100,
        defence: 0,
        troops: 100,
        attackerArmsType: 0,
        defenderArmsType: 0,
      }),
    ).toThrow('defence must be greater than zero');
  });
});
