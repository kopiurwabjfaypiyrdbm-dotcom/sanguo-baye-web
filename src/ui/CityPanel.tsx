import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  DEVELOP_MONEY_COST,
  DEVELOP_STAMINA_COST,
  RECRUIT_STAMINA_COST,
  calculateOfficerTroopCapacity,
  calculateRecruitCapacity,
} from '../core/cityCommands';
import type { GameState } from '../core/types';
import {
  RECRUIT_OFFICER_STAMINA_COST,
  REWARD_MONEY_COST,
  SEARCH_STAMINA_COST,
  getGiveItemAvailability,
} from '../core/personnelCommands';
import { getCityFreeOfficers, getCityOfficers, getNeighborCities } from '../core/selectors';
import { getEffectiveOfficerAttributes, getOfficerEquipmentIds } from '../core/equipment';

type CityPanelProps = {
  state: GameState;
  cityId: string;
  disabled?: boolean;
  onDevelop: (cityId: string, officerId: string) => void;
  onRecruit: (cityId: string, officerId: string) => void;
  onSearch: (cityId: string, officerId: string) => void;
  onRecruitOfficer: (cityId: string, executorOfficerId: string, targetOfficerId: string) => void;
  onReward: (cityId: string, officerId: string) => void;
  onGiveItem: (cityId: string, officerId: string, itemId: string) => void;
  onUnequipItem: (cityId: string, officerId: string, itemId: string) => void;
  onMove: (sourceCityId: string, targetCityId: string, officerId: string) => void;
  onAppoint: (cityId: string, officerId: string) => void;
  onDistribute: (cityId: string, officerId: string, targetTroops: number) => void;
  onAttack: (sourceCityId: string, targetCityId: string, officerIds: string[], provisions: number) => void;
};

const number = new Intl.NumberFormat('zh-CN');

export function CityPanel({
  state,
  cityId,
  disabled = false,
  onDevelop,
  onRecruit,
  onSearch,
  onRecruitOfficer,
  onReward,
  onGiveItem,
  onUnequipItem,
  onMove,
  onAppoint,
  onDistribute,
  onAttack,
}: CityPanelProps) {
  const city = state.cities[cityId] ?? Object.values(state.cities)[0];
  const officers = useMemo(() => getCityOfficers(state, cityId), [state, cityId]);
  const eligibleOfficers = useMemo(
    () => officers.filter((officer) => officer.factionId === state.playerFactionId),
    [officers, state.playerFactionId],
  );
  const discoveredFreeOfficers = useMemo(
    () => getCityFreeOfficers(state, cityId).filter((officer) => state.discoveredOfficerIds.includes(officer.id)),
    [state, cityId],
  );
  const hostileNeighbors = useMemo(
    () => getNeighborCities(state, cityId).filter((neighbor) => city && neighbor.ownerId !== city.ownerId),
    [state, cityId, city],
  );
  const friendlyNeighbors = useMemo(
    () => getNeighborCities(state, cityId).filter((neighbor) => city && neighbor.ownerId === city.ownerId),
    [state, cityId, city],
  );
  const [selectedOfficerId, setSelectedOfficerId] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [selectedMoveTargetId, setSelectedMoveTargetId] = useState('');
  const [selectedRecruitTargetId, setSelectedRecruitTargetId] = useState('');
  const [distributionTarget, setDistributionTarget] = useState('0');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedAttackerIds, setSelectedAttackerIds] = useState<string[]>([]);
  const [provisions, setProvisions] = useState('100');

  useEffect(() => {
    if (!eligibleOfficers.some((officer) => officer.id === selectedOfficerId)) {
      setSelectedOfficerId(eligibleOfficers[0]?.id ?? '');
    }
  }, [eligibleOfficers, selectedOfficerId]);

  useEffect(() => {
    const officer = state.officers[selectedOfficerId];
    setDistributionTarget(officer ? String(officer.troops) : '0');
  }, [state.officers, selectedOfficerId]);

  useEffect(() => {
    if (!hostileNeighbors.some((neighbor) => neighbor.id === selectedTargetId)) {
      setSelectedTargetId(hostileNeighbors[0]?.id ?? '');
    }
  }, [hostileNeighbors, selectedTargetId]);

  useEffect(() => {
    if (!friendlyNeighbors.some((neighbor) => neighbor.id === selectedMoveTargetId)) {
      setSelectedMoveTargetId(friendlyNeighbors[0]?.id ?? '');
    }
  }, [friendlyNeighbors, selectedMoveTargetId]);

  useEffect(() => {
    if (!discoveredFreeOfficers.some((officer) => officer.id === selectedRecruitTargetId)) {
      setSelectedRecruitTargetId(discoveredFreeOfficers[0]?.id ?? '');
    }
  }, [discoveredFreeOfficers, selectedRecruitTargetId]);

  const cityItems = useMemo(
    () => (city.itemIds ?? []).map((itemId) => state.items[itemId]).filter(Boolean),
    [city.itemIds, state.items],
  );

  useEffect(() => {
    if (!cityItems.some((item) => item.id === selectedItemId)) setSelectedItemId(cityItems[0]?.id ?? '');
  }, [cityItems, selectedItemId]);

  const faction = state.factions[city.ownerId];
  const satrap = city.satrapOfficerId ? state.officers[city.satrapOfficerId] : undefined;
  const selectedOfficer = state.officers[selectedOfficerId];
  const selectedItem = state.items[selectedItemId];
  const selectedEquipmentIds = selectedOfficer ? getOfficerEquipmentIds(selectedOfficer) : [];
  const isOwned = city.ownerId === state.playerFactionId && state.phase === 'player';
  const selectedOfficerActed = selectedOfficer ? state.actedOfficerIds.includes(selectedOfficer.id) : false;
  const availableAttackers = eligibleOfficers.filter(
    (officer) => officer.troops > 0 && officer.stamina > 0 && !state.actedOfficerIds.includes(officer.id),
  );
  const distributionValue = Number(distributionTarget);
  const distributionCapacity = selectedOfficer ? calculateOfficerTroopCapacity(selectedOfficer) : 0;
  const distributionDelta = selectedOfficer ? distributionValue - selectedOfficer.troops : 0;
  const provisionValue = Number(provisions);
  const canDevelop = isOwned && Boolean(selectedOfficer) && selectedOfficer.stamina >= DEVELOP_STAMINA_COST
    && !selectedOfficerActed && city.money >= DEVELOP_MONEY_COST
    && (city.farmingLimit === undefined || city.farming < city.farmingLimit);
  const canRecruit = isOwned && Boolean(selectedOfficer) && selectedOfficer.stamina >= RECRUIT_STAMINA_COST
    && !selectedOfficerActed && calculateRecruitCapacity(city) > 0;
  const canSearch = isOwned && Boolean(selectedOfficer) && selectedOfficer.stamina >= SEARCH_STAMINA_COST
    && !selectedOfficerActed;
  const canRecruitOfficer = isOwned && Boolean(selectedOfficer) && !selectedOfficerActed
    && selectedOfficer.stamina >= RECRUIT_OFFICER_STAMINA_COST && Boolean(selectedRecruitTargetId);
  const canReward = isOwned && Boolean(selectedOfficer)
    && selectedOfficer.id !== state.factions[state.playerFactionId].rulerOfficerId
    && selectedOfficer.loyalty < 100 && city.money >= REWARD_MONEY_COST;
  const itemAvailability = selectedOfficer && selectedItem
    ? getGiveItemAvailability(state, { cityId: city.id, officerId: selectedOfficer.id, itemId: selectedItem.id })
    : { allowed: false as const, reason: cityItems.length === 0 ? '城中没有已发现道具' : '请选择受赏武将和道具' };
  const canGiveItem = isOwned && itemAvailability.allowed;
  const canMove = isOwned && Boolean(selectedOfficer) && !selectedOfficerActed && Boolean(selectedMoveTargetId);
  const canAppoint = isOwned && Boolean(selectedOfficer) && city.satrapOfficerId !== selectedOfficerId;
  const canDistribute = isOwned && Boolean(selectedOfficer) && Number.isInteger(distributionValue)
    && distributionValue >= 0 && distributionValue <= distributionCapacity
    && distributionDelta <= city.reserveTroops && distributionDelta !== 0;
  const canAttack = isOwned && selectedAttackerIds.length > 0 && Boolean(selectedTargetId)
    && Number.isInteger(provisionValue) && provisionValue > 0 && provisionValue <= city.food;

  useEffect(() => {
    const availableIds = new Set(availableAttackers.map((officer) => officer.id));
    setSelectedAttackerIds((current) => {
      const retained = current.filter((officerId) => availableIds.has(officerId)).slice(0, 10);
      if (retained.length > 0) return retained;
      return availableAttackers[0] ? [availableAttackers[0].id] : [];
    });
  }, [state.actedOfficerIds, state.officers, cityId]);

  useEffect(() => {
    setProvisions(String(Math.max(1, Math.min(city.food, 500))));
  }, [city.id]);

  function toggleAttacker(officerId: string) {
    setSelectedAttackerIds((current) => current.includes(officerId)
      ? current.filter((candidate) => candidate !== officerId)
      : current.length < 10 ? [...current, officerId] : current);
  }

  return (
    <aside className="side-panel" aria-label="城池面板">
      <div className="city-heading">
        <div>
          <p className="panel-kicker">City {city.sourceIndex !== undefined ? city.sourceIndex + 1 : ''}</p>
          <h2>{city.name}</h2>
        </div>
        <span className="faction-chip" style={{ '--faction-color': faction?.color } as CSSProperties}>
          {faction?.name ?? '未知势力'}
        </span>
      </div>

      <dl className="city-stats">
        <Stat label="人口" value={number.format(city.population)} />
        <Stat label="金钱" value={number.format(city.money)} />
        <Stat label="粮草" value={number.format(city.food)} />
        <Stat label="后备兵" value={number.format(city.reserveTroops)} />
        <Stat label="农业" value={`${city.farming}${city.farmingLimit ? ` / ${city.farmingLimit}` : ''}`} />
        <Stat label="商业" value={`${city.commerce}${city.commerceLimit ? ` / ${city.commerceLimit}` : ''}`} />
        <Stat label="民忠" value={String(city.publicLoyalty ?? '—')} />
        <Stat label="太守" value={satrap?.name ?? '空缺'} />
      </dl>

      <div className="officer-section">
        <div className="section-title">
          <h3>驻城人物</h3>
          <span>{officers.length} 人</span>
        </div>
        <div className="officer-list">
          {officers.slice(0, 8).map((officer) => {
            const attributes = getEffectiveOfficerAttributes(state, officer);
            const equipmentNames = getOfficerEquipmentIds(officer)
              .map((itemId) => state.items[itemId]?.name)
              .filter(Boolean)
              .join('、');
            return (
              <div className="officer-row" key={officer.id}>
                <strong>{officer.name}</strong>
                <span>武 {attributes.force} · 智 {attributes.intelligence}</span>
                <span>兵 {number.format(officer.troops)}</span>
                <span>忠 {officer.loyalty}</span>
                <span>装备 {equipmentNames || '无'}</span>
                <span>{city.satrapOfficerId === officer.id ? '太守' : '在职'} · {state.actedOfficerIds.includes(officer.id) ? '已行动' : '待命'}</span>
              </div>
            );
          })}
          {officers.length > 8 && <p className="more-officers">另有 {officers.length - 8} 人</p>}
        </div>
      </div>

      <div className="command-panel" aria-label="城池命令">
        <div className="section-title">
          <h3>城池命令</h3>
          <span>{isOwned ? '玩家阶段' : '仅可查看'}</span>
        </div>

        {isOwned && eligibleOfficers.length > 0 ? (
          <>
            <label className="command-field">
              <span>执行武将</span>
              <select value={selectedOfficerId} onChange={(event) => setSelectedOfficerId(event.target.value)}>
                {eligibleOfficers.map((officer) => (
                  <option value={officer.id} key={officer.id}>
                    {officer.name} · 体力 {officer.stamina} · 兵 {number.format(officer.troops)}
                    {state.actedOfficerIds.includes(officer.id) ? ' · 已行动' : ''}
                  </option>
                ))}
              </select>
            </label>

            <p className="command-group-title">内政</p>
            <div className="city-command-buttons">
              <button
                type="button"
                disabled={disabled || !canDevelop}
                onClick={() => onDevelop(city.id, selectedOfficerId)}
                title={`消耗金钱 ${DEVELOP_MONEY_COST}、体力 ${DEVELOP_STAMINA_COST}`}
              >
                开垦
              </button>
              <button
                type="button"
                disabled={disabled || !canRecruit}
                onClick={() => onRecruit(city.id, selectedOfficerId)}
                title={`征入后备兵，消耗体力 ${RECRUIT_STAMINA_COST}`}
              >
                征兵
              </button>
              <button
                type="button"
                disabled={disabled || !canSearch}
                onClick={() => onSearch(city.id, selectedOfficerId)}
                title={`搜寻人才或资源，消耗体力 ${SEARCH_STAMINA_COST}`}
              >
                搜寻
              </button>
            </div>

            <p className="command-group-title">人事</p>
            {discoveredFreeOfficers.length > 0 && (
              <div className="recruit-command-row">
                <label className="command-field">
                  <span>已发现人才</span>
                  <select value={selectedRecruitTargetId} onChange={(event) => setSelectedRecruitTargetId(event.target.value)}>
                    {discoveredFreeOfficers.map((officer) => (
                      <option value={officer.id} key={officer.id}>{officer.name} · 武 {officer.force} · 智 {officer.intelligence}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={disabled || !canRecruitOfficer}
                  onClick={() => onRecruitOfficer(city.id, selectedOfficerId, selectedRecruitTargetId)}
                  title={`消耗执行武将体力 ${RECRUIT_OFFICER_STAMINA_COST}`}
                >
                  登用
                </button>
              </div>
            )}
            <div className="personnel-command-row">
              <label className="command-field">
                <span>调动到相邻己方城池</span>
                <select
                  value={selectedMoveTargetId}
                  onChange={(event) => setSelectedMoveTargetId(event.target.value)}
                  disabled={friendlyNeighbors.length === 0}
                >
                  {friendlyNeighbors.length === 0 && <option value="">没有可调动城池</option>}
                  {friendlyNeighbors.map((neighbor) => (
                    <option value={neighbor.id} key={neighbor.id}>{neighbor.name}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={disabled || !canMove}
                onClick={() => onMove(city.id, selectedMoveTargetId, selectedOfficerId)}
              >
                调动
              </button>
              <button
                type="button"
                disabled={disabled || !canAppoint}
                onClick={() => onAppoint(city.id, selectedOfficerId)}
              >
                任太守
              </button>
            </div>
            <button
              type="button"
              className="reward-command"
              disabled={disabled || !canReward}
              onClick={() => onReward(city.id, selectedOfficerId)}
              title={selectedOfficer?.loyalty >= 100
                ? '该武将忠诚已经达到上限'
                : `消耗城中金钱 ${REWARD_MONEY_COST}，不占用武将本月行动`}
            >
              奖赏所选武将（{REWARD_MONEY_COST} 金）
            </button>
            <div className="item-command-row">
              <label className="command-field">
                <span>城中道具（另有 {city.hiddenItemIds?.length ?? 0} 件未发现）</span>
                <select
                  value={selectedItemId}
                  onChange={(event) => setSelectedItemId(event.target.value)}
                  disabled={cityItems.length === 0}
                >
                  {cityItems.length === 0 && <option value="">暂无已发现道具</option>}
                  {cityItems.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name} · {describeItem(item)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={disabled || !canGiveItem}
                onClick={() => onGiveItem(city.id, selectedOfficerId, selectedItemId)}
                title={disabled
                  ? '当前有待处理操作，暂时不能执行城池命令'
                  : itemAvailability.allowed
                    ? '原版道具赏赐：非君主忠诚 +8，不占用月行动'
                    : itemAvailability.reason}
              >
                赏赐道具
              </button>
            </div>
            {isOwned && !itemAvailability.allowed && (
              <p className="command-hint">暂不可赏赐：{itemAvailability.reason}</p>
            )}
            {selectedEquipmentIds.length > 0 && (
              <div className="equipment-actions" aria-label="所选武将装备">
                {selectedEquipmentIds.map((itemId) => (
                  <button
                    type="button"
                    key={itemId}
                    disabled={disabled || !isOwned}
                    onClick={() => onUnequipItem(city.id, selectedOfficerId, itemId)}
                  >
                    卸下 {state.items[itemId].name}
                  </button>
                ))}
              </div>
            )}

            <p className="command-group-title">军事</p>
            <div className="distribution-row">
              <label className="command-field">
                <span>分配后武将兵力（上限 {number.format(distributionCapacity)}）</span>
                <input
                  type="number"
                  min="0"
                  max={distributionCapacity}
                  step="100"
                  value={distributionTarget}
                  onChange={(event) => setDistributionTarget(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={disabled || !canDistribute}
                onClick={() => onDistribute(city.id, selectedOfficerId, distributionValue)}
              >
                分配
              </button>
            </div>

            <label className="command-field">
              <span>出征目标</span>
              <select
                value={selectedTargetId}
                onChange={(event) => setSelectedTargetId(event.target.value)}
                disabled={hostileNeighbors.length === 0}
              >
                {hostileNeighbors.length === 0 && <option value="">没有相邻敌对城池</option>}
                {hostileNeighbors.map((neighbor) => (
                  <option value={neighbor.id} key={neighbor.id}>
                    {neighbor.name} · {state.factions[neighbor.ownerId]?.name ?? '未知势力'}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="attacker-picker">
              <legend>出征武将（最多 10 人）</legend>
              {availableAttackers.map((officer) => (
                <label key={officer.id}>
                  <input
                    type="checkbox"
                    checked={selectedAttackerIds.includes(officer.id)}
                    onChange={() => toggleAttacker(officer.id)}
                  />
                  <span>{officer.name} · 兵 {number.format(officer.troops)}</span>
                </label>
              ))}
              {availableAttackers.length === 0 && <p>本月没有可出征武将。</p>}
            </fieldset>
            <label className="command-field">
              <span>携带粮草（城中 {number.format(city.food)}）</span>
              <input
                type="number"
                min="1"
                max={city.food}
                value={provisions}
                onChange={(event) => setProvisions(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="attack-command"
              disabled={disabled || !canAttack}
              onClick={() => onAttack(city.id, selectedTargetId, selectedAttackerIds, provisionValue)}
            >
              筹划出征
            </button>
          </>
        ) : (
          <p className="command-hint">
            {isOwned ? '城中没有可下令的己方武将。' : '选择一座己方城池即可执行经营、征兵与出征。'}
          </p>
        )}
      </div>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function describeItem(item: GameState['items'][string]): string {
  if (item.armsTypeOverride) return `转为${item.armsTypeOverride === 'elite' ? '极兵' : item.armsTypeOverride === 'mystic' ? '玄兵' : '水兵'}`;
  const bonuses = [
    item.forceBonus > 0 ? `武力 +${item.forceBonus}` : '',
    item.intelligenceBonus > 0 ? `智力 +${item.intelligenceBonus}` : '',
    item.moveBonus > 0 ? `移动 +${item.moveBonus}` : '',
  ].filter(Boolean);
  return bonuses.join(' · ') || '无属性';
}
