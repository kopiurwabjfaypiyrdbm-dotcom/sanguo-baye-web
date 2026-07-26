import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  DEVELOP_MONEY_COST,
  DEVELOP_STAMINA_COST,
  GOVERN_MONEY_COST,
  GOVERN_STAMINA_COST,
  INSPECT_MONEY_COST,
  INSPECT_STAMINA_COST,
  RECRUIT_STAMINA_COST,
  calculateCommerceGain,
  calculateOfficerTroopCapacity,
  calculateRecruitCapacity,
  getDevelopCommerceAvailability,
  getDevelopFarmingAvailability,
  getGovernAvailability,
  getInspectAvailability,
} from '../core/cityCommands';
import type { GameState } from '../core/types';
import {
  RECRUIT_OFFICER_STAMINA_COST,
  REWARD_MONEY_COST,
  SEARCH_STAMINA_COST,
  getGiveItemAvailability,
} from '../core/personnelCommands';
import { getCityCaptives, getCityFreeOfficers, getCityOfficers, getNeighborCities } from '../core/selectors';
import { getEffectiveOfficerAttributes, getOfficerEquipmentIds } from '../core/equipment';
import { SURRENDER_STAMINA_COST } from '../core/captiveCommands';
import {
  RECON_MONEY_COST,
  RECON_STAMINA_COST,
  getReconAvailability,
  getReconTargets,
} from '../core/reconnaissance';
import {
  MOVE_STAMINA_COST,
  TRANSPORT_STAMINA_COST,
  getMoveAvailability,
  getStrategicDestinations,
  getTransportAvailability,
} from '../core/strategicOrders';

type CityPanelProps = {
  state: GameState;
  cityId: string;
  disabled?: boolean;
  onDevelop: (cityId: string, officerId: string) => void;
  onDevelopCommerce: (cityId: string, officerId: string) => void;
  onGovern: (cityId: string, officerId: string) => void;
  onInspect: (cityId: string, officerId: string) => void;
  onRecruit: (cityId: string, officerId: string) => void;
  onSearch: (cityId: string, officerId: string) => void;
  onRecruitOfficer: (cityId: string, executorOfficerId: string, targetOfficerId: string) => void;
  onReward: (cityId: string, officerId: string) => void;
  onGiveItem: (cityId: string, officerId: string, itemId: string) => void;
  onUnequipItem: (cityId: string, officerId: string, itemId: string) => void;
  onRecruitCaptive: (cityId: string, executorOfficerId: string, captiveOfficerId: string) => void;
  onReleaseCaptive: (cityId: string, captiveOfficerId: string) => void;
  onMove: (sourceCityId: string, targetCityId: string, officerId: string) => void;
  onTransport: (
    sourceCityId: string,
    targetCityId: string,
    officerId: string,
    cargo: { money: number; food: number; reserveTroops: number },
  ) => boolean;
  onAppoint: (cityId: string, officerId: string) => void;
  onDistribute: (cityId: string, officerId: string, targetTroops: number) => void;
  onRecon: (sourceCityId: string, targetCityId: string, officerId: string) => void;
  onAttack: (sourceCityId: string, targetCityId: string, officerIds: string[], provisions: number) => void;
};

const number = new Intl.NumberFormat('zh-CN');

export function CityPanel({
  state,
  cityId,
  disabled = false,
  onDevelop,
  onDevelopCommerce,
  onGovern,
  onInspect,
  onRecruit,
  onSearch,
  onRecruitOfficer,
  onReward,
  onGiveItem,
  onUnequipItem,
  onRecruitCaptive,
  onReleaseCaptive,
  onMove,
  onTransport,
  onAppoint,
  onDistribute,
  onRecon,
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
  const captives = useMemo(() => getCityCaptives(state, cityId), [state, cityId]);
  const hostileNeighbors = useMemo(
    () => getNeighborCities(state, cityId).filter((neighbor) => city && neighbor.ownerId !== city.ownerId),
    [state, cityId, city],
  );
  const strategicDestinations = useMemo(
    () => getStrategicDestinations(state, cityId, state.playerFactionId),
    [state, cityId],
  );
  const reconTargets = useMemo(() => getReconTargets(state, city.id), [state, city.id]);
  const [selectedOfficerId, setSelectedOfficerId] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [selectedMoveTargetId, setSelectedMoveTargetId] = useState('');
  const [transportMoney, setTransportMoney] = useState('0');
  const [transportFood, setTransportFood] = useState('0');
  const [transportReserveTroops, setTransportReserveTroops] = useState('0');
  const [selectedRecruitTargetId, setSelectedRecruitTargetId] = useState('');
  const [selectedReconTargetId, setSelectedReconTargetId] = useState('');
  const [distributionTarget, setDistributionTarget] = useState('0');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedCaptiveId, setSelectedCaptiveId] = useState('');
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
    if (!strategicDestinations.some((destination) => destination.city.id === selectedMoveTargetId)) {
      setSelectedMoveTargetId(strategicDestinations[0]?.city.id ?? '');
    }
  }, [strategicDestinations, selectedMoveTargetId]);

  useEffect(() => {
    setTransportMoney('0');
    setTransportFood('0');
    setTransportReserveTroops('0');
  }, [city.id, selectedMoveTargetId]);

  useEffect(() => {
    if (!reconTargets.some((target) => target.id === selectedReconTargetId)) {
      setSelectedReconTargetId(reconTargets[0]?.id ?? '');
    }
  }, [reconTargets, selectedReconTargetId]);

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

  useEffect(() => {
    if (!captives.some((officer) => officer.id === selectedCaptiveId)) setSelectedCaptiveId(captives[0]?.id ?? '');
  }, [captives, selectedCaptiveId]);

  const faction = state.factions[city.ownerId];
  const satrap = city.satrapOfficerId ? state.officers[city.satrapOfficerId] : undefined;
  const selectedOfficer = eligibleOfficers.find((officer) => officer.id === selectedOfficerId);
  const selectedEffectiveAttributes = selectedOfficer
    ? getEffectiveOfficerAttributes(state, selectedOfficer)
    : undefined;
  const commerceGainRange = selectedEffectiveAttributes
    ? [
      calculateCommerceGain(selectedEffectiveAttributes, 0),
      calculateCommerceGain(selectedEffectiveAttributes, 0.999_999),
    ]
    : [0, 0];
  const selectedCaptive = captives.find((captive) => captive.id === selectedCaptiveId);
  const selectedItem = state.items[selectedItemId];
  const selectedEquipmentIds = selectedOfficer ? getOfficerEquipmentIds(selectedOfficer) : [];
  const isPlayerCity = city.ownerId === state.playerFactionId;
  const intelReport = isPlayerCity ? undefined : state.intelReports[city.id];
  const isOwned = city.ownerId === state.playerFactionId && state.phase === 'player';
  const selectedOfficerActed = selectedOfficer ? state.actedOfficerIds.includes(selectedOfficer.id) : false;
  const availableAttackers = eligibleOfficers.filter(
    (officer) => officer.troops > 0 && officer.stamina > 0 && !state.actedOfficerIds.includes(officer.id),
  );
  const distributionValue = Number(distributionTarget);
  const distributionCapacity = selectedOfficer ? calculateOfficerTroopCapacity(selectedOfficer) : 0;
  const distributionDelta = selectedOfficer ? distributionValue - selectedOfficer.troops : 0;
  const provisionValue = Number(provisions);
  const farmingAvailability = selectedOfficer
    ? getDevelopFarmingAvailability(state, { cityId: city.id, officerId: selectedOfficer.id })
    : { allowed: false as const, reason: '请选择执行武将' };
  const canDevelop = farmingAvailability.allowed;
  const commerceAvailability = selectedOfficer
    ? getDevelopCommerceAvailability(state, { cityId: city.id, officerId: selectedOfficer.id })
    : { allowed: false as const, reason: '请选择执行武将' };
  const governAvailability = selectedOfficer
    ? getGovernAvailability(state, { cityId: city.id, officerId: selectedOfficer.id })
    : { allowed: false as const, reason: '请选择执行武将' };
  const inspectAvailability = selectedOfficer
    ? getInspectAvailability(state, { cityId: city.id, officerId: selectedOfficer.id })
    : { allowed: false as const, reason: '请选择执行武将' };
  const displayedCommerceAvailability = disabled
    ? { allowed: false as const, reason: '当前有待处理操作，暂时不能执行城池命令' }
    : commerceAvailability;
  const displayedGovernAvailability = disabled
    ? { allowed: false as const, reason: '当前有待处理操作，暂时不能执行城池命令' }
    : governAvailability;
  const displayedInspectAvailability = disabled
    ? { allowed: false as const, reason: '当前有待处理操作，暂时不能执行城池命令' }
    : inspectAvailability;
  const canRecruit = isOwned && selectedOfficer !== undefined && selectedOfficer.stamina >= RECRUIT_STAMINA_COST
    && !selectedOfficerActed && calculateRecruitCapacity(city) > 0;
  const canSearch = isOwned && selectedOfficer !== undefined && selectedOfficer.stamina >= SEARCH_STAMINA_COST
    && !selectedOfficerActed;
  const canRecruitOfficer = isOwned && selectedOfficer !== undefined && !selectedOfficerActed
    && selectedOfficer.stamina >= RECRUIT_OFFICER_STAMINA_COST && Boolean(selectedRecruitTargetId);
  const canReward = isOwned && selectedOfficer !== undefined
    && selectedOfficer.id !== state.factions[state.playerFactionId].rulerOfficerId
    && selectedOfficer.loyalty < 100 && city.money >= REWARD_MONEY_COST;
  const itemAvailability = selectedOfficer && selectedItem
    ? getGiveItemAvailability(state, { cityId: city.id, officerId: selectedOfficer.id, itemId: selectedItem.id })
    : { allowed: false as const, reason: cityItems.length === 0 ? '城中没有已发现道具' : '请选择受赏武将和道具' };
  const canGiveItem = isOwned && itemAvailability.allowed;
  const canRecruitCaptive = isOwned && selectedOfficer !== undefined && selectedCaptive !== undefined
    && !selectedOfficerActed && selectedOfficer.stamina >= SURRENDER_STAMINA_COST;
  const captiveRecruitReason = disabled
    ? '当前有待处理操作，暂时不能执行城池命令'
    : !selectedCaptive
      ? '请选择仍在本城的俘虏'
      : !selectedOfficer
        ? '本城没有可执行招降的己方武将'
        : selectedOfficerActed
          ? `${selectedOfficer.name}本月已经行动`
          : selectedOfficer.stamina < SURRENDER_STAMINA_COST
            ? `${selectedOfficer.name}体力不足，需要 ${SURRENDER_STAMINA_COST} 点`
            : `消耗 ${selectedOfficer.name} ${SURRENDER_STAMINA_COST} 点体力和本月行动；失败会削弱俘虏忠诚`;
  const moveAvailability = selectedOfficer && selectedMoveTargetId
    ? getMoveAvailability(state, {
      sourceCityId: city.id,
      targetCityId: selectedMoveTargetId,
      officerId: selectedOfficer.id,
    })
    : {
      allowed: false as const,
      reason: strategicDestinations.length === 0 ? '没有道路连通的己方目标城池' : '请选择执行武将',
    };
  const displayedMoveAvailability = disabled
    ? { allowed: false as const, reason: '当前有待处理操作，暂时不能执行城池命令' }
    : moveAvailability;
  const canMove = isOwned && displayedMoveAvailability.allowed;
  const transportCargo = {
    money: Number(transportMoney),
    food: Number(transportFood),
    reserveTroops: Number(transportReserveTroops),
  };
  const transportAvailability = selectedOfficer && selectedMoveTargetId
    ? getTransportAvailability(state, {
      sourceCityId: city.id,
      targetCityId: selectedMoveTargetId,
      officerId: selectedOfficer.id,
      cargo: transportCargo,
    })
    : {
      allowed: false as const,
      reason: strategicDestinations.length === 0 ? '没有道路连通的己方目标城池' : '请选择执行武将',
    };
  const displayedTransportAvailability = disabled
    ? { allowed: false as const, reason: '当前有待处理操作，暂时不能执行城池命令' }
    : transportAvailability;
  const canTransport = isOwned && displayedTransportAvailability.allowed;
  const canAppoint = isOwned && Boolean(selectedOfficer) && city.satrapOfficerId !== selectedOfficerId;
  const canDistribute = isOwned && Boolean(selectedOfficer) && Number.isInteger(distributionValue)
    && distributionValue >= 0 && distributionValue <= distributionCapacity
    && distributionDelta <= city.reserveTroops && distributionDelta !== 0;
  const canAttack = isOwned && selectedAttackerIds.length > 0 && Boolean(selectedTargetId)
    && Number.isInteger(provisionValue) && provisionValue > 0 && provisionValue <= city.food;
  const reconAvailability = selectedOfficer && selectedReconTargetId
    ? getReconAvailability(state, {
      sourceCityId: city.id,
      targetCityId: selectedReconTargetId,
      officerId: selectedOfficer.id,
    })
    : { allowed: false as const, reason: reconTargets.length === 0 ? '当前没有可侦察的非己方城池' : '请选择执行武将' };
  const displayedReconAvailability = disabled
    ? { allowed: false as const, reason: '当前有待处理操作，暂时不能执行城池命令' }
    : reconAvailability;

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
        <Stat label="人口" value={intelValue(isPlayerCity, city.population, intelReport?.population)} />
        <Stat label="金钱" value={intelValue(isPlayerCity, city.money, intelReport?.money)} />
        <Stat label="粮草" value={intelValue(isPlayerCity, city.food, intelReport?.food)} />
        <Stat label="后备兵" value={intelValue(isPlayerCity, city.reserveTroops, intelReport?.reserveTroops)} />
        <Stat label="农业" value={isPlayerCity
          ? `${city.farming}${city.farmingLimit ? ` / ${city.farmingLimit}` : ''}`
          : intelValue(false, city.farming, intelReport?.farming)} />
        <Stat label="商业" value={isPlayerCity
          ? `${city.commerce}${city.commerceLimit ? ` / ${city.commerceLimit}` : ''}`
          : intelValue(false, city.commerce, intelReport?.commerce)} />
        <Stat label="民忠" value={isPlayerCity
          ? String(city.publicLoyalty ?? '—')
          : intelValue(false, city.publicLoyalty ?? 0, intelReport?.publicLoyalty)} />
        <Stat label="城防" value={intelValue(isPlayerCity, city.defense, intelReport?.defense)} />
        <Stat label="防灾" value={isPlayerCity ? String(city.disasterPrevention ?? 0) : '未知'} />
        <Stat label="太守" value={isPlayerCity ? satrap?.name ?? '空缺' : intelReport?.satrapName ?? '未知'} />
      </dl>

      {!isPlayerCity && (
        <p className={`intel-status ${intelReport ? 'known' : 'unknown'}`}>
          {intelReport
            ? `情报采集于 ${intelReport.observedYear} 年 ${intelReport.observedMonth} 月（${state.turn - intelReport.observedTurn} 月前）`
            : '尚无该城情报；请从己方城池派武将侦察。'}
        </p>
      )}

      <div className="officer-section">
        <div className="section-title">
          <h3>驻城人物</h3>
          <span>{isPlayerCity ? `${officers.length} 人` : intelReport ? `${intelReport.officerCount} 人（侦察时）` : '未知'}</span>
        </div>
        {isPlayerCity ? <div className="officer-list">
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
                <span>等级 {officer.level ?? 1} · 经验 {officer.experience ?? 0}/100</span>
                <span>装备 {equipmentNames || '无'}</span>
                <span>{city.satrapOfficerId === officer.id ? '太守' : '在职'} · {state.actedOfficerIds.includes(officer.id) ? '已行动' : '待命'}</span>
              </div>
            );
          })}
          {officers.length > 8 && <p className="more-officers">另有 {officers.length - 8} 人</p>}
        </div> : intelReport ? (
          <div className="intel-garrison-summary">
            <strong>驻军合计 {number.format(intelReport.totalTroops)} 兵</strong>
            <span>武将 {intelReport.officerCount} 人 · 后备兵 {number.format(intelReport.reserveTroops)}</span>
            <span>这是侦察时的快照，后续变化不会自动更新。</span>
          </div>
        ) : <p className="command-hint">驻城武将与兵力未知。</p>}
      </div>

      <div className="command-panel" aria-label="城池命令">
        <div className="section-title">
          <h3>城池命令</h3>
          <span>{isOwned ? '玩家阶段' : '仅可查看'}</span>
        </div>

        {isOwned && (eligibleOfficers.length > 0 || captives.length > 0) ? (
          <>
            {eligibleOfficers.length > 0 ? (
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
            ) : (
              <p className="command-hint">本城没有可下令的己方武将；仍可释放俘虏。</p>
            )}

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
              <button
                type="button"
                disabled={!isOwned || !displayedCommerceAvailability.allowed}
                onClick={() => onDevelopCommerce(city.id, selectedOfficerId)}
                aria-describedby="civic-command-guidance"
                title={displayedCommerceAvailability.allowed
                  ? `消耗金钱 ${DEVELOP_MONEY_COST}、体力 ${DEVELOP_STAMINA_COST}`
                  : displayedCommerceAvailability.reason}
              >
                招商
              </button>
              <button
                type="button"
                disabled={!isOwned || !displayedGovernAvailability.allowed}
                onClick={() => onGovern(city.id, selectedOfficerId)}
                aria-describedby="civic-command-guidance"
                title={displayedGovernAvailability.allowed
                  ? `提高防灾，消耗金钱 ${GOVERN_MONEY_COST}、体力 ${GOVERN_STAMINA_COST}`
                  : displayedGovernAvailability.reason}
              >
                治理
              </button>
              <button
                type="button"
                disabled={!isOwned || !displayedInspectAvailability.allowed}
                onClick={() => onInspect(city.id, selectedOfficerId)}
                aria-describedby="civic-command-guidance"
                title={displayedInspectAvailability.allowed
                  ? `提高民忠与人口，消耗金钱 ${INSPECT_MONEY_COST}、体力 ${INSPECT_STAMINA_COST}`
                  : displayedInspectAvailability.reason}
              >
                出巡
              </button>
            </div>
            <div className="civic-command-guidance" id="civic-command-guidance">
              <span>
                招商：
                {displayedCommerceAvailability.allowed
                  ? `商业预计 +${commerceGainRange[0]}～${commerceGainRange[1]}；${DEVELOP_MONEY_COST} 金、${DEVELOP_STAMINA_COST} 体力、占用本月行动。`
                  : `不可用——${displayedCommerceAvailability.reason}`}
              </span>
              <span>
                治理：
                {displayedGovernAvailability.allowed
                  ? `防灾 +1～4；${GOVERN_MONEY_COST} 金、${GOVERN_STAMINA_COST} 体力、占用本月行动。灾害效果将在 v0.5 接入。`
                  : `不可用——${displayedGovernAvailability.reason}`}
              </span>
              <span>
                出巡：
                {displayedInspectAvailability.allowed
                  ? `民忠 +1～4、人口最多 +100；${INSPECT_MONEY_COST} 金、${INSPECT_STAMINA_COST} 体力、占用本月行动。`
                  : `不可用——${displayedInspectAvailability.reason}`}
              </span>
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
                <span>道路目标城池（调动/输送共用，每段道路 1 个月）</span>
                <select
                  value={selectedMoveTargetId}
                  onChange={(event) => setSelectedMoveTargetId(event.target.value)}
                  disabled={strategicDestinations.length === 0}
                >
                  {strategicDestinations.length === 0 && <option value="">没有可调动城池</option>}
                  {strategicDestinations.map((destination) => (
                    <option value={destination.city.id} key={destination.city.id}>
                      {destination.city.name} · {destination.durationMonths} 个月
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={disabled || !canMove}
                onClick={() => onMove(city.id, selectedMoveTargetId, selectedOfficerId)}
                aria-describedby={!displayedMoveAvailability.allowed ? 'move-command-hint' : undefined}
                title={displayedMoveAvailability.allowed
                  ? `消耗体力 ${MOVE_STAMINA_COST}，预计 ${displayedMoveAvailability.durationMonths} 个月`
                  : displayedMoveAvailability.reason}
              >
                启程
              </button>
              <button
                type="button"
                disabled={disabled || !canAppoint}
                onClick={() => onAppoint(city.id, selectedOfficerId)}
              >
                任太守
              </button>
            </div>
            {!displayedMoveAvailability.allowed && (
              <p className="command-hint" id="move-command-hint">
                暂不可调动：{displayedMoveAvailability.reason}
              </p>
            )}
            <div className="transport-command-card">
              <div className="transport-command-heading">
                <strong>
                  输送至
                  {' '}
                  {state.cities[selectedMoveTargetId]?.name ?? '未选择目标'}
                </strong>
                <span>执行者完成后返回出发城 · 体力 {TRANSPORT_STAMINA_COST}</span>
              </div>
              <p className="transport-risk" id="transport-command-risk">
                成功率 79%；失败时本批货物全部损失，执行者仍会返回。
              </p>
              <div className="transport-resource-grid">
                <label className="command-field">
                  <span>金钱（{number.format(city.money)}）</span>
                  <input
                    type="number"
                    min="0"
                    max={city.money}
                    step="1"
                    value={transportMoney}
                    onChange={(event) => setTransportMoney(event.target.value)}
                  />
                </label>
                <label className="command-field">
                  <span>粮草（{number.format(city.food)}）</span>
                  <input
                    type="number"
                    min="0"
                    max={city.food}
                    step="1"
                    value={transportFood}
                    onChange={(event) => setTransportFood(event.target.value)}
                  />
                </label>
                <label className="command-field">
                  <span>后备兵（{number.format(city.reserveTroops)}）</span>
                  <input
                    type="number"
                    min="0"
                    max={city.reserveTroops}
                    step="1"
                    value={transportReserveTroops}
                    onChange={(event) => setTransportReserveTroops(event.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={!canTransport}
                aria-describedby={!displayedTransportAvailability.allowed
                  ? 'transport-command-risk transport-command-hint'
                  : 'transport-command-risk'}
                onClick={() => {
                  if (onTransport(
                    city.id,
                    selectedMoveTargetId,
                    selectedOfficerId,
                    transportCargo,
                  )) {
                    setTransportMoney('0');
                    setTransportFood('0');
                    setTransportReserveTroops('0');
                  }
                }}
              >
                发起输送
              </button>
              {!displayedTransportAvailability.allowed && (
                <p className="command-hint" id="transport-command-hint">
                  暂不可输送：{displayedTransportAvailability.reason}
                </p>
              )}
            </div>
            <button
              type="button"
              className="reward-command"
              disabled={disabled || !canReward}
              onClick={() => onReward(city.id, selectedOfficerId)}
              title={(selectedOfficer?.loyalty ?? 0) >= 100
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
            {captives.length > 0 && (
              <div className="captive-command-block">
                <p className="command-group-title">俘虏</p>
                <label className="command-field">
                  <span>本城俘虏</span>
                  <select value={selectedCaptiveId} onChange={(event) => setSelectedCaptiveId(event.target.value)}>
                    {captives.map((captive) => (
                      <option value={captive.id} key={captive.id}>
                        {captive.name} · 智 {getEffectiveOfficerAttributes(state, captive).intelligence} · 忠 {captive.loyalty}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="city-command-buttons">
                  <button
                    type="button"
                    disabled={disabled || !canRecruitCaptive}
                    onClick={() => selectedCaptive && onRecruitCaptive(city.id, selectedOfficerId, selectedCaptive.id)}
                    title={captiveRecruitReason}
                    aria-describedby="captive-recruit-hint"
                  >
                    招降
                  </button>
                  <button
                    type="button"
                    disabled={disabled || !isOwned || !selectedCaptive}
                    onClick={() => selectedCaptive && onReleaseCaptive(city.id, selectedCaptive.id)}
                    title="现代化人道选项：不消耗行动，俘虏转为本城在野人物"
                  >
                    释放
                  </button>
                </div>
                {(disabled || !canRecruitCaptive) && (
                  <p className="command-hint" id="captive-recruit-hint">暂不可招降：{captiveRecruitReason}</p>
                )}
              </div>
            )}

            <p className="command-group-title">军事</p>
            <div className="recon-command-row">
              <label className="command-field">
                <span>侦察目标</span>
                <select
                  value={selectedReconTargetId}
                  onChange={(event) => setSelectedReconTargetId(event.target.value)}
                  disabled={reconTargets.length === 0}
                >
                  {reconTargets.length === 0 && <option value="">没有非己方城池</option>}
                  {reconTargets.map((target) => (
                    <option value={target.id} key={target.id}>
                      {target.name} · {state.factions[target.ownerId]?.name ?? '未知势力'}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!displayedReconAvailability.allowed}
                onClick={() => onRecon(city.id, selectedReconTargetId, selectedOfficerId)}
                title={displayedReconAvailability.allowed
                  ? `获取敌城情报快照，消耗 ${RECON_MONEY_COST} 金、${RECON_STAMINA_COST} 体力和本月行动`
                  : displayedReconAvailability.reason}
              >
                侦察
              </button>
            </div>
            {!displayedReconAvailability.allowed && (
              <p className="command-hint">暂不可侦察：{displayedReconAvailability.reason}</p>
            )}
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

function intelValue(isCurrent: boolean, current: number, observed: number | undefined): string {
  return isCurrent ? number.format(current) : observed === undefined ? '未知' : number.format(observed);
}
