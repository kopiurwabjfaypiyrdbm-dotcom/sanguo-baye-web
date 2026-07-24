import { describe, expect, it } from 'vitest';
import { createSampleState } from '../core/sampleState';
import { exportMapData, importMapData, parseMapData } from './mapPersistence';

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
          neighbors: ['chang-an', 'chenliu', 'xuchang'],
        },
      },
    });

    expect(next.cities.luoyang.x).toBe(600);
    expect(next.cities.luoyang.neighbors).toEqual(['chang-an', 'chenliu', 'xuchang']);
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

  it('round-trips the complete starter map', () => {
    const state = createSampleState();
    const exported = exportMapData(state);

    expect(importMapData(state, JSON.stringify(exported)).cities).toEqual(state.cities);
  });

  it('rejects malformed runtime map data', () => {
    expect(() => parseMapData({ cities: { luoyang: { id: 'other' } } })).toThrow(
      'Invalid map data at cities.luoyang.id',
    );
  });

  it('rejects asymmetric roads after import', () => {
    const state = createSampleState();
    const exported = exportMapData(state);
    exported.cities.luoyang.neighbors = ['xuchang'];

    expect(() => importMapData(state, exported)).toThrow('road is not reciprocal');
  });
});
