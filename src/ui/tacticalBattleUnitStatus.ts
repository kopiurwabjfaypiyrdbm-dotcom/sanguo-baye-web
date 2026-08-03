import type { TacticalUnit } from '../core/tacticalBattle';

type TacticalUnitStatusInput = Pick<TacticalUnit, 'name' | 'troops' | 'moved' | 'acted'>;

const number = new Intl.NumberFormat('zh-CN');

export function formatTacticalUnitStatus(
  unit: TacticalUnitStatusInput | undefined,
  armsLabel: string,
  statusLabel: string,
): string {
  if (!unit) return '点击战场或我军名单选择单位';
  const actionLabel = unit.acted ? '已行动' : unit.moved ? '已移动' : '待命';
  return `${armsLabel} · 兵 ${number.format(unit.troops)} · ${statusLabel} · ${actionLabel}`;
}
