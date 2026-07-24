import type { GameState } from "../core/types";

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

export function importMapData(state: GameState, mapData: MapData): GameState {
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

  return {
    ...state,
    cities,
  };
}
