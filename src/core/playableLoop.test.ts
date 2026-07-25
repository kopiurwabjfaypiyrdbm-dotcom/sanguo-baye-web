import { describe, expect, it } from 'vitest';
import { executeAttack } from './battle';
import { updateCitySatraps } from './administration';
import { developFarming, distributeTroops, recruitTroops } from './cityCommands';
import { createSampleState } from './sampleState';
import { advanceTurn } from './turn';
import { validateGameState } from './validation';

describe('playable strategy loop', () => {
  it('connects city management, battle, AI, settlement, and a new player month', () => {
    let original = createSampleState();
    original.officers['cao-cao'].cityId = 'chang-an';
    original.officers['xun-yu'].troops = 100;
    original = updateCitySatraps(original);
    const developed = developFarming(original, { cityId: 'luoyang', officerId: 'xiahou-dun' });
    const recruited = recruitTroops(developed, { cityId: 'xuchang', officerId: 'xun-yu', amount: 500 });
    const distributed = distributeTroops(recruited, {
      cityId: 'xuchang',
      officerId: 'xun-yu',
      targetTroops: 500,
    });
    const afterBattle = executeAttack(distributed, {
      sourceCityId: 'chang-an',
      targetCityId: 'hanzhong',
      officerIds: ['cao-cao'],
      provisions: 100,
    });
    const nextMonth = advanceTurn(afterBattle);

    expect(developed.cities.luoyang.farming).toBeGreaterThan(original.cities.luoyang.farming);
    expect(recruited.cities.xuchang.reserveTroops).toBe(original.cities.xuchang.reserveTroops + 500);
    expect(distributed.officers['xun-yu'].troops).toBe(500);
    expect(afterBattle.logs.some((log) => log.kind === 'battle')).toBe(true);
    expect(nextMonth.turn).toBe(2);
    expect(nextMonth.calendar).toEqual({ year: 190, month: 2 });
    expect(nextMonth.phase).toBe('player');
    expect(nextMonth.activeFactionId).toBe(nextMonth.playerFactionId);
    expect(nextMonth.logs.some((log) => log.kind === 'ai')).toBe(true);
    expect(validateGameState(nextMonth)).toEqual([]);
  });
});
