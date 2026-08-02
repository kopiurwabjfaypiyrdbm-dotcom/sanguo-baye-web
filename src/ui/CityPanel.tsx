import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ARMS_PER_MONEY,
  BANQUET_STAMINA_RECOVERY,
  BUY_FOOD_PRICE,
  DEFAULT_RECRUIT_AMOUNT,
  SELL_FOOD_PRICE,
  TRADE_MONEY_SOFT_CAP,
  calculateCommerceGain,
  calculateFarmingGain,
  calculatePlunderGains,
  calculateOfficerTroopCapacity,
  calculateRecruitCapacity,
  getDevelopCommerceAvailability,
  getDevelopFarmingAvailability,
  getBanquetAvailability,
  getGovernAvailability,
  getInspectAvailability,
  getPlunderAvailability,
  getTradeAvailability,
} from '../core/cityCommands';
import type { DiplomaticOrderKind, GameState } from '../core/types';
import {
  RECRUIT_OFFICER_STAMINA_COST,
  REWARD_LOYALTY_GAIN,
  REWARD_MONEY_COST,
  SEARCH_STAMINA_COST,
  getGiveItemAvailability,
} from '../core/personnelCommands';
import { getCityCaptives, getCityFreeOfficers, getCityOfficers, getNeighborCities } from '../core/selectors';
import { getEffectiveOfficerAttributes, getOfficerEquipmentIds } from '../core/equipment';
import {
  getReconAvailability,
  getReconTargets,
} from '../core/reconnaissance';
import {
  getMoveAvailability,
  getStrategicDestinations,
  getTransportAvailability,
} from '../core/strategicOrders';
import { CITY_CONDITION_LABELS } from '../core/cityEvents';
import {
  getDiplomacyTargets,
  getDiplomaticOrderAvailability,
} from '../core/diplomaticOrders';
import { getCampaignCommandCost } from '../core/rulesets';
import { CommandReviewDialog, type CommandReview } from './CommandReviewDialog';
import type { CityContextAnchor } from './CityContextMenu';
import { getCityCommand, type CityCommandId } from './cityCommandCatalog';

type PendingCommandReview = CommandReview & { execute: () => void };
type InlineCommandSummary = {
  effects: string[];
  costs: string[];
  risks?: string[];
  unavailableReason?: string;
};
export type CityPanelSection = 'summary' | 'internal' | 'personnel' | 'military' | 'intrigue';

type CityPanelProps = {
  state: GameState;
  cityId: string;
  focusOfficerId?: string;
  disabled?: boolean;
  presentation?: 'detail' | 'command';
  initialSection?: CityPanelSection;
  initialCommand?: CityCommandId;
  contextAnchor?: CityContextAnchor;
  dangerousConfirmationDismissRequest?: number;
  onDangerousConfirmationChange?: (open: boolean) => void;
  onClose: () => void;
  onDevelop: (cityId: string, officerId: string) => void;
  onDevelopCommerce: (cityId: string, officerId: string) => void;
  onGovern: (cityId: string, officerId: string) => void;
  onInspect: (cityId: string, officerId: string) => void;
  onTrade: (cityId: string, officerId: string, direction: 'buy' | 'sell', amount: number) => void;
  onBanquet: (cityId: string, targetOfficerId: string) => void;
  onPlunder: (cityId: string, officerId: string) => void;
  onRecruit: (cityId: string, officerId: string) => void;
  onSearch: (cityId: string, officerId: string) => void;
  onRecruitOfficer: (cityId: string, executorOfficerId: string, targetOfficerId: string) => void;
  onReward: (cityId: string, officerId: string) => void;
  onGiveItem: (cityId: string, officerId: string, itemId: string) => void;
  onUnequipItem: (cityId: string, officerId: string, itemId: string) => void;
  onConfiscateItem: (cityId: string, officerId: string, itemId: string) => void;
  onBanishOfficer: (cityId: string, officerId: string) => void;
  onRecruitCaptive: (cityId: string, executorOfficerId: string, captiveOfficerId: string) => void;
  onReleaseCaptive: (cityId: string, captiveOfficerId: string) => void;
  onExecuteCaptive: (cityId: string, captiveOfficerId: string) => void;
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
  onDiplomacy: (
    kind: DiplomaticOrderKind,
    sourceCityId: string,
    officerId: string,
    targetOfficerId: string,
  ) => void;
  onAttack: (sourceCityId: string, targetCityId: string, officerIds: string[], provisions: number) => void;
};

const number = new Intl.NumberFormat('zh-CN');
const conditionGuidance = {
  famine: '饥荒：农业、商业和民忠每月约 -5%，人口 -25%，后备兵减半；补足粮草可在月末自然恢复，治理可立即解除。',
  drought: '旱灾：农业与粮草每月约 -5%，人口和后备兵 -25%，驻军兵力 -25%；防灾可促使月末恢复，治理可立即解除。',
  flood: '水灾：农业/粮草约 -5%，商业/金钱 -10%，人口/后备兵/驻军 -25%；防灾可促使月末恢复，治理可立即解除。',
  rebellion: '暴动：农业/粮草/商业/金钱约 -5%，民忠 -10%，后备兵与驻军减半；民忠可促使月末恢复，治理可立即解除。',
} as const;

export function CityPanel({
  state,
  cityId,
  focusOfficerId,
  disabled = false,
  presentation = 'detail',
  initialSection = 'summary',
  initialCommand,
  contextAnchor,
  dangerousConfirmationDismissRequest = 0,
  onDangerousConfirmationChange,
  onClose,
  onDevelop,
  onDevelopCommerce,
  onGovern,
  onInspect,
  onTrade,
  onBanquet,
  onPlunder,
  onRecruit,
  onSearch,
  onRecruitOfficer,
  onReward,
  onGiveItem,
  onUnequipItem,
  onConfiscateItem,
  onBanishOfficer,
  onRecruitCaptive,
  onReleaseCaptive,
  onExecuteCaptive,
  onMove,
  onTransport,
  onAppoint,
  onDistribute,
  onRecon,
  onDiplomacy,
  onAttack,
}: CityPanelProps) {
  const developCost = getCampaignCommandCost(state.rulesetId, 'develop');
  const governCost = getCampaignCommandCost(state.rulesetId, 'govern');
  const inspectCost = getCampaignCommandCost(state.rulesetId, 'inspect');
  const tradeCost = getCampaignCommandCost(state.rulesetId, 'trade');
  const banquetCost = getCampaignCommandCost(state.rulesetId, 'banquet');
  const plunderCost = getCampaignCommandCost(state.rulesetId, 'plunder');
  const recruitCost = getCampaignCommandCost(state.rulesetId, 'recruit-troops');
  const surrenderCost = getCampaignCommandCost(state.rulesetId, 'surrender');
  const moveCost = getCampaignCommandCost(state.rulesetId, 'move');
  const transportCost = getCampaignCommandCost(state.rulesetId, 'transport');
  const reconCost = getCampaignCommandCost(state.rulesetId, 'reconnoitre');
  const DEVELOP_STAMINA_COST = developCost.stamina;
  const DEVELOP_MONEY_COST = developCost.money;
  const GOVERN_STAMINA_COST = governCost.stamina;
  const GOVERN_MONEY_COST = governCost.money;
  const INSPECT_STAMINA_COST = inspectCost.stamina;
  const INSPECT_MONEY_COST = inspectCost.money;
  const TRADE_STAMINA_COST = tradeCost.stamina;
  const BANQUET_MONEY_COST = banquetCost.money;
  const PLUNDER_STAMINA_COST = plunderCost.stamina;
  const RECRUIT_STAMINA_COST = recruitCost.stamina;
  const SURRENDER_STAMINA_COST = surrenderCost.stamina;
  const MOVE_STAMINA_COST = moveCost.stamina;
  const TRANSPORT_STAMINA_COST = transportCost.stamina;
  const RECON_STAMINA_COST = reconCost.stamina;
  const RECON_MONEY_COST = reconCost.money;
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
  const [selectedDiplomacyKind, setSelectedDiplomacyKind] = useState<DiplomaticOrderKind>('alienate');
  const diplomacyCost = getCampaignCommandCost(state.rulesetId, selectedDiplomacyKind);
  const DIPLOMACY_STAMINA_COST = diplomacyCost.stamina;
  const DIPLOMACY_MONEY_COST = diplomacyCost.money;
  const diplomacyTargets = useMemo(
    () => getDiplomacyTargets(state, selectedDiplomacyKind, state.playerFactionId),
    [state, selectedDiplomacyKind],
  );
  const [selectedOfficerId, setSelectedOfficerId] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [selectedMoveTargetId, setSelectedMoveTargetId] = useState('');
  const [transportMoney, setTransportMoney] = useState('0');
  const [transportFood, setTransportFood] = useState('0');
  const [transportReserveTroops, setTransportReserveTroops] = useState('0');
  const [selectedRecruitTargetId, setSelectedRecruitTargetId] = useState('');
  const [selectedReconTargetId, setSelectedReconTargetId] = useState('');
  const [selectedDiplomacyTargetId, setSelectedDiplomacyTargetId] = useState('');
  const [distributionTarget, setDistributionTarget] = useState('0');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedCaptiveId, setSelectedCaptiveId] = useState('');
  const [selectedAttackerIds, setSelectedAttackerIds] = useState<string[]>([]);
  const [provisions, setProvisions] = useState('100');
  const [activeCivicCommand, setActiveCivicCommand] = useState<'trade' | 'banquet' | 'plunder' | null>(
    initialCommand === 'trade' || initialCommand === 'banquet' || initialCommand === 'plunder'
      ? initialCommand
      : null,
  );
  const [activeSection, setActiveSection] = useState<CityPanelSection>(initialSection);
  const [pendingCommandReview, setPendingCommandReview] = useState<PendingCommandReview>();
  const [tradeDirection, setTradeDirection] = useState<'buy' | 'sell'>('buy');
  const [tradeAmount, setTradeAmount] = useState('1');

  useEffect(() => {
    onDangerousConfirmationChange?.(Boolean(pendingCommandReview));
    return () => onDangerousConfirmationChange?.(false);
  }, [onDangerousConfirmationChange, pendingCommandReview]);

  useEffect(() => {
    if (dangerousConfirmationDismissRequest > 0) setPendingCommandReview(undefined);
  }, [dangerousConfirmationDismissRequest]);

  useEffect(() => {
    if (!eligibleOfficers.some((officer) => officer.id === selectedOfficerId)) {
      setSelectedOfficerId(eligibleOfficers[0]?.id ?? '');
    }
  }, [eligibleOfficers, selectedOfficerId]);

  useEffect(() => {
    if (focusOfficerId && eligibleOfficers.some((officer) => officer.id === focusOfficerId)) {
      setSelectedOfficerId(focusOfficerId);
    }
  }, [eligibleOfficers, focusOfficerId]);

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
    setActiveCivicCommand(
      initialCommand === 'trade' || initialCommand === 'banquet' || initialCommand === 'plunder'
        ? initialCommand
        : null,
    );
    setTradeAmount('1');
  }, [city.id, disabled, initialCommand, selectedOfficerId, state.phase, state.turn]);

  useEffect(() => {
    if (!reconTargets.some((target) => target.id === selectedReconTargetId)) {
      setSelectedReconTargetId(reconTargets[0]?.id ?? '');
    }
  }, [reconTargets, selectedReconTargetId]);

  useEffect(() => {
    if (!diplomacyTargets.some((target) => target.id === selectedDiplomacyTargetId)) {
      setSelectedDiplomacyTargetId(diplomacyTargets[0]?.id ?? '');
    }
  }, [diplomacyTargets, selectedDiplomacyTargetId]);

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
  const farmingGainRange = selectedEffectiveAttributes
    ? [
      calculateFarmingGain(selectedEffectiveAttributes, 0),
      calculateFarmingGain(selectedEffectiveAttributes, 0.999_999),
    ]
    : [0, 0];
  const selectedCaptive = captives.find((captive) => captive.id === selectedCaptiveId);
  const selectedItem = state.items[selectedItemId];
  const selectedRecruitTarget = discoveredFreeOfficers.find((officer) => officer.id === selectedRecruitTargetId);
  const selectedMoveTarget = strategicDestinations.find((destination) => destination.city.id === selectedMoveTargetId);
  const selectedDiplomacyTarget = diplomacyTargets.find((officer) => officer.id === selectedDiplomacyTargetId);
  const selectedReconTarget = reconTargets.find((target) => target.id === selectedReconTargetId);
  const selectedAttackTarget = hostileNeighbors.find((target) => target.id === selectedTargetId);
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
  const tradeValue = Number(tradeAmount);
  const tradeAvailability = selectedOfficer
    ? getTradeAvailability(state, {
      cityId: city.id,
      officerId: selectedOfficer.id,
      direction: tradeDirection,
      amount: tradeValue,
    })
    : { allowed: false as const, reason: '请选择执行武将' };
  const banquetAvailability = selectedOfficer
    ? getBanquetAvailability(state, { cityId: city.id, targetOfficerId: selectedOfficer.id })
    : { allowed: false as const, reason: '请选择宴请目标' };
  const plunderAvailability = selectedOfficer
    ? getPlunderAvailability(state, { cityId: city.id, officerId: selectedOfficer.id })
    : { allowed: false as const, reason: '请选择执行武将' };
  const maxTradeAmount = tradeDirection === 'buy'
    ? Math.min(
      Math.floor(city.money / BUY_FOOD_PRICE),
      Math.max(0, TRADE_MONEY_SOFT_CAP - city.food),
    )
    : Math.min(city.food, Math.max(0, Math.floor((TRADE_MONEY_SOFT_CAP - city.money) / SELL_FOOD_PRICE)));
  const tradeMoneyDelta = Number.isSafeInteger(tradeValue) && tradeValue > 0
    ? tradeValue * (tradeDirection === 'buy' ? BUY_FOOD_PRICE : SELL_FOOD_PRICE)
    : 0;
  const plunderGains = selectedOfficer
    ? calculatePlunderGains(state, city, selectedOfficer)
    : { money: 0, food: 0 };
  const governMaxGain = Math.min(4, 100 - (city.disasterPrevention ?? 0));
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
  const recruitGain = Math.min(
    DEFAULT_RECRUIT_AMOUNT,
    calculateRecruitCapacity(city),
    0xffff - city.reserveTroops,
  );
  const recruitMoneyCost = Math.floor(recruitGain / ARMS_PER_MONEY);
  const recruitUnavailableReason = !isOwned
    ? '只能在己方城池征兵'
    : !selectedOfficer
      ? '请选择执行武将'
      : selectedOfficerActed
        ? `${selectedOfficer.name}本月已经行动`
        : selectedOfficer.stamina < RECRUIT_STAMINA_COST
          ? `${selectedOfficer.name}体力不足，需要 ${RECRUIT_STAMINA_COST}`
          : recruitGain <= 0
            ? '该城没有足够的金钱、民忠或后备兵容量'
            : '';
  const searchUnavailableReason = !isOwned
    ? '只能在己方城池搜寻'
    : !selectedOfficer
      ? '请选择执行武将'
      : selectedOfficerActed
        ? `${selectedOfficer.name}本月已经行动`
        : selectedOfficer.stamina < SEARCH_STAMINA_COST
          ? `${selectedOfficer.name}体力不足，需要 ${SEARCH_STAMINA_COST}`
          : '';
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
    && !selectedOfficerActed && selectedOfficer.stamina >= SURRENDER_STAMINA_COST
    && city.money >= surrenderCost.money;
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
            : city.money < surrenderCost.money
              ? `${city.name}金钱不足，需要 ${surrenderCost.money}`
              : `消耗 ${selectedOfficer.name} ${SURRENDER_STAMINA_COST} 点体力、${surrenderCost.money} 金和本月行动；失败会削弱俘虏忠诚`;
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
  const canAppoint = state.rulesetId !== 'baye-classic-v1'
    && isOwned && Boolean(selectedOfficer) && city.satrapOfficerId !== selectedOfficerId;
  const canDistribute = isOwned && Boolean(selectedOfficer) && Number.isInteger(distributionValue)
    && distributionValue >= 0 && distributionValue <= distributionCapacity
    && distributionDelta <= city.reserveTroops && distributionDelta !== 0;
  const canAttack = isOwned && selectedAttackerIds.length > 0 && Boolean(selectedTargetId)
    && Number.isInteger(provisionValue) && provisionValue > 0 && provisionValue <= city.food;
  const recruitOfficerUnavailableReason = !isOwned
    ? '只能在己方城池登用人才'
    : !selectedOfficer
      ? '请选择执行武将'
      : selectedOfficerActed
        ? `${selectedOfficer.name}本月已经行动`
        : selectedOfficer.stamina < RECRUIT_OFFICER_STAMINA_COST
          ? `${selectedOfficer.name}体力不足，需要 ${RECRUIT_OFFICER_STAMINA_COST}`
          : !selectedRecruitTargetId
            ? '本城没有已发现的可登用人才'
            : '';
  const rewardUnavailableReason = !isOwned
    ? '只能奖赏己方城池中的武将'
    : !selectedOfficer
      ? '请选择受赏武将'
      : selectedOfficer.id === state.factions[state.playerFactionId].rulerOfficerId
        ? '君主不需要通过奖赏提高忠诚'
        : selectedOfficer.loyalty >= 100
          ? `${selectedOfficer.name}忠诚已经达到上限`
          : city.money < REWARD_MONEY_COST
            ? `${city.name}金钱不足，需要 ${REWARD_MONEY_COST}`
            : '';
  const appointUnavailableReason = state.rulesetId === 'baye-classic-v1'
    ? '经典校准规则由君主或城内智力最高者自动担任太守'
    : !isOwned
      ? '只能任命己方城池太守'
      : !selectedOfficer
        ? '请选择太守人选'
        : city.satrapOfficerId === selectedOfficerId
          ? `${selectedOfficer.name}已经是${city.name}太守`
          : '';
  const banishUnavailableReason = !isOwned
    ? '只能处置己方武将'
    : !selectedOfficer
      ? '请选择要流放的武将'
      : selectedOfficer.id === state.factions[state.playerFactionId].rulerOfficerId
        ? '不能流放当前君主'
        : '';
  const distributeUnavailableReason = !isOwned
    ? '只能在己方城池分配兵力'
    : !selectedOfficer
      ? '请选择执行武将'
      : !Number.isInteger(distributionValue) || distributionValue < 0
        ? '兵力必须是非负整数'
        : distributionValue > distributionCapacity
          ? `超过武将带兵上限 ${number.format(distributionCapacity)}`
          : distributionDelta > city.reserveTroops
            ? '城中后备兵不足'
            : distributionDelta === 0
              ? '请输入不同于当前兵力的数值'
              : '';
  const attackUnavailableReason = !isOwned
    ? '只能从己方城池出征'
    : hostileNeighbors.length === 0
      ? '没有相邻敌对城池'
      : selectedAttackerIds.length === 0
        ? '请选择至少一名可出征武将'
        : !Number.isInteger(provisionValue) || provisionValue <= 0
          ? '携带粮草必须是正整数'
          : provisionValue > city.food
            ? `${city.name}粮草不足`
            : '';
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
  const diplomacyAvailability = selectedOfficer && selectedDiplomacyTargetId
    ? getDiplomaticOrderAvailability(state, {
      kind: selectedDiplomacyKind,
      sourceCityId: city.id,
      officerId: selectedOfficer.id,
      targetOfficerId: selectedDiplomacyTargetId,
    })
    : {
      allowed: false as const,
      reason: diplomacyTargets.length === 0 ? '没有基于本月情报可选择的合法目标' : '请选择执行武将',
    };
  const displayedDiplomacyAvailability = disabled
    ? { allowed: false as const, reason: '当前有待处理操作，暂时不能执行城池命令' }
    : diplomacyAvailability;

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
    setPendingCommandReview(undefined);
    setActiveSection(initialSection);
    setActiveCivicCommand(
      initialCommand === 'trade' || initialCommand === 'banquet' || initialCommand === 'plunder'
        ? initialCommand
        : null,
    );
  }, [city.id, initialCommand, initialSection]);

  const commandDefinition = initialCommand ? getCityCommand(initialCommand) : undefined;
  const showCommand = (...commandIds: CityCommandId[]) => !initialCommand || commandIds.includes(initialCommand);
  const focusedPrimaryClass = (base?: string) => [base, initialCommand ? 'focused-primary-action' : '']
    .filter(Boolean)
    .join(' ') || undefined;
  const inlineCommandSummary = initialCommand ? buildInlineCommandSummary(initialCommand) : undefined;
  const hasQuickCommandAnchor = presentation === 'command'
    && commandDefinition?.editorSize === 'quick'
    && contextAnchor?.visible
    && contextAnchor.cityId === city.id;
  const quickCommandOpensBelow = hasQuickCommandAnchor
    ? contextAnchor.y < contextAnchor.viewportHeight * 0.58
    : true;
  const quickCommandHalfWidth = hasQuickCommandAnchor
    ? Math.min(240, Math.max(150, contextAnchor.viewportWidth / 2 - 10))
    : 0;
  const quickCommandLeft = hasQuickCommandAnchor
    ? Math.min(
      Math.max(contextAnchor.x, quickCommandHalfWidth),
      Math.max(quickCommandHalfWidth, contextAnchor.viewportWidth - quickCommandHalfWidth),
    )
    : 0;
  const quickCommandTop = hasQuickCommandAnchor
    ? quickCommandOpensBelow ? contextAnchor.y + 38 : contextAnchor.y - 36
    : 0;
  const commandPanelStyle = hasQuickCommandAnchor ? {
    '--city-command-left': `${quickCommandLeft}px`,
    '--city-command-top': `${quickCommandTop}px`,
  } as CSSProperties : undefined;

  function buildInlineCommandSummary(commandId: CityCommandId): InlineCommandSummary | undefined {
    switch (commandId) {
      case 'develop':
        return {
          effects: [`农业预计提高 ${farmingGainRange[0]}～${farmingGainRange[1]}`],
          costs: [`金钱 ${DEVELOP_MONEY_COST}`, `体力 ${DEVELOP_STAMINA_COST}`, '占用本月行动'],
          risks: ['实际增量由当前确定性随机序列决定，并受农业上限约束。'],
          unavailableReason: disabled ? '当前有待处理操作，暂时不能执行城池命令' : farmingAvailability.allowed ? undefined : farmingAvailability.reason,
        };
      case 'commerce':
        return {
          effects: [`商业预计提高 ${commerceGainRange[0]}～${commerceGainRange[1]}`],
          costs: [`金钱 ${DEVELOP_MONEY_COST}`, `体力 ${DEVELOP_STAMINA_COST}`, '占用本月行动'],
          risks: ['实际增量由当前确定性随机序列决定，并受商业上限约束。'],
          unavailableReason: displayedCommerceAvailability.allowed ? undefined : displayedCommerceAvailability.reason,
        };
      case 'govern':
        return {
          effects: [
            (city.condition ?? 'normal') === 'normal' ? '维持城市正常状态' : `解除${CITY_CONDITION_LABELS[city.condition ?? 'normal']}`,
            governMaxGain > 0 ? `防灾提高 1～${governMaxGain}` : '防灾已满',
          ],
          costs: [`金钱 ${GOVERN_MONEY_COST}`, `体力 ${GOVERN_STAMINA_COST}`, '占用本月行动'],
          unavailableReason: displayedGovernAvailability.allowed ? undefined : displayedGovernAvailability.reason,
        };
      case 'inspect':
        return {
          effects: ['民忠提高 1～4', '人口最多增加 100'],
          costs: [`金钱 ${INSPECT_MONEY_COST}`, `体力 ${INSPECT_STAMINA_COST}`, '占用本月行动'],
          unavailableReason: displayedInspectAvailability.allowed ? undefined : displayedInspectAvailability.reason,
        };
      case 'trade':
        return {
          effects: tradeDirection === 'buy'
            ? [`粮草增加 ${number.format(Number.isFinite(tradeValue) ? tradeValue : 0)}`]
            : [`金钱增加 ${number.format(tradeMoneyDelta)}`],
          costs: [
            tradeDirection === 'buy'
              ? `金钱 ${number.format(tradeMoneyDelta)}`
              : `粮草 ${number.format(Number.isFinite(tradeValue) ? tradeValue : 0)}`,
            `体力 ${TRADE_STAMINA_COST}`,
            '占用本月行动',
          ],
          unavailableReason: disabled
            ? '当前有待处理操作，暂时不能执行城池命令'
            : tradeAvailability.allowed ? undefined : tradeAvailability.reason,
        };
      case 'banquet':
        return {
          effects: [
            `${selectedOfficer?.name ?? '所选武将'}体力最多恢复 ${BANQUET_STAMINA_RECOVERY}`,
            selectedOfficer && state.factions[selectedOfficer.factionId]?.rulerOfficerId === selectedOfficer.id
              ? '君主忠诚不变'
              : '忠诚提高 1',
          ],
          costs: [`金钱 ${BANQUET_MONEY_COST}`, '不占用本月行动'],
          unavailableReason: disabled
            ? '当前有待处理操作，暂时不能执行城池命令'
            : banquetAvailability.allowed ? undefined : banquetAvailability.reason,
        };
      case 'plunder':
        return {
          effects: [
            `获得 ${number.format(plunderGains.money)} 金`,
            `获得 ${number.format(plunderGains.food)} 粮`,
          ],
          costs: [`体力 ${PLUNDER_STAMINA_COST}`, '占用本月行动'],
          risks: [
            `民忠 ${city.publicLoyalty ?? 70} → ${Math.floor((city.publicLoyalty ?? 70) / 2)}`,
            `农业 ${number.format(city.farming)} → ${number.format(Math.floor(city.farming / 2))}`,
            `商业 ${number.format(city.commerce)} → ${number.format(Math.floor(city.commerce / 2))}`,
            '执行后不可撤销。',
          ],
          unavailableReason: disabled
            ? '当前有待处理操作，暂时不能执行城池命令'
            : plunderAvailability.allowed ? undefined : plunderAvailability.reason,
        };
      case 'recruit-troops':
        return {
          effects: [`征募 ${number.format(recruitGain)} 名后备兵`],
          costs: [`金钱 ${number.format(recruitMoneyCost)}`, `体力 ${RECRUIT_STAMINA_COST}`, '占用本月行动'],
          unavailableReason: canRecruit && !disabled ? undefined : disabled ? '当前有待处理操作，暂时不能执行城池命令' : recruitUnavailableReason,
        };
      case 'search':
        return {
          effects: ['尝试发现或直接登用人才，也可能获得道具、金钱或粮草'],
          costs: [`体力 ${SEARCH_STAMINA_COST}`, '占用本月行动'],
          risks: ['搜索可能没有收获；结果受智力与确定性随机序列影响。'],
          unavailableReason: canSearch && !disabled ? undefined : disabled ? '当前有待处理操作，暂时不能执行城池命令' : searchUnavailableReason,
        };
      case 'recruit-officer':
        return {
          effects: [`尝试让${selectedRecruitTarget?.name ?? '目标人才'}加入${faction?.name ?? '己方势力'}`],
          costs: [`体力 ${RECRUIT_OFFICER_STAMINA_COST}`, '占用本月行动'],
          risks: ['失败后人才仍保持已发现状态。'],
          unavailableReason: canRecruitOfficer && !disabled ? undefined : disabled ? '当前有待处理操作，暂时不能执行城池命令' : recruitOfficerUnavailableReason,
        };
      case 'reward':
        return {
          effects: [`忠诚 ${selectedOfficer?.loyalty ?? 0} → ${Math.min(100, (selectedOfficer?.loyalty ?? 0) + REWARD_LOYALTY_GAIN)}`],
          costs: [`金钱 ${REWARD_MONEY_COST}`, '不占用本月行动'],
          unavailableReason: canReward && !disabled ? undefined : disabled ? '当前有待处理操作，暂时不能执行城池命令' : rewardUnavailableReason,
        };
      case 'move':
        return {
          effects: [`${selectedOfficer?.name ?? '所选武将'}预计 ${selectedMoveTarget?.durationMonths ?? '?'} 个月后抵达${selectedMoveTarget?.city.name ?? '目标城市'}`],
          costs: [`体力 ${MOVE_STAMINA_COST}`, '占用本月行动'],
          risks: city.satrapOfficerId === selectedOfficerId ? ['太守离城后将按当前规则自动补位。'] : undefined,
          unavailableReason: displayedMoveAvailability.allowed ? undefined : displayedMoveAvailability.reason,
        };
      case 'transport':
        return {
          effects: [
            `${selectedMoveTarget?.durationMonths ?? '?'} 个月后送达${selectedMoveTarget?.city.name ?? '目标城市'}`,
            `金 ${number.format(Number.isFinite(transportCargo.money) ? transportCargo.money : 0)} · 粮 ${number.format(Number.isFinite(transportCargo.food) ? transportCargo.food : 0)} · 兵 ${number.format(Number.isFinite(transportCargo.reserveTroops) ? transportCargo.reserveTroops : 0)}`,
          ],
          costs: [`体力 ${TRANSPORT_STAMINA_COST}`, '占用本月行动'],
          unavailableReason: displayedTransportAvailability.allowed ? undefined : displayedTransportAvailability.reason,
        };
      case 'appoint':
        return {
          effects: [`${selectedOfficer?.name ?? '所选武将'}成为${city.name}太守`],
          costs: ['不消耗金钱、体力或本月行动'],
          unavailableReason: canAppoint && !disabled ? undefined : disabled ? '当前有待处理操作，暂时不能执行城池命令' : appointUnavailableReason,
        };
      case 'banish':
        return {
          effects: [`${selectedOfficer?.name ?? '所选武将'}离开当前势力并流落他城`],
          costs: ['不占用本月行动'],
          risks: ['兵力清零，相关在途命令取消；执行后不可撤销。'],
          unavailableReason: !banishUnavailableReason && !disabled ? undefined : disabled ? '当前有待处理操作，暂时不能执行城池命令' : banishUnavailableReason,
        };
      case 'item':
        return {
          effects: selectedItem
            ? [`将${selectedItem.name}赏赐给${selectedOfficer?.name ?? '所选武将'}：${describeItem(selectedItem)}`]
            : selectedEquipmentIds.length > 0
              ? [`可卸下或没收${selectedOfficer?.name ?? '所选武将'}的装备`]
              : ['本城没有可处置道具'],
          costs: ['赏赐提高忠诚 8', '卸下或没收不占用本月行动'],
          risks: selectedOfficer
            && selectedOfficer.id !== state.factions[state.playerFactionId].rulerOfficerId
            && selectedEquipmentIds.length > 0
            ? ['没收非君主装备会降低忠诚 20，并要求危险确认。']
            : undefined,
          unavailableReason: selectedItem || selectedEquipmentIds.length > 0
            ? undefined
            : '城中没有已发现道具，所选武将也没有装备',
        };
      case 'captive':
        return {
          effects: selectedCaptive
            ? [`处置俘虏${selectedCaptive.name}：可招降、释放、流放或处斩`]
            : ['本城没有可处置俘虏'],
          costs: [`招降消耗 ${surrenderCost.money} 金、${SURRENDER_STAMINA_COST} 体力和本月行动`, '释放、流放或处斩不占用本月行动'],
          risks: ['流放与处斩会要求危险确认；处斩将使人物永久死亡。'],
          unavailableReason: selectedCaptive ? undefined : '本城没有可处置俘虏',
        };
      case 'distribute':
        return {
          effects: [
            `${selectedOfficer?.name ?? '所选武将'}兵力 ${number.format(selectedOfficer?.troops ?? 0)} → ${number.format(distributionValue)}`,
            `城中后备兵变为 ${number.format(city.reserveTroops - distributionDelta)}`,
          ],
          costs: ['不消耗金钱或体力', '占用本月行动'],
          unavailableReason: canDistribute && !disabled ? undefined : disabled ? '当前有待处理操作，暂时不能执行城池命令' : distributeUnavailableReason,
        };
      case 'recon':
        return {
          effects: [`获取${selectedReconTarget?.name ?? '目标城市'}当前情报快照`],
          costs: [`金钱 ${RECON_MONEY_COST}`, `体力 ${RECON_STAMINA_COST}`, '占用本月行动'],
          risks: ['情报是执行时快照，后续变化不会自动更新。'],
          unavailableReason: displayedReconAvailability.allowed ? undefined : displayedReconAvailability.reason,
        };
      case 'diplomacy':
        return {
          effects: [`发起为期 1 个月的${diplomacyLabel(selectedDiplomacyKind)}行动`],
          costs: [`金钱 ${DIPLOMACY_MONEY_COST}`, `体力 ${DIPLOMACY_STAMINA_COST}`, '占用本月行动'],
          risks: [diplomacyFactors(selectedDiplomacyKind), '不显示精确成功率；结果在命令到期时结算。'],
          unavailableReason: displayedDiplomacyAvailability.allowed ? undefined : displayedDiplomacyAvailability.reason,
        };
      case 'attack':
        return {
          effects: [`${selectedAttackerIds.length} 名武将、${number.format(selectedAttackerIds.reduce((sum, officerId) => sum + (state.officers[officerId]?.troops ?? 0), 0))} 兵出征${selectedAttackTarget ? `至${selectedAttackTarget.name}` : ''}`],
          costs: [`携带粮草 ${number.format(Number.isFinite(provisionValue) ? provisionValue : 0)}`],
          risks: ['确认后仍可选择亲自指挥或快速结算；伤亡和归属由战斗结果决定。'],
          unavailableReason: canAttack && !disabled ? undefined : disabled ? '当前有待处理操作，暂时不能执行城池命令' : attackUnavailableReason,
        };
      default:
        return undefined;
    }
  }

  function toggleAttacker(officerId: string) {
    setSelectedAttackerIds((current) => current.includes(officerId)
      ? current.filter((candidate) => candidate !== officerId)
      : current.length < 10 ? [...current, officerId] : current);
  }

  function reviewCommand(review: CommandReview, execute: () => void) {
    if (review.dangerous) {
      setPendingCommandReview({ ...review, execute });
      return;
    }
    execute();
    if (initialCommand) onClose();
  }

  function confirmReviewedCommand() {
    const command = pendingCommandReview;
    if (!command) return;
    setPendingCommandReview(undefined);
    command.execute();
    if (initialCommand) onClose();
  }

  return (
    <aside
      className={`side-panel ${presentation === 'command' ? 'city-command-executor' : 'city-detail-panel'} ${hasQuickCommandAnchor ? quickCommandOpensBelow ? 'anchored-below' : 'anchored-above' : ''}`}
      data-command-size={commandDefinition?.editorSize ?? 'quick'}
      data-focused-command={Boolean(initialCommand)}
      data-has-anchor={hasQuickCommandAnchor || undefined}
      style={commandPanelStyle}
      aria-label={`${city.name}${presentation === 'command' ? '命令操作条' : '城池详情'}`}
    >
      <div className="city-heading">
        <div>
          <p className="panel-kicker">City {city.sourceIndex !== undefined ? city.sourceIndex + 1 : ''}</p>
          <h2>{city.name}{commandDefinition ? ` · ${commandDefinition.label}` : ''}</h2>
        </div>
        <div className="city-heading-actions">
          {presentation === 'detail' && (
            <span className="faction-chip" style={{ '--faction-color': faction?.color } as CSSProperties}>
              {faction?.name ?? '未知势力'}
            </span>
          )}
          <button
            type="button"
            className="city-panel-close"
            aria-label={presentation === 'command' ? '返回命令分类' : '关闭城池面板'}
            onClick={onClose}
          >
            <span aria-hidden="true">{presentation === 'command' ? '‹' : '×'}</span>
          </button>
        </div>
      </div>

      {isOwned && presentation === 'command' && !initialCommand && (
        <nav className="city-category-nav" aria-label="城池管理分类">
          <button type="button" className={activeSection === 'internal' ? 'active' : undefined} onClick={() => setActiveSection('internal')}>内政</button>
          <button type="button" className={activeSection === 'personnel' ? 'active' : undefined} onClick={() => setActiveSection('personnel')}>人事</button>
          <button type="button" className={activeSection === 'military' ? 'active' : undefined} onClick={() => setActiveSection('military')}>军事</button>
          <button type="button" className={activeSection === 'intrigue' ? 'active' : undefined} onClick={() => setActiveSection('intrigue')}>谋略</button>
        </nav>
      )}

      <section className="city-summary-view" hidden={presentation !== 'detail'}>
      <dl className="city-stats" id="city-detail-start">
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
        <Stat label="状态" value={isPlayerCity ? CITY_CONDITION_LABELS[city.condition ?? 'normal'] : '未知'} />
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
                <span>忠 {officer.loyalty} · 年龄 {officer.age}</span>
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
      {isPlayerCity && city.condition && city.condition !== 'normal' && (
        <p className="city-condition-warning" role="status">{conditionGuidance[city.condition]}</p>
      )}
      {!isPlayerCity && (
        <p className="city-context-guidance">敌对或中立城池只显示已掌握的情报。侦察和出征需从相邻的己方城池发起。</p>
      )}
      </section>

      <div className="command-panel" aria-label="城池命令" hidden={presentation !== 'command'}>
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

            {inlineCommandSummary && <CommandEditorSummary summary={inlineCommandSummary} />}

            <section
              className="city-command-section"
              hidden={initialCommand
                ? !showCommand('develop', 'commerce', 'govern', 'inspect', 'trade', 'banquet', 'plunder', 'recruit-troops', 'search')
                : activeSection !== 'internal'}
            >
            <p className="command-group-title" id="city-command-internal">内政</p>
            <div className="city-command-buttons">
              <button
                type="button"
                className={focusedPrimaryClass()}
                hidden={!showCommand('develop')}
                disabled={disabled || !canDevelop}
                onClick={() => reviewCommand({
                  category: '内政',
                  title: '开垦',
                  city: city.name,
                  actor: selectedOfficer?.name,
                  effects: [`农业预计提高 ${farmingGainRange[0]}～${farmingGainRange[1]}`],
                  costs: [`金钱 ${DEVELOP_MONEY_COST}`, `体力 ${DEVELOP_STAMINA_COST}`, '占用执行武将本月行动'],
                  risks: ['实际增量由当前确定性随机序列决定，并受农业上限约束。'],
                }, () => onDevelop(city.id, selectedOfficerId))}
                title={farmingAvailability.allowed
                  ? `农业预计 +${farmingGainRange[0]}～${farmingGainRange[1]}`
                  : farmingAvailability.reason}
              >
                开垦
              </button>
              <button
                type="button"
                className={focusedPrimaryClass()}
                hidden={!showCommand('recruit-troops')}
                disabled={disabled || !canRecruit}
                onClick={() => reviewCommand({
                  category: '内政',
                  title: '征兵',
                  city: city.name,
                  actor: selectedOfficer?.name,
                  effects: [`征募 ${number.format(recruitGain)} 名后备兵`],
                  costs: [`金钱 ${number.format(recruitMoneyCost)}`, `体力 ${RECRUIT_STAMINA_COST}`, '占用执行武将本月行动'],
                  risks: ['征募数量受金钱、民忠与后备兵容量共同限制。'],
                }, () => onRecruit(city.id, selectedOfficerId))}
                title={canRecruit ? `征募 ${recruitGain} 人，消耗金钱 ${recruitMoneyCost}` : recruitUnavailableReason}
              >
                征兵
              </button>
              <button
                type="button"
                className={focusedPrimaryClass()}
                hidden={!showCommand('search')}
                disabled={disabled || !canSearch}
                onClick={() => reviewCommand({
                  category: '人事',
                  title: '搜寻',
                  city: city.name,
                  actor: selectedOfficer?.name,
                  effects: ['尝试发现或直接登用本地人才，也可能获得道具、金钱或粮草'],
                  costs: [`体力 ${SEARCH_STAMINA_COST}`, '占用执行武将本月行动'],
                  risks: ['搜索可能没有收获；结果由武将智力与确定性随机序列决定。'],
                }, () => onSearch(city.id, selectedOfficerId))}
                title={canSearch ? `搜寻人才或资源，消耗体力 ${SEARCH_STAMINA_COST}` : searchUnavailableReason}
              >
                搜寻
              </button>
              <button
                type="button"
                className={focusedPrimaryClass()}
                hidden={!showCommand('commerce')}
                disabled={!isOwned || !displayedCommerceAvailability.allowed}
                onClick={() => reviewCommand({
                  category: '内政',
                  title: '招商',
                  city: city.name,
                  actor: selectedOfficer?.name,
                  effects: [`商业预计提高 ${commerceGainRange[0]}～${commerceGainRange[1]}`],
                  costs: [`金钱 ${DEVELOP_MONEY_COST}`, `体力 ${DEVELOP_STAMINA_COST}`, '占用执行武将本月行动'],
                  risks: ['实际增量由当前确定性随机序列决定，并受商业上限约束。'],
                }, () => onDevelopCommerce(city.id, selectedOfficerId))}
                aria-describedby="civic-command-guidance"
                title={displayedCommerceAvailability.allowed
                  ? `消耗金钱 ${DEVELOP_MONEY_COST}、体力 ${DEVELOP_STAMINA_COST}`
                  : displayedCommerceAvailability.reason}
              >
                招商
              </button>
              <button
                type="button"
                className={focusedPrimaryClass()}
                hidden={!showCommand('govern')}
                disabled={!isOwned || !displayedGovernAvailability.allowed}
                onClick={() => reviewCommand({
                  category: '内政',
                  title: '治理',
                  city: city.name,
                  actor: selectedOfficer?.name,
                  effects: [
                    (city.condition ?? 'normal') === 'normal' ? '维持正常状态' : `解除${CITY_CONDITION_LABELS[city.condition ?? 'normal']}`,
                    governMaxGain > 0 ? `防灾提高 1～${governMaxGain}` : '防灾已满',
                  ],
                  costs: [`金钱 ${GOVERN_MONEY_COST}`, `体力 ${GOVERN_STAMINA_COST}`, '占用执行武将本月行动'],
                  risks: ['防灾实际增量由当前确定性随机序列决定。'],
                }, () => onGovern(city.id, selectedOfficerId))}
                aria-describedby="civic-command-guidance"
                title={displayedGovernAvailability.allowed
                  ? `提高防灾，消耗金钱 ${GOVERN_MONEY_COST}、体力 ${GOVERN_STAMINA_COST}`
                  : displayedGovernAvailability.reason}
              >
                治理
              </button>
              <button
                type="button"
                className={focusedPrimaryClass()}
                hidden={!showCommand('inspect')}
                disabled={!isOwned || !displayedInspectAvailability.allowed}
                onClick={() => reviewCommand({
                  category: '内政',
                  title: '出巡',
                  city: city.name,
                  actor: selectedOfficer?.name,
                  effects: ['民忠提高 1～4', '人口最多增加 100'],
                  costs: [`金钱 ${INSPECT_MONEY_COST}`, `体力 ${INSPECT_STAMINA_COST}`, '占用执行武将本月行动'],
                  risks: ['民忠增量由当前确定性随机序列决定，并受城市上限约束。'],
                }, () => onInspect(city.id, selectedOfficerId))}
                aria-describedby="civic-command-guidance"
                title={displayedInspectAvailability.allowed
                  ? `提高民忠与人口，消耗金钱 ${INSPECT_MONEY_COST}、体力 ${INSPECT_STAMINA_COST}`
                  : displayedInspectAvailability.reason}
              >
                出巡
              </button>
              <button type="button" hidden={Boolean(initialCommand) || !showCommand('trade')} disabled={disabled} onClick={() => setActiveCivicCommand('trade')}>交易</button>
              <button type="button" hidden={Boolean(initialCommand) || !showCommand('banquet')} disabled={disabled} onClick={() => setActiveCivicCommand('banquet')}>宴请</button>
              <button
                type="button"
                className="danger-command"
                hidden={Boolean(initialCommand) || !showCommand('plunder')}
                disabled={disabled}
                onClick={() => setActiveCivicCommand('plunder')}
              >
                掠夺
              </button>
            </div>
            <div className="civic-command-guidance" id="civic-command-guidance" hidden={Boolean(initialCommand)}>
              <span>
                招商：
                {displayedCommerceAvailability.allowed
                  ? `商业预计 +${commerceGainRange[0]}～${commerceGainRange[1]}；${DEVELOP_MONEY_COST} 金、${DEVELOP_STAMINA_COST} 体力、占用本月行动。`
                  : `不可用——${displayedCommerceAvailability.reason}`}
              </span>
              <span>
                治理：
                {displayedGovernAvailability.allowed
                  ? `${(city.condition ?? 'normal') === 'normal' ? '' : '城池恢复正常，'}`
                    + `${governMaxGain > 0 ? `防灾最多 +${governMaxGain}` : '防灾已满，仅解除灾害'}；`
                    + `${GOVERN_MONEY_COST} 金、${GOVERN_STAMINA_COST} 体力、占用本月行动。`
                  : `不可用——${displayedGovernAvailability.reason}`}
              </span>
              <span>
                出巡：
                {displayedInspectAvailability.allowed
                  ? `民忠 +1～4、人口最多 +100；${INSPECT_MONEY_COST} 金、${INSPECT_STAMINA_COST} 体力、占用本月行动。`
                  : `不可用——${displayedInspectAvailability.reason}`}
              </span>
            </div>
            {activeCivicCommand === 'trade' && showCommand('trade') && (
              <div className="civic-command-card" aria-label="交易命令">
                <div className="section-title">
                  <strong>粮草交易</strong>
                  {!initialCommand && <button type="button" onClick={() => setActiveCivicCommand(null)}>关闭</button>}
                </div>
                <div className="trade-command-row">
                  <label className="command-field">
                    <span>方向</span>
                    <select value={tradeDirection} onChange={(event) => setTradeDirection(event.target.value as 'buy' | 'sell')}>
                      <option value="buy">买入（5 金 / 粮）</option>
                      <option value="sell">卖出（2 金 / 粮）</option>
                    </select>
                  </label>
                  <label className="command-field">
                    <span>数量（最多 {number.format(maxTradeAmount)}）</span>
                    <input
                      type="number"
                      min="1"
                      max={maxTradeAmount}
                      step="1"
                      value={tradeAmount}
                      onChange={(event) => setTradeAmount(event.target.value)}
                    />
                  </label>
                </div>
                <p className="command-hint" id="trade-command-hint">
                  {tradeAvailability.allowed
                    ? `${tradeDirection === 'buy' ? '粮草' : '金钱'} +${number.format(tradeDirection === 'buy' ? tradeValue : tradeMoneyDelta)}，`
                      + `${tradeDirection === 'buy' ? '金钱' : '粮草'} -${number.format(tradeDirection === 'buy' ? tradeMoneyDelta : tradeValue)}；`
                      + `${TRADE_STAMINA_COST} 体力并占用本月行动。`
                    : `不可交易——${tradeAvailability.reason}`}
                </p>
                <button
                  type="button"
                  className={focusedPrimaryClass()}
                  disabled={disabled || !tradeAvailability.allowed}
                  aria-describedby="trade-command-hint"
                  onClick={() => reviewCommand({
                    category: '内政',
                    title: tradeDirection === 'buy' ? '买入粮草' : '卖出粮草',
                    city: city.name,
                    actor: selectedOfficer?.name,
                    target: `${number.format(tradeValue)} 粮`,
                    effects: [
                      tradeDirection === 'buy'
                        ? `粮草增加 ${number.format(tradeValue)}`
                        : `金钱增加 ${number.format(tradeMoneyDelta)}`,
                    ],
                    costs: [
                      tradeDirection === 'buy'
                        ? `金钱 ${number.format(tradeMoneyDelta)}`
                        : `粮草 ${number.format(tradeValue)}`,
                      `体力 ${TRADE_STAMINA_COST}`,
                      '占用执行武将本月行动',
                    ],
                  }, () => {
                    onTrade(city.id, selectedOfficerId, tradeDirection, tradeValue);
                    if (!initialCommand) setActiveCivicCommand(null);
                  })}
                >
                  确认交易
                </button>
              </div>
            )}
            {activeCivicCommand === 'banquet' && showCommand('banquet') && (
              <div className="civic-command-card" aria-label="宴请命令">
                <div className="section-title">
                  <strong>宴请所选武将</strong>
                  {!initialCommand && <button type="button" onClick={() => setActiveCivicCommand(null)}>关闭</button>}
                </div>
                <p className="command-hint" id="banquet-command-hint">
                  {banquetAvailability.allowed
                    ? `${selectedOfficer!.name}体力最多 +${BANQUET_STAMINA_RECOVERY}`
                      + `${state.factions[selectedOfficer!.factionId]?.rulerOfficerId === selectedOfficer!.id ? '' : '、忠诚 +1'}；`
                      + `花费 ${BANQUET_MONEY_COST} 金，不占用也不重置本月行动。`
                    : `不可宴请——${banquetAvailability.reason}`}
                </p>
                <button
                  type="button"
                  className={focusedPrimaryClass()}
                  disabled={disabled || !banquetAvailability.allowed}
                  aria-describedby="banquet-command-hint"
                  onClick={() => reviewCommand({
                    category: '人事',
                    title: '宴请',
                    city: city.name,
                    actor: selectedOfficer?.name,
                    target: selectedOfficer?.name,
                    effects: [
                      `体力最多恢复 ${BANQUET_STAMINA_RECOVERY}`,
                      state.factions[selectedOfficer!.factionId]?.rulerOfficerId === selectedOfficer!.id
                        ? '君主忠诚不变'
                        : '忠诚提高 1',
                    ],
                    costs: [`金钱 ${BANQUET_MONEY_COST}`, '不占用本月行动'],
                  }, () => {
                    onBanquet(city.id, selectedOfficerId);
                    if (!initialCommand) setActiveCivicCommand(null);
                  })}
                >
                  确认宴请
                </button>
              </div>
            )}
            {activeCivicCommand === 'plunder' && showCommand('plunder') && (
              <div className="civic-command-card danger-card" role="alert" aria-label="掠夺确认">
                <div className="section-title">
                  <strong>危险：确认掠夺</strong>
                  {!initialCommand && <button type="button" onClick={() => setActiveCivicCommand(null)}>关闭</button>}
                </div>
                <p>
                  民忠 {city.publicLoyalty ?? 70} → {Math.floor((city.publicLoyalty ?? 70) / 2)}；
                  农业 {number.format(city.farming)} → {number.format(Math.floor(city.farming / 2))}；
                  商业 {number.format(city.commerce)} → {number.format(Math.floor(city.commerce / 2))}。
                </p>
                <p className="command-hint" id="plunder-command-hint">
                  {plunderAvailability.allowed
                    ? `获得 ${number.format(plunderGains.money)} 金、${number.format(plunderGains.food)} 粮；`
                      + `${PLUNDER_STAMINA_COST} 体力并占用本月行动。此操作不可撤销。`
                    : `不可掠夺——${plunderAvailability.reason}`}
                </p>
                <button
                  type="button"
                  className={focusedPrimaryClass('danger-command')}
                  disabled={disabled || !plunderAvailability.allowed}
                  aria-describedby="plunder-command-hint"
                  onClick={() => reviewCommand({
                    category: '内政',
                    title: '掠夺',
                    city: city.name,
                    actor: selectedOfficer?.name,
                    effects: [
                      `获得 ${number.format(plunderGains.money)} 金`,
                      `获得 ${number.format(plunderGains.food)} 粮`,
                    ],
                    costs: [`体力 ${PLUNDER_STAMINA_COST}`, '占用执行武将本月行动'],
                    risks: [
                      `民忠降至 ${Math.floor((city.publicLoyalty ?? 70) / 2)}`,
                      `农业降至 ${number.format(Math.floor(city.farming / 2))}`,
                      `商业降至 ${number.format(Math.floor(city.commerce / 2))}`,
                      '执行后不可撤销。',
                    ],
                    dangerous: true,
                    confirmLabel: '确认掠夺',
                  }, () => {
                    onPlunder(city.id, selectedOfficerId);
                    if (!initialCommand) setActiveCivicCommand(null);
                  })}
                >
                  确认掠夺
                </button>
              </div>
            )}

            </section>
            <section
              className="city-command-section"
              hidden={initialCommand
                ? !showCommand('recruit-officer', 'reward', 'move', 'transport', 'appoint', 'banish', 'item', 'captive')
                : activeSection !== 'personnel'}
            >
            <p className="command-group-title" id="city-command-personnel">人事</p>
            {discoveredFreeOfficers.length > 0 && (
              <div className="recruit-command-row" hidden={!showCommand('recruit-officer')}>
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
                  className={focusedPrimaryClass()}
                  disabled={disabled || !canRecruitOfficer}
                  onClick={() => reviewCommand({
                    category: '人事',
                    title: '登用人才',
                    city: city.name,
                    actor: selectedOfficer?.name,
                    target: selectedRecruitTarget?.name,
                    effects: [`尝试让${selectedRecruitTarget?.name ?? '目标人才'}加入${faction?.name ?? '己方势力'}`],
                    costs: [`体力 ${RECRUIT_OFFICER_STAMINA_COST}`, '占用执行武将本月行动'],
                    risks: ['结果受执行武将智力与确定性随机序列影响；失败后人才仍保持已发现状态。'],
                  }, () => onRecruitOfficer(city.id, selectedOfficerId, selectedRecruitTargetId))}
                  title={`消耗执行武将体力 ${RECRUIT_OFFICER_STAMINA_COST}`}
                >
                  登用
                </button>
              </div>
            )}
            <div className="personnel-command-row" hidden={!showCommand('move', 'transport', 'appoint')}>
              <label className="command-field" hidden={!showCommand('move', 'transport')}>
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
                className={focusedPrimaryClass()}
                hidden={!showCommand('move')}
                disabled={disabled || !canMove}
                onClick={() => reviewCommand({
                  category: '人事',
                  title: '调动武将',
                  city: city.name,
                  actor: selectedOfficer?.name,
                  target: selectedMoveTarget?.city.name,
                  effects: [`${selectedOfficer?.name ?? '所选武将'}将在 ${selectedMoveTarget?.durationMonths ?? '?'} 个月后抵达目标城市`],
                  costs: [`体力 ${MOVE_STAMINA_COST}`, '占用执行武将本月行动'],
                  risks: [city.satrapOfficerId === selectedOfficerId ? '太守离城后将按当前规则自动补位。' : '调动期间武将不在城中。'],
                }, () => onMove(city.id, selectedMoveTargetId, selectedOfficerId))}
                aria-describedby={!displayedMoveAvailability.allowed ? 'move-command-hint' : undefined}
                title={displayedMoveAvailability.allowed
                  ? `消耗体力 ${MOVE_STAMINA_COST}，预计 ${displayedMoveAvailability.durationMonths} 个月`
                  : displayedMoveAvailability.reason}
              >
                启程
              </button>
              <button
                type="button"
                className={focusedPrimaryClass()}
                hidden={!showCommand('appoint')}
                disabled={disabled || !canAppoint}
                onClick={() => reviewCommand({
                  category: '人事',
                  title: '任命太守',
                  city: city.name,
                  actor: state.officers[state.factions[state.playerFactionId].rulerOfficerId]?.name,
                  target: selectedOfficer?.name,
                  effects: [`${selectedOfficer?.name ?? '所选武将'}成为${city.name}太守`],
                  costs: ['不消耗金钱、体力或本月行动'],
                }, () => onAppoint(city.id, selectedOfficerId))}
                title={state.rulesetId === 'baye-classic-v1'
                  ? '经典校准规则由君主或城内智力最高者自动担任太守'
                  : '任命所选武将为太守'}
              >
                任太守
              </button>
            </div>
            {!displayedMoveAvailability.allowed && showCommand('move') && (
              <p className="command-hint" id="move-command-hint">
                暂不可调动：{displayedMoveAvailability.reason}
              </p>
            )}
            <div className="transport-command-card" hidden={!showCommand('transport')}>
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
                className={focusedPrimaryClass()}
                disabled={!canTransport}
                aria-describedby={!displayedTransportAvailability.allowed
                  ? 'transport-command-risk transport-command-hint'
                  : 'transport-command-risk'}
                onClick={() => reviewCommand({
                  category: '军事',
                  title: '输送物资',
                  city: city.name,
                  actor: selectedOfficer?.name,
                  target: selectedMoveTarget?.city.name,
                  effects: [
                    `输送金钱 ${number.format(transportCargo.money)}`,
                    `输送粮草 ${number.format(transportCargo.food)}`,
                    `输送后备兵 ${number.format(transportCargo.reserveTroops)}`,
                  ],
                  costs: [`体力 ${TRANSPORT_STAMINA_COST}`, '占用执行武将本月行动'],
                  risks: [
                    `预计 ${selectedMoveTarget?.durationMonths ?? '?'} 个月完成，成功率 79%。`,
                    '失败时本批物资全部损失，执行者仍会返回出发城。',
                  ],
                }, () => {
                  if (onTransport(city.id, selectedMoveTargetId, selectedOfficerId, transportCargo)) {
                    setTransportMoney('0');
                    setTransportFood('0');
                    setTransportReserveTroops('0');
                  }
                })}
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
              className={focusedPrimaryClass('reward-command')}
              hidden={!showCommand('reward')}
              disabled={disabled || !canReward}
              onClick={() => reviewCommand({
                category: '人事',
                title: '奖赏武将',
                city: city.name,
                actor: state.officers[state.factions[state.playerFactionId].rulerOfficerId]?.name,
                target: selectedOfficer?.name,
                effects: [`忠诚 ${selectedOfficer?.loyalty ?? 0} → ${Math.min(100, (selectedOfficer?.loyalty ?? 0) + REWARD_LOYALTY_GAIN)}`],
                costs: [`金钱 ${REWARD_MONEY_COST}`, '不占用武将本月行动'],
              }, () => onReward(city.id, selectedOfficerId))}
              title={(selectedOfficer?.loyalty ?? 0) >= 100
                ? '该武将忠诚已经达到上限'
                : `消耗城中金钱 ${REWARD_MONEY_COST}，不占用武将本月行动`}
            >
              奖赏所选武将（{REWARD_MONEY_COST} 金）
            </button>
            <button
              type="button"
              className={focusedPrimaryClass('danger-command')}
              hidden={!showCommand('banish')}
              disabled={disabled || !isOwned || !selectedOfficer
                || selectedOfficer.id === state.factions[state.playerFactionId].rulerOfficerId}
              onClick={() => {
                if (!selectedOfficer) return;
                reviewCommand({
                  category: '人事',
                  title: '流放武将',
                  city: city.name,
                  target: selectedOfficer.name,
                  effects: [`${selectedOfficer.name}离开当前势力并随机流落到一座城市`],
                  costs: ['不消耗本月行动'],
                  risks: ['兵力清零；所携装备保留；进行中的相关命令会被取消。', '执行后不可撤销。'],
                  dangerous: true,
                  confirmLabel: `确认流放${selectedOfficer.name}`,
                }, () => onBanishOfficer(city.id, selectedOfficer.id));
              }}
              title={selectedOfficer?.id === state.factions[state.playerFactionId].rulerOfficerId
                ? '不能流放当前君主'
                : '流放会清空兵力并让人物成为在野，装备随身保留'}
            >
              流放所选武将
            </button>
            <div className="item-command-row" hidden={!showCommand('item')}>
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
                className={focusedPrimaryClass()}
                disabled={disabled || !canGiveItem}
                onClick={() => reviewCommand({
                  category: '人事',
                  title: '赏赐道具',
                  city: city.name,
                  actor: state.officers[state.factions[state.playerFactionId].rulerOfficerId]?.name,
                  target: `${selectedOfficer?.name ?? '所选武将'} · ${selectedItem?.name ?? '所选道具'}`,
                  effects: [
                    selectedItem ? describeItem(selectedItem) : '应用道具效果',
                    selectedOfficer?.id === state.factions[state.playerFactionId].rulerOfficerId
                      ? '君主忠诚不变'
                      : `忠诚提高 ${REWARD_LOYALTY_GAIN}`,
                  ],
                  costs: ['道具从城中移交给目标武将', '不占用本月行动'],
                }, () => onGiveItem(city.id, selectedOfficerId, selectedItemId))}
                title={disabled
                  ? '当前有待处理操作，暂时不能执行城池命令'
                  : itemAvailability.allowed
                    ? '原版道具赏赐：非君主忠诚 +8，不占用月行动'
                    : itemAvailability.reason}
              >
                赏赐道具
              </button>
            </div>
            {isOwned && !itemAvailability.allowed && showCommand('item') && (
              <p className="command-hint">暂不可赏赐：{itemAvailability.reason}</p>
            )}
            {selectedEquipmentIds.length > 0 && showCommand('item') && (
              <div className="equipment-actions" aria-label="所选武将装备">
                {selectedEquipmentIds.map((itemId) => (
                  <button
                    type="button"
                    key={itemId}
                    disabled={disabled || !isOwned}
                    onClick={() => {
                      if (!selectedOfficer) return;
                      const isRuler = selectedOfficer.id === state.factions[state.playerFactionId].rulerOfficerId;
                      const item = state.items[itemId];
                      reviewCommand({
                        category: '人事',
                        title: isRuler ? '卸下装备' : '没收装备',
                        city: city.name,
                        target: `${selectedOfficer.name} · ${item.name}`,
                        effects: [`${item.name}收入${city.name}`],
                        costs: ['不占用本月行动'],
                        risks: isRuler
                          ? ['君主忠诚不受影响。']
                          : [`${selectedOfficer.name}忠诚降低 20。`, '执行后不可撤销。'],
                        dangerous: !isRuler,
                        confirmLabel: isRuler ? `确认卸下${item.name}` : `确认没收${item.name}`,
                      }, () => {
                        if (isRuler) onUnequipItem(city.id, selectedOfficerId, itemId);
                        else onConfiscateItem(city.id, selectedOfficerId, itemId);
                      });
                    }}
                  >
                    {selectedOfficer?.id === state.factions[state.playerFactionId].rulerOfficerId ? '卸下' : '没收'}{' '}
                    {state.items[itemId].name}
                  </button>
                ))}
              </div>
            )}
            {captives.length > 0 && showCommand('captive') && (
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
                <div className={`city-command-buttons ${initialCommand === 'captive' ? 'focused-action-cluster' : ''}`}>
                  <button
                    type="button"
                    disabled={disabled || !canRecruitCaptive}
                    onClick={() => selectedCaptive && reviewCommand({
                      category: '人事',
                      title: '招降俘虏',
                      city: city.name,
                      actor: selectedOfficer?.name,
                      target: selectedCaptive.name,
                      effects: [`尝试让${selectedCaptive.name}加入${faction?.name ?? '己方势力'}`],
                      costs: [`金钱 ${surrenderCost.money}`, `体力 ${SURRENDER_STAMINA_COST}`, '占用执行武将本月行动'],
                      risks: ['结果受双方智力、俘虏忠诚和确定性随机序列影响；失败会削弱俘虏忠诚。'],
                    }, () => onRecruitCaptive(city.id, selectedOfficerId, selectedCaptive.id))}
                    title={captiveRecruitReason}
                    aria-describedby="captive-recruit-hint"
                  >
                    招降
                  </button>
                  <button
                    type="button"
                    disabled={disabled || !isOwned || !selectedCaptive}
                    onClick={() => selectedCaptive && reviewCommand({
                      category: '人事',
                      title: '释放俘虏',
                      city: city.name,
                      target: selectedCaptive.name,
                      effects: [`${selectedCaptive.name}成为${city.name}已发现的在野人物`],
                      costs: ['不消耗金钱、体力或本月行动'],
                      risks: ['兵力清零；人物不再受当前势力羁押。'],
                      confirmLabel: `确认释放${selectedCaptive.name}`,
                    }, () => onReleaseCaptive(city.id, selectedCaptive.id))}
                    title="现代化人道选项：不消耗行动，俘虏转为本城在野人物"
                  >
                    释放
                  </button>
                  <button
                    type="button"
                    disabled={disabled || !isOwned || !selectedCaptive}
                    onClick={() => {
                      if (!selectedCaptive) return;
                      reviewCommand({
                        category: '人事',
                        title: '流放俘虏',
                        city: city.name,
                        target: selectedCaptive.name,
                        effects: [`${selectedCaptive.name}成为在野人物并随机流落到一座城市`],
                        costs: ['不消耗本月行动'],
                        risks: ['兵力清零；装备随身保留；执行后不可撤销。'],
                        dangerous: true,
                        confirmLabel: `确认流放${selectedCaptive.name}`,
                      }, () => onBanishOfficer(city.id, selectedCaptive.id));
                    }}
                    title="流放后成为在野人物，装备随身保留"
                  >
                    流放
                  </button>
                  <button
                    type="button"
                    className="danger-command"
                    disabled={disabled || !isOwned || !selectedCaptive}
                    onClick={() => {
                      if (!selectedCaptive) return;
                      const equipment = getOfficerEquipmentIds(selectedCaptive)
                        .map((itemId) => state.items[itemId]?.name)
                        .filter(Boolean)
                        .join('、');
                      reviewCommand({
                        category: '人事',
                        title: '处斩俘虏',
                        city: city.name,
                        target: selectedCaptive.name,
                        effects: [equipment ? `装备（${equipment}）收入${city.name}` : '没有装备需要回收'],
                        costs: ['不消耗本月行动'],
                        risks: [`${selectedCaptive.name}永久死亡。`, '此操作不可撤销。'],
                        dangerous: true,
                        confirmLabel: `确认处斩${selectedCaptive.name}`,
                      }, () => onExecuteCaptive(city.id, selectedCaptive.id));
                    }}
                    title="不可逆：人物死亡，全部装备收入本城"
                  >
                    处斩
                  </button>
                </div>
                {(disabled || !canRecruitCaptive) && (
                  <p className="command-hint" id="captive-recruit-hint">暂不可招降：{captiveRecruitReason}</p>
                )}
              </div>
            )}

            </section>
            <section
              className="city-command-section"
              hidden={initialCommand ? !showCommand('diplomacy') : activeSection !== 'intrigue'}
            >
            <p className="command-group-title" id="city-command-intrigue">谋略</p>
            <div className="diplomacy-command-card">
              <label className="command-field">
                <span>谋略类型</span>
                <select
                  value={selectedDiplomacyKind}
                  onChange={(event) => setSelectedDiplomacyKind(event.target.value as DiplomaticOrderKind)}
                >
                  <option value="alienate">离间 · 降低敌将忠诚</option>
                  <option value="canvass">招揽 · 争取敌方普通武将</option>
                  <option value="counterespionage">策反 · 促使敌方太守自立</option>
                  <option value="induce">劝降 · 接收弱小敌对势力</option>
                </select>
              </label>
              <label className="command-field">
                <span>本月侦察确认的目标</span>
                <select
                  value={selectedDiplomacyTargetId}
                  onChange={(event) => setSelectedDiplomacyTargetId(event.target.value)}
                  disabled={diplomacyTargets.length === 0}
                >
                  {diplomacyTargets.length === 0 && <option value="">暂无本月情报支持的合法目标</option>}
                  {diplomacyTargets.map((target) => (
                    <option value={target.id} key={target.id}>
                      {target.name}
                      {' · '}
                      {state.factions[target.factionId]?.name ?? '未知势力'}
                      {' · '}
                      {target.cityId ? state.cities[target.cityId]?.name : '行踪不明'}
                    </option>
                  ))}
                </select>
              </label>
              <p className="command-hint" id="diplomacy-command-hint">
                {displayedDiplomacyAvailability.allowed
                  ? `耗时 1 个月，消耗 ${DIPLOMACY_MONEY_COST} 金、${DIPLOMACY_STAMINA_COST} 体力和本月行动；${diplomacyFactors(selectedDiplomacyKind)}`
                  : `暂不可执行：${displayedDiplomacyAvailability.reason}`}
                {' '}
                不显示精确成功率；旧情报不能继续锁定人物。
              </p>
              <button
                type="button"
                className={focusedPrimaryClass()}
                disabled={!displayedDiplomacyAvailability.allowed}
                aria-describedby="diplomacy-command-hint"
                onClick={() => reviewCommand({
                  category: '谋略',
                  title: diplomacyLabel(selectedDiplomacyKind),
                  city: city.name,
                  actor: selectedOfficer?.name,
                  target: selectedDiplomacyTarget?.name,
                  effects: [`发起为期 1 个月的${diplomacyLabel(selectedDiplomacyKind)}行动`],
                  costs: [`金钱 ${DIPLOMACY_MONEY_COST}`, `体力 ${DIPLOMACY_STAMINA_COST}`, '占用执行武将本月行动'],
                  risks: [diplomacyFactors(selectedDiplomacyKind), '不展示精确成功率；结果将在命令到期时结算。'],
                }, () => onDiplomacy(
                  selectedDiplomacyKind,
                  city.id,
                  selectedOfficerId,
                  selectedDiplomacyTargetId,
                ))}
              >
                发起{diplomacyLabel(selectedDiplomacyKind)}
              </button>
            </div>

            </section>
            <section
              className="city-command-section"
              hidden={initialCommand ? !showCommand('distribute', 'recon', 'attack') : activeSection !== 'military'}
            >
            <p className="command-group-title" id="city-command-military">军事</p>
            <div className="recon-command-row" hidden={!showCommand('recon')}>
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
                className={focusedPrimaryClass()}
                disabled={!displayedReconAvailability.allowed}
                onClick={() => reviewCommand({
                  category: '军事',
                  title: '侦察',
                  city: city.name,
                  actor: selectedOfficer?.name,
                  target: selectedReconTarget?.name,
                  effects: [`获取${selectedReconTarget?.name ?? '目标城市'}当前情报快照`],
                  costs: [`金钱 ${RECON_MONEY_COST}`, `体力 ${RECON_STAMINA_COST}`, '占用执行武将本月行动'],
                  risks: ['情报是执行时快照，后续变化不会自动更新。'],
                }, () => onRecon(city.id, selectedReconTargetId, selectedOfficerId))}
                title={displayedReconAvailability.allowed
                  ? `获取敌城情报快照，消耗 ${RECON_MONEY_COST} 金、${RECON_STAMINA_COST} 体力和本月行动`
                  : displayedReconAvailability.reason}
              >
                侦察
              </button>
            </div>
            {!displayedReconAvailability.allowed && showCommand('recon') && (
              <p className="command-hint">暂不可侦察：{displayedReconAvailability.reason}</p>
            )}
            <div className="distribution-row" hidden={!showCommand('distribute')}>
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
                className={focusedPrimaryClass()}
                disabled={disabled || !canDistribute}
                onClick={() => reviewCommand({
                  category: '军事',
                  title: '分配兵力',
                  city: city.name,
                  actor: selectedOfficer?.name,
                  target: `${number.format(selectedOfficer?.troops ?? 0)} → ${number.format(distributionValue)} 兵`,
                  effects: [
                    `${selectedOfficer?.name ?? '所选武将'}兵力${distributionDelta > 0 ? '增加' : '减少'} ${number.format(Math.abs(distributionDelta))}`,
                    `城中后备兵变为 ${number.format(city.reserveTroops - distributionDelta)}`,
                  ],
                  costs: ['占用执行武将本月行动', '不消耗金钱或体力'],
                }, () => onDistribute(city.id, selectedOfficerId, distributionValue))}
              >
                分配
              </button>
            </div>

            <div className="attack-command-composer" hidden={!showCommand('attack')}>
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
              className={focusedPrimaryClass('attack-command')}
              disabled={disabled || !canAttack}
              onClick={() => reviewCommand({
                category: '军事',
                title: '筹划出征',
                city: city.name,
                actor: selectedAttackerIds.map((officerId) => state.officers[officerId]?.name).filter(Boolean).join('、'),
                target: selectedAttackTarget?.name,
                effects: [
                  `${selectedAttackerIds.length} 名武将、${number.format(selectedAttackerIds.reduce((sum, officerId) => sum + (state.officers[officerId]?.troops ?? 0), 0))} 兵出征`,
                  '确认后仍可选择亲自指挥或快速结算',
                ],
                costs: [`携带粮草 ${number.format(provisionValue)}`, '参战武将将按战斗结果消耗行动与状态'],
                risks: ['胜负、伤亡、俘虏与城池归属由所选战斗方式和当前规则决定。'],
              }, () => onAttack(city.id, selectedTargetId, selectedAttackerIds, provisionValue))}
            >
              筹划出征
            </button>
            </div>
            </section>
          </>
        ) : (
          <p className="command-hint">
            {isOwned ? '城中没有可下令的己方武将。' : '选择一座己方城池即可执行经营、征兵与出征。'}
          </p>
        )}
      </div>

      {pendingCommandReview && (
        <CommandReviewDialog
          review={pendingCommandReview}
          onCancel={() => setPendingCommandReview(undefined)}
          onConfirm={confirmReviewedCommand}
        />
      )}
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

function CommandEditorSummary({ summary }: { summary: InlineCommandSummary }) {
  return (
    <section className={`command-editor-summary ${summary.unavailableReason ? 'unavailable' : ''}`} aria-live="polite">
      <div>
        <strong>预期效果</strong>
        <ul>{summary.effects.map((effect) => <li key={effect}>{effect}</li>)}</ul>
      </div>
      <div>
        <strong>消耗</strong>
        <ul>{summary.costs.map((cost) => <li key={cost}>{cost}</li>)}</ul>
      </div>
      {summary.risks && summary.risks.length > 0 && (
        <p>{summary.risks.join('；')}</p>
      )}
      {summary.unavailableReason && (
        <p className="command-editor-unavailable">暂不可执行：{summary.unavailableReason}</p>
      )}
    </section>
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

function diplomacyLabel(kind: DiplomaticOrderKind): string {
  return {
    alienate: '离间',
    canvass: '招揽',
    counterespionage: '策反',
    induce: '劝降',
  }[kind];
}

function diplomacyFactors(kind: DiplomaticOrderKind): string {
  return kind === 'induce'
    ? '结果受双方智力、目标性格与势力城池差距影响。'
    : '结果受双方智力、目标忠诚与性格影响。';
}

function intelValue(isCurrent: boolean, current: number, observed: number | undefined): string {
  return isCurrent ? number.format(current) : observed === undefined ? '未知' : number.format(observed);
}
