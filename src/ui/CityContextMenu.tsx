import type { CSSProperties } from 'react';
import type { GameState } from '../core/types';
import { getDiplomacyTargets } from '../core/diplomaticOrders';
import { getOfficerEquipmentIds } from '../core/equipment';
import { getReconTargets } from '../core/reconnaissance';
import { getCityCaptives, getCityFreeOfficers, getNeighborCities } from '../core/selectors';
import { getStrategicDestinations } from '../core/strategicOrders';
import type { GameEventMap } from '../game/events';
import {
  CITY_COMMAND_GROUPS,
  type CityCommandId,
  type CityCommandSection,
} from './cityCommandCatalog';

export type CityContextAnchor = GameEventMap['city:anchor-changed'];

type CityContextMenuProps = {
  state: GameState;
  cityId: string;
  anchor: CityContextAnchor;
  onClose: () => void;
  onOpenDetail: () => void;
  onOpenCommand: (commandId: CityCommandId) => void;
  activeSection?: CityCommandSection;
  onActiveSectionChange: (section?: CityCommandSection) => void;
};

const number = new Intl.NumberFormat('zh-CN');

export function CityContextMenu({
  state,
  cityId,
  anchor,
  onClose,
  onOpenDetail,
  onOpenCommand,
  activeSection,
  onActiveSectionChange,
}: CityContextMenuProps) {
  const city = state.cities[cityId];
  if (!city || !anchor.visible || anchor.cityId !== cityId) return null;
  const faction = state.factions[city.ownerId];
  const isOwned = city.ownerId === state.playerFactionId;
  const officers = Object.values(state.officers).filter((officer) =>
    officer.status === 'serving' && officer.cityId === city.id && officer.factionId === city.ownerId);
  const discoveredFreeOfficers = getCityFreeOfficers(state, city.id)
    .filter((officer) => state.discoveredOfficerIds.includes(officer.id));
  const captives = getCityCaptives(state, city.id);
  const destinations = getStrategicDestinations(state, city.id, state.playerFactionId);
  const hostileNeighbors = getNeighborCities(state, city.id)
    .filter((neighbor) => neighbor.ownerId !== city.ownerId);
  const reconTargets = getReconTargets(state, city.id);
  const hasKnownDiplomacyTarget = (['alienate', 'canvass', 'counterespionage', 'induce'] as const)
    .some((kind) => getDiplomacyTargets(state, kind, state.playerFactionId).length > 0);
  const intel = isOwned ? undefined : state.intelReports[city.id];
  const totalTroops = isOwned
    ? city.reserveTroops + officers.reduce((sum, officer) => sum + officer.troops, 0)
    : intel ? intel.reserveTroops + intel.totalTroops : undefined;
  const menuHalfWidth = Math.min(190, Math.max(120, anchor.viewportWidth / 2 - 10));
  const left = Math.min(
    Math.max(anchor.x, menuHalfWidth),
    Math.max(menuHalfWidth, anchor.viewportWidth - menuHalfWidth),
  );
  const opensBelow = anchor.y < anchor.viewportHeight * 0.58;
  const top = opensBelow ? anchor.y + 38 : anchor.y - 36;
  const style = {
    '--city-context-left': `${left}px`,
    '--city-context-top': `${top}px`,
    '--faction-color': faction?.color ?? '#77786f',
  } as CSSProperties;

  function structuralUnavailableReason(commandId: CityCommandId): string | undefined {
    if (!isOwned) return '仅己方城池可执行';
    if (commandId === 'captive') return captives.length === 0 ? '本城没有俘虏' : undefined;
    if (officers.length === 0) return '本城没有可用武将';
    switch (commandId) {
      case 'recruit-officer':
        return discoveredFreeOfficers.length === 0 ? '尚未发现可登用人才' : undefined;
      case 'move':
      case 'transport':
        return destinations.length === 0 ? '没有道路连通的己方城市' : undefined;
      case 'appoint':
        return state.rulesetId === 'baye-classic-v1' ? '经典规则自动任命太守' : undefined;
      case 'item':
        return (city.itemIds?.length ?? 0) === 0
          && officers.every((officer) => getOfficerEquipmentIds(officer).length === 0)
          ? '本城没有可处置道具'
          : undefined;
      case 'attack':
        return hostileNeighbors.length === 0 ? '没有相邻敌对城市' : undefined;
      case 'recon':
        return reconTargets.length === 0 ? '没有可侦察城市' : undefined;
      case 'diplomacy':
        return hasKnownDiplomacyTarget ? undefined : '本月情报没有合法目标';
      default:
        return undefined;
    }
  }

  return (
    <section
      className={`city-context-menu ${opensBelow ? 'opens-below' : 'opens-above'} ${activeSection ? 'has-submenu' : ''}`}
      style={style}
      role="dialog"
      aria-label={`${city.name}快捷命令`}
    >
      <header>
        {activeSection ? (
          <button
            type="button"
            className="city-context-back"
            aria-label="返回城池快捷菜单"
            onClick={() => onActiveSectionChange(undefined)}
          >
            ‹
          </button>
        ) : <span className="city-context-faction" aria-hidden="true" />}
        <div>
          <strong>{activeSection ? sectionLabel(activeSection) : city.name}</strong>
          <small>
            {activeSection
              ? `${city.name} · 选择一项命令`
              : `${faction?.name ?? '未知势力'} · ${isOwned ? `${officers.length} 将` : intel ? `${intel.officerCount} 将（旧情报）` : '情报未知'}`}
          </small>
        </div>
        <div className="city-context-metrics" hidden={Boolean(activeSection)}>
          <span>粮 {isOwned ? number.format(city.food) : intel ? number.format(intel.food) : '—'}</span>
          <span>兵 {totalTroops === undefined ? '—' : number.format(totalTroops)}</span>
        </div>
        <button type="button" className="city-context-close" aria-label="关闭城池快捷命令" onClick={onClose}>×</button>
      </header>

      {activeSection ? (
        <div className="city-context-submenu" aria-label={`${sectionLabel(activeSection)}命令`}>
          {CITY_COMMAND_GROUPS[activeSection].map((command) => {
            const unavailableReason = structuralUnavailableReason(command.id);
            return (
              <button
                type="button"
                key={command.id}
                disabled={Boolean(unavailableReason)}
                title={unavailableReason}
                onClick={() => onOpenCommand(command.id)}
              >
                <span aria-hidden="true">{command.glyph}</span>
                {command.label}
                {unavailableReason && <small>{unavailableReason}</small>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="city-context-actions">
          <button type="button" onClick={onOpenDetail}><span aria-hidden="true">详</span>{isOwned ? '详情' : '情报'}</button>
          {isOwned ? (
          <>
            <button type="button" onClick={() => onActiveSectionChange('internal')}><span aria-hidden="true">政</span>内政</button>
            <button type="button" onClick={() => onActiveSectionChange('personnel')}><span aria-hidden="true">人</span>人事</button>
            <button type="button" onClick={() => onActiveSectionChange('military')}><span aria-hidden="true">军</span>军事</button>
            <button type="button" onClick={() => onActiveSectionChange('intrigue')}><span aria-hidden="true">谋</span>谋略</button>
          </>
          ) : (
            <p>侦察与出征需从相邻的己方城池发起</p>
          )}
        </div>
      )}
    </section>
  );
}

function sectionLabel(section: CityCommandSection): string {
  return {
    internal: '内政',
    personnel: '人事',
    military: '军事',
    intrigue: '谋略',
  }[section];
}
