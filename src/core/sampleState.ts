import type { ArmsType, City, Faction, GameState, Item, Officer } from './types';

const factions: Record<string, Faction> = {
  'cao-cao': {
    id: 'cao-cao',
    name: '曹操军',
    rulerOfficerId: 'cao-cao',
    color: '#4f6f52',
    isPlayer: true,
    aiProfile: 'balanced',
  },
  'liu-bei': {
    id: 'liu-bei',
    name: '刘备军',
    rulerOfficerId: 'liu-bei',
    color: '#4d72aa',
    isPlayer: false,
    aiProfile: 'defensive',
  },
  'sun-quan': {
    id: 'sun-quan',
    name: '孙权军',
    rulerOfficerId: 'sun-quan',
    color: '#b36b3f',
    isPlayer: false,
    aiProfile: 'aggressive',
  },
};

const cities: Record<string, City> = {
  luoyang: city('luoyang', '洛阳', 520, 250, 'capital', '司隶', 'cao-cao', ['chang-an', 'chenliu', 'xuchang'], 820000, 560, 720, 520),
  'chang-an': city('chang-an', '长安', 360, 250, 'capital', '关中', 'cao-cao', ['luoyang', 'hanzhong'], 760000, 620, 540, 560),
  chenliu: city('chenliu', '陈留', 620, 320, 'city', '兖州', 'cao-cao', ['luoyang', 'xuchang', 'xiaopei'], 420000, 430, 500, 320),
  xuchang: city('xuchang', '许昌', 560, 390, 'capital', '豫州', 'cao-cao', ['luoyang', 'chenliu', 'shouchun', 'xiangyang'], 580000, 520, 610, 430),
  hanzhong: city('hanzhong', '汉中', 300, 390, 'frontier', '汉中', 'liu-bei', ['chang-an', 'chengdu', 'xiangyang'], 300000, 450, 280, 410),
  chengdu: city('chengdu', '成都', 220, 540, 'capital', '益州', 'liu-bei', ['hanzhong', 'jiangzhou'], 700000, 680, 430, 480),
  jiangzhou: city('jiangzhou', '江州', 360, 560, 'city', '巴郡', 'liu-bei', ['chengdu', 'xiangyang', 'jiangling'], 360000, 410, 360, 340),
  xiangyang: city('xiangyang', '襄阳', 520, 520, 'city', '荆州', 'liu-bei', ['xuchang', 'hanzhong', 'jiangzhou', 'jiangling'], 520000, 500, 500, 420),
  jiangling: city('jiangling', '江陵', 610, 580, 'city', '荆南', 'sun-quan', ['xiangyang', 'jiangzhou', 'wuchang'], 430000, 460, 440, 350),
  shouchun: city('shouchun', '寿春', 720, 430, 'city', '淮南', 'sun-quan', ['xuchang', 'jianye', 'wuchang'], 390000, 400, 520, 340),
  jianye: city('jianye', '建业', 820, 540, 'capital', '扬州', 'sun-quan', ['shouchun', 'wuchang'], 640000, 560, 660, 460),
  wuchang: city('wuchang', '武昌', 700, 590, 'city', '江夏', 'sun-quan', ['jiangling', 'shouchun', 'jianye'], 410000, 480, 430, 360),
};

const officers: Record<string, Officer> = {
  'cao-cao': officer('cao-cao', '曹操', 84, 90, 86, '骑兵', 'cao-cao', 'luoyang', 6200, 100, 45),
  'xiahou-dun': officer('xiahou-dun', '夏侯惇', 92, 64, 78, '骑兵', 'cao-cao', 'luoyang', 5000, 94, 39),
  'xun-yu': officer('xun-yu', '荀彧', 35, 96, 74, '步兵', 'cao-cao', 'xuchang', 2600, 98, 42),
  'zhang-liao': officer('zhang-liao', '张辽', 94, 78, 88, '骑兵', 'cao-cao', 'chenliu', 5400, 92, 36),
  'liu-bei': officer('liu-bei', '刘备', 85, 76, 84, '骑兵', 'liu-bei', 'chengdu', 5600, 100, 43),
  'guan-yu': officer('guan-yu', '关羽', 106, 81, 94, '步兵', 'liu-bei', 'hanzhong', 6200, 98, 41, '青龙刀'),
  'zhuge-liang': officer('zhuge-liang', '诸葛亮', 38, 100, 96, '玄兵', 'liu-bei', 'xiangyang', 4200, 100, 32),
  'zhang-fei': officer('zhang-fei', '张飞', 99, 45, 82, '骑兵', 'liu-bei', 'jiangzhou', 5800, 91, 39),
  'sun-quan': officer('sun-quan', '孙权', 74, 73, 80, '骑兵', 'sun-quan', 'jianye', 5200, 100, 30),
  'zhou-yu': officer('zhou-yu', '周瑜', 78, 97, 92, '水兵', 'sun-quan', 'wuchang', 5000, 97, 34),
  'lu-xun': officer('lu-xun', '陆逊', 62, 96, 90, '弓兵', 'sun-quan', 'jiangling', 4700, 95, 28),
  'taishi-ci': officer('taishi-ci', '太史慈', 95, 67, 79, '水兵', 'sun-quan', 'shouchun', 5100, 89, 37),
};

const items: Record<string, Item> = {
  'qinglong-blade': { id: 'qinglong-blade', name: '青龙刀', forceBonus: 8, intelligenceBonus: 0, moveBonus: 0 },
  'sunzi-manual': { id: 'sunzi-manual', name: '孙子兵法', forceBonus: 0, intelligenceBonus: 10, moveBonus: 0 },
  'red-hare': { id: 'red-hare', name: '赤兔', forceBonus: 0, intelligenceBonus: 0, moveBonus: 3 },
};

const armsTypes: Record<string, ArmsType> = {
  cavalry: { id: 'cavalry', name: '骑兵', attackModifier: 1.08, defenseModifier: 0.96, mobility: 4 },
  infantry: { id: 'infantry', name: '步兵', attackModifier: 1, defenseModifier: 1.08, mobility: 3 },
  archer: { id: 'archer', name: '弓兵', attackModifier: 1.04, defenseModifier: 0.92, mobility: 3 },
  navy: { id: 'navy', name: '水兵', attackModifier: 0.98, defenseModifier: 1, mobility: 3 },
  elite: { id: 'elite', name: '极兵', attackModifier: 1.16, defenseModifier: 1.12, mobility: 4 },
  mystic: { id: 'mystic', name: '玄兵', attackModifier: 0.94, defenseModifier: 1.18, mobility: 3 },
};

export function createSampleState(): GameState {
  return {
    calendar: { year: 190, month: 1 },
    playerFactionId: 'cao-cao',
    factions: structuredClone(factions),
    cities: structuredClone(cities),
    officers: structuredClone(officers),
    items: structuredClone(items),
    armsTypes: structuredClone(armsTypes),
    logs: [
      {
        id: 'log-001',
        kind: 'system',
        message: '战略原型启动。',
        turn: 1,
      },
    ],
  };
}

function city(
  id: string,
  name: string,
  x: number,
  y: number,
  type: City['type'],
  region: string,
  ownerId: string,
  neighbors: string[],
  population: number,
  farming: number,
  commerce: number,
  defense: number,
): City {
  return {
    id,
    name,
    x,
    y,
    type,
    region,
    ownerId,
    neighbors,
    population,
    farming,
    commerce,
    defense,
    money: 800,
    food: 1600,
    reserveTroops: 3000,
  };
}

function officer(
  id: string,
  name: string,
  force: number,
  intelligence: number,
  leadership: number,
  armsType: string,
  factionId: string,
  cityId: string,
  troops: number,
  loyalty: number,
  age: number,
  weapon?: string,
): Officer {
  return {
    id,
    name,
    force,
    intelligence,
    leadership,
    armsType,
    weapon,
    factionId,
    cityId,
    troops,
    loyalty,
    age,
    stamina: 100,
  };
}
