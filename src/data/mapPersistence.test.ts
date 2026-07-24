import { describe, expect, it } from 'vitest';
import { createSampleState } from '../core/sampleState';
import { exportMapData, importMapData } from './mapPersistence';

describe('map persistence', () => {
  it('exports editable city coordinates and neighbors', () => {
    const exported = exportMapData(createSampleState());

    expect(exported.cities.luoyang).toMatchObject({
      id: 'luoyang',
      name: '洛阳',
      x: 520,
      y: 250,
      neighbors: ['chang-an', 'chenliu', 'xuchang'],
    });
  });

  it('imports map coordinates and neighbors without mutating the original state', () => {
    const state = createSampleState();
    const next = importMapData(state, {
      cities: {
        luoyang: {
          id: 'luoyang',
          name: '洛阳',
          x: 600,
          y: 300,
          neighbors: ['xuchang'],
        },
      },
    });

    expect(next.cities.luoyang.x).toBe(600);
    expect(next.cities.luoyang.neighbors).toEqual(['xuchang']);
    expect(state.cities.luoyang.x).toBe(520);
    expect(state.cities.luoyang.neighbors).toEqual(['chang-an', 'chenliu', 'xuchang']);
  });

  it('rejects unknown city ids during import', () => {
    const state = createSampleState();

    expect(() =>
      importMapData(state, {
        cities: {
          unknown: {
            id: 'unknown',
            name: '未知',
            x: 1,
            y: 1,
            neighbors: [],
          },
        },
      }),
    ).toThrow('Unknown city id: unknown');
  });
});
