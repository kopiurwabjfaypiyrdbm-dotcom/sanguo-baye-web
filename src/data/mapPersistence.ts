import type { GameState } from "../core/types";
import { validateGameState } from '../core/validation';

export type MapCityData = {
  id: string;
  name: string;
  x: number;
  y: number;
  neighbors: string[];
};

export type MapData = {
  cities: Record<string, MapCityData>;
};

export function exportMapData(state: GameState): MapData {
  return {
    cities: Object.fromEntries(
      Object.values(state.cities).map((city) => [
        city.id,
        {
          id: city.id,
          name: city.name,
          x: city.x,
          y: city.y,
          neighbors: [...city.neighbors],
        },
      ]),
    ),
  };
}

export function parseMapData(input: unknown): MapData {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      throw new Error('Invalid map JSON');
    }
  }
  if (!isRecord(value) || !isRecord(value.cities)) {
    throw new Error('Invalid map data: cities must be an object');
  }

  const cities: Record<string, MapCityData> = {};
  for (const [cityId, cityValue] of Object.entries(value.cities)) {
    if (!isRecord(cityValue)) throw new Error(`Invalid map data at cities.${cityId}`);
    if (cityValue.id !== cityId) throw new Error(`Invalid map data at cities.${cityId}.id`);
    if (typeof cityValue.name !== 'string' || cityValue.name.trim() === '') {
      throw new Error(`Invalid map data at cities.${cityId}.name`);
    }
    if (!Number.isFinite(cityValue.x) || !Number.isFinite(cityValue.y)) {
      throw new Error(`Invalid map data at cities.${cityId}.coordinates`);
    }
    if (!Array.isArray(cityValue.neighbors) || cityValue.neighbors.some((id) => typeof id !== 'string' || id === '')) {
      throw new Error(`Invalid map data at cities.${cityId}.neighbors`);
    }
    if (new Set(cityValue.neighbors).size !== cityValue.neighbors.length || cityValue.neighbors.includes(cityId)) {
      throw new Error(`Invalid map data at cities.${cityId}.neighbors`);
    }
    cities[cityId] = {
      id: cityId,
      name: cityValue.name,
      x: cityValue.x as number,
      y: cityValue.y as number,
      neighbors: [...cityValue.neighbors] as string[],
    };
  }

  return { cities };
}

export function importMapData(state: GameState, input: unknown): GameState {
  const mapData = parseMapData(input);
  const cities = { ...state.cities };

  for (const [cityId, cityData] of Object.entries(mapData.cities)) {
    const city = cities[cityId];
    if (!city) {
      throw new Error(`Unknown city id: ${cityId}`);
    }

    for (const neighborId of cityData.neighbors) {
      if (!cities[neighborId]) {
        throw new Error(`Unknown city id: ${neighborId}`);
      }
    }

    cities[cityId] = {
      ...city,
      name: cityData.name,
      x: cityData.x,
      y: cityData.y,
      neighbors: [...cityData.neighbors],
    };
  }

  const next = {
    ...state,
    cities,
  };

  const mapIssue = validateGameState(next).find((issue) => issue.path.startsWith('cities.'));
  if (mapIssue) {
    throw new Error(`Invalid map data at ${mapIssue.path}: ${mapIssue.message}`);
  }

  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
