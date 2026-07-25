import { BayeLibArchive } from './libArchive';

const CITY_COUNT = 38;
const PERSON_COUNT = 200;
const LEGACY_CITY_LENGTH = 31;
const LEGACY_PERSON_LENGTH = 15;

const RESOURCE = {
  interfaceConstants: 2,
  cities: 57,
  cityNames: 58,
  cityLinks: 59,
  persons: 61,
  personNames: [62, 70, 71, 72],
  personQueue: 65,
  goodsQueue: 68,
} as const;

const INTERFACE_ITEM = {
  cityPositions: 6,
} as const;

const legacyGlyphs: Record<string, string> = {
  '€': '傕',
  '\ue76d': '彧',
  '\ue76e': '惇',
  '\ue77d': '祎',
  '\ue77e': '嶷',
};

export type BayeLegacyCityRecord = {
  sourceIndex: number;
  rulerIndex: number | null;
  satrapIndex: number | null;
  farmingLimit: number;
  farming: number;
  commerceLimit: number;
  commerce: number;
  publicLoyalty: number;
  disasterPrevention: number;
  populationLimit: number;
  population: number;
  money: number;
  food: number;
  reserveTroops: number;
  personQueueOffset: number;
  personCount: number;
  goodsQueueOffset: number;
  goodsCount: number;
};

export type BayeLegacyPersonRecord = {
  sourceIndex: number;
  legacyIndexMarker: number;
  rulerIndex: number | null;
  level: number;
  force: number;
  intelligence: number;
  loyalty: number;
  character: number;
  experience: number;
  stamina: number;
  armsType: number;
  troops: number;
  equipmentIndexes: readonly [number | null, number | null];
  age: number;
};

export type BayeLegacyCity = BayeLegacyCityRecord & {
  name: string;
  mapX: number;
  mapY: number;
  neighborIndexes: number[];
  personIndexes: number[];
  goodsIndexes: number[];
};

export type BayeLegacyPerson = BayeLegacyPersonRecord & {
  name: string;
};

export type BayeLegacyPeriod = {
  period: 1 | 2 | 3 | 4;
  year: number;
  cities: BayeLegacyCity[];
  persons: BayeLegacyPerson[];
  rulerIndexes: number[];
};

export function parseBayeLegacyPeriod(bytes: Uint8Array, period: 1 | 2 | 3 | 4 = 1): BayeLegacyPeriod {
  const archive = new BayeLibArchive(bytes);
  const cityBytes = archive.getItem(RESOURCE.cities, period);
  const personBytes = archive.getItem(RESOURCE.persons, period);
  const personQueue = archive.getItem(RESOURCE.personQueue, period);
  const goodsQueue = archive.getItem(RESOURCE.goodsQueue, period);
  const positions = archive.getItem(RESOURCE.interfaceConstants, INTERFACE_ITEM.cityPositions);
  const links = archive.getItem(RESOURCE.cityLinks, 1);

  assertLength(cityBytes, CITY_COUNT * LEGACY_CITY_LENGTH + 2, 'period city data');
  assertLength(personBytes, PERSON_COUNT * LEGACY_PERSON_LENGTH, 'period person data');
  assertLength(personQueue, PERSON_COUNT, 'period person queue');
  assertMinimumLength(positions, CITY_COUNT * 2, 'city positions');
  assertMinimumLength(links, CITY_COUNT * 16, 'city links');

  const persons = Array.from({ length: PERSON_COUNT }, (_, sourceIndex) => ({
    ...parseBayeLegacyPersonRecord(personBytes.subarray(sourceIndex * LEGACY_PERSON_LENGTH), sourceIndex),
    name: decodeBayeLegacyString(archive.getItem(RESOURCE.personNames[period - 1], sourceIndex + 1)),
  }));
  const cities = Array.from({ length: CITY_COUNT }, (_, sourceIndex) => {
    const record = parseBayeLegacyCityRecord(cityBytes.subarray(sourceIndex * LEGACY_CITY_LENGTH), sourceIndex);
    return {
      ...record,
      name: decodeBayeLegacyString(archive.getItem(RESOURCE.cityNames, sourceIndex + 1)),
      mapX: positions[sourceIndex * 2],
      mapY: positions[sourceIndex * 2 + 1],
      neighborIndexes: [...links.subarray(sourceIndex * 16, sourceIndex * 16 + 8)]
        .filter((value) => value !== 0)
        .map((value) => value - 1),
      personIndexes: [...personQueue.subarray(record.personQueueOffset, record.personQueueOffset + record.personCount)],
      goodsIndexes: [...goodsQueue.subarray(record.goodsQueueOffset, record.goodsQueueOffset + record.goodsCount)],
    };
  });
  validateQueueReferences(cities, persons.length, goodsQueue.length);

  return {
    period,
    year: new DataView(cityBytes.buffer, cityBytes.byteOffset, cityBytes.byteLength).getUint16(
      CITY_COUNT * LEGACY_CITY_LENGTH,
      true,
    ),
    cities,
    persons,
    rulerIndexes: persons
      .filter((person) => person.rulerIndex === person.sourceIndex)
      .map((person) => person.sourceIndex),
  };
}

export function parseBayeLegacyCityRecord(bytes: Uint8Array, expectedIndex: number): BayeLegacyCityRecord {
  assertMinimumLength(bytes, LEGACY_CITY_LENGTH, 'legacy city record');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sourceIndex = bytes[0];
  if (sourceIndex !== expectedIndex) {
    throw new Error(`legacy city index mismatch: expected ${expectedIndex}, got ${sourceIndex}`);
  }
  return {
    sourceIndex,
    rulerIndex: fromOneBased(bytes[1]),
    satrapIndex: fromOneBased(bytes[2]),
    farmingLimit: view.getUint16(3, true),
    farming: view.getUint16(5, true),
    commerceLimit: view.getUint16(7, true),
    commerce: view.getUint16(9, true),
    publicLoyalty: bytes[11],
    disasterPrevention: bytes[12],
    populationLimit: view.getUint32(13, true),
    population: view.getUint32(17, true),
    money: view.getUint16(21, true),
    food: view.getUint16(23, true),
    reserveTroops: view.getUint16(25, true),
    personQueueOffset: bytes[27],
    personCount: bytes[28],
    goodsQueueOffset: bytes[29],
    goodsCount: bytes[30],
  };
}

export function parseBayeLegacyPersonRecord(bytes: Uint8Array, expectedIndex: number): BayeLegacyPersonRecord {
  assertMinimumLength(bytes, LEGACY_PERSON_LENGTH, 'legacy person record');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    sourceIndex: expectedIndex,
    legacyIndexMarker: bytes[0],
    rulerIndex: fromOneBased(bytes[1]),
    level: bytes[2],
    force: bytes[3],
    intelligence: bytes[4],
    loyalty: bytes[5],
    character: bytes[6],
    experience: bytes[7],
    stamina: bytes[8],
    armsType: bytes[9],
    troops: view.getUint16(10, true),
    equipmentIndexes: [fromOneBased(bytes[12]), fromOneBased(bytes[13])],
    age: bytes[14],
  };
}

export function decodeBayeLegacyString(bytes: Uint8Array): string {
  const terminator = bytes.indexOf(0);
  const content = terminator === -1 ? bytes : bytes.subarray(0, terminator);
  return [...new TextDecoder('gbk', { fatal: true }).decode(content)]
    .map((character) => legacyGlyphs[character] ?? character)
    .join('');
}

function validateQueueReferences(cities: BayeLegacyCity[], personCount: number, goodsCount: number): void {
  for (const city of cities) {
    for (const personIndex of city.personIndexes) {
      if (personIndex >= personCount) throw new Error(`${city.name} references unknown person ${personIndex}`);
    }
    for (const goodsIndex of city.goodsIndexes) {
      if ((goodsIndex & 0x7f) >= goodsCount) throw new Error(`${city.name} references unknown goods ${goodsIndex}`);
    }
  }
}

function fromOneBased(value: number): number | null {
  return value === 0 ? null : value - 1;
}

function assertLength(bytes: Uint8Array, length: number, label: string): void {
  if (bytes.byteLength !== length) throw new Error(`${label} must be ${length} bytes, got ${bytes.byteLength}`);
}

function assertMinimumLength(bytes: Uint8Array, length: number, label: string): void {
  if (bytes.byteLength < length) throw new Error(`${label} must contain at least ${length} bytes, got ${bytes.byteLength}`);
}
