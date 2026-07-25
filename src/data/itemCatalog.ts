import type { Item } from '../core/types';

// Provisional playable content inherited from data/source/tool-catalog.csv.
// It is not an original-parity oracle until that table is re-linked to a
// fixed, redistributable upstream source as required by provenance/data.md.
const itemDefinitions: Item[] = [
  item(0, '方天画戟', 10),
  item(1, '七星刀', 10),
  item(2, '青龙刀', 8),
  item(3, '丈八矛', 8),
  item(4, '双股剑', 4),
  item(5, '三尖刀', 3),
  item(6, '双铁戟', 2),
  item(7, '倚天剑', 10),
  item(8, '青虹剑', 8),
  item(9, '望月枪', 3),
  item(10, '古淀刀', 5),
  item(11, '六韬', 0, 8),
  item(12, '司马法', 0, 2),
  item(13, '孙子兵法', 0, 10),
  item(14, '范蠡兵法', 0, 4),
  item(15, '墨子', 0, 3),
  item(16, '吴子兵法', 0, 2),
  item(17, '鬼谷子', 0, 5),
  item(18, '孙膑兵法', 0, 3),
  item(19, '尉缭子', 0, 1),
  item(20, '商君书', 0, 2),
  item(21, '三略', 0, 6),
  item(22, '赤兔', 0, 0, 3),
  item(23, '的卢', 0, 0, 2),
  item(24, '绝影', 0, 0, 2),
  item(25, '爪黄飞电', 0, 0, 1),
  item(26, '王追', 0, 0, 1),
  item(27, '惊帆', 0, 0, 1),
  item(28, '白鸽', 0, 0, 1),
  item(29, '快航', 0, 0, 1),
  item(30, '铁骑兵符', 0, 0, 0, 'elite'),
  item(31, '太玄兵符', 0, 0, 0, 'mystic'),
  item(32, '水战兵符', 0, 0, 0, 'navy'),
];

export function createItemCatalog(): Record<string, Item> {
  return Object.fromEntries(itemDefinitions.map((definition) => [definition.id, { ...definition }]));
}

export function itemId(sourceId: number): string {
  return `item-${sourceId}`;
}

function item(
  sourceId: number,
  name: string,
  forceBonus = 0,
  intelligenceBonus = 0,
  moveBonus = 0,
  armsTypeOverride?: string,
): Item {
  return {
    id: itemId(sourceId),
    sourceId,
    name,
    forceBonus,
    intelligenceBonus,
    moveBonus,
    armsTypeOverride,
  };
}
