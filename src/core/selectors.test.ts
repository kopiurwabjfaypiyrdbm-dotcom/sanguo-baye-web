import { describe, expect, it } from 'vitest';
import { createSampleState } from './sampleState';
import { getCityOfficers, getNeighborCities, getPlayerFaction } from './selectors';

describe('core selectors', () => {
  it('returns officers stationed in a city', () => {
    const state = createSampleState();

    expect(getCityOfficers(state, 'luoyang').map((officer) => officer.name)).toContain('曹操');
  });

  it('returns neighboring cities from city ids', () => {
    const state = createSampleState();

    expect(getNeighborCities(state, 'luoyang').map((city) => city.id)).toContain('xuchang');
  });

  it('returns the player faction', () => {
    const state = createSampleState();

    expect(getPlayerFaction(state)).toMatchObject({
      id: 'cao-cao',
      name: '曹操军',
      isPlayer: true,
    });
  });
});
