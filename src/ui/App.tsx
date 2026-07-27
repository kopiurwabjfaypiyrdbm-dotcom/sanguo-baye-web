import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { applyBattleResult, executeAttack, type AttackOrder } from '../core/battle';
import {
  banquetOfficer,
  developCommerce,
  developFarming,
  distributeTroops,
  governCity,
  inspectCity,
  plunderCity,
  recruitTroops,
  tradeFood,
} from '../core/cityCommands';
import { createSampleState } from '../core/sampleState';
import { recruitCaptive, releaseCaptive } from '../core/captiveCommands';
import { reconnoitreCity } from '../core/reconnaissance';
import {
  appointSatrap,
  giveItemToOfficer,
  moveOfficer,
  recruitFreeOfficer,
  rewardOfficer,
  searchCity,
  unequipOfficerItem,
} from '../core/personnelCommands';
import { parseSave, serializeSave } from '../core/saveGame';
import {
  deleteBattleCheckpoint,
  loadFromSlot,
  saveToSlot,
  slotKey,
  type SaveSlotId,
} from '../core/saveStorage';
import {
  loadBattleRecovery,
  saveCommittedBattleRecovery,
  savePendingBattleRecovery,
} from '../core/battleRecovery';
import {
  advanceTurnUntilPlayerDefense,
  continueTurnUntilPlayerDefense,
  type InteractiveTurnProgress,
} from '../core/turn';
import { summarizeMonth } from '../core/monthSummary';
import type { GameState, LifecyclePolicy } from '../core/types';
import {
  attackTacticalUnit,
  createTacticalBattle,
  createTacticalBattleResult,
  endTacticalSide,
  getAttackableUnitIds,
  getReachableTiles,
  previewTacticalAttack,
  moveTacticalUnit,
  runBasicTacticalAi,
  retreatTacticalSide,
  useTacticalSkill,
  waitTacticalUnit,
  type TacticalBattleState,
  type TacticalPosition,
  type TacticalSkillId,
} from '../core/tacticalBattle';
import {
  createBundledScenario,
  getScenarioOptions,
  getScenarioRulers,
  type BundledPeriodId,
} from '../data/bundledScenarios';
import { createGameBridge } from '../game/events';
import { createStrategyMap, type StrategyMapController } from '../game/createGame';
import { RulerScreen, ScenarioScreen, TitleScreen } from './CampaignSetup';
import { CityPanel } from './CityPanel';
import { TacticalBattleScreen } from './TacticalBattleScreen';
import { getFactionStrategicOrders, issueTransportOrder } from '../core/strategicOrders';
import { getFactionDiplomaticOrders, issueDiplomaticOrder } from '../core/diplomaticOrders';
import {
  SAFE_LIFECYCLE_POLICY,
  banishOfficer,
  configureLifecyclePolicy,
  confiscateOfficerEquipment,
  executeCaptive,
  resolveSuccession,
} from '../core/officerLifecycle';
import {
  DEFAULT_NEW_CAMPAIGN_RULESET,
  getCampaignRuleset,
  type CampaignRulesetId,
} from '../core/rulesets';

type AppScreen = 'title' | 'scenario' | 'ruler' | 'game' | 'battle';
const scenarioOptions = getScenarioOptions();

export function App() {
  const initialGame = useMemo(loadInitialGame, []);
  const [state, setState] = useState<GameState>(initialGame.state);
  const [screen, setScreen] = useState<AppScreen>('title');
  const [hasContinue, setHasContinue] = useState(initialGame.hasAutoSave);
  const [selectedPeriod, setSelectedPeriod] = useState<BundledPeriodId>(1);
  const [selectedRulerIndex, setSelectedRulerIndex] = useState(() => getScenarioRulers(1)[0].sourceIndex);
  const [selectedLifecyclePolicy, setSelectedLifecyclePolicy] = useState<LifecyclePolicy>({
    ...SAFE_LIFECYCLE_POLICY,
  });
  const [selectedRulesetId, setSelectedRulesetId] = useState<CampaignRulesetId>(DEFAULT_NEW_CAMPAIGN_RULESET);
  const [selectedCityId, setSelectedCityId] = useState(() => firstOwnedCityId(initialGame.state));
  const [isCityPanelOpen, setIsCityPanelOpen] = useState(false);
  const [sourceLabel, setSourceLabel] = useState(initialGame.sourceLabel);
  const [selectedSaveSlot, setSelectedSaveSlot] = useState<Exclude<SaveSlotId, 'auto'>>('1');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string }>();
  const [monthSummary, setMonthSummary] = useState<string[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [pendingAttack, setPendingAttack] = useState<AttackOrder>();
  const [tacticalBattle, setTacticalBattle] = useState<TacticalBattleState>();
  const [selectedTacticalUnitId, setSelectedTacticalUnitId] = useState<string>();
  const [pendingTacticalTargetId, setPendingTacticalTargetId] = useState<string>();
  const [aiResumeFactionIndex, setAiResumeFactionIndex] = useState<number>();
  const mapHost = useRef<HTMLDivElement>(null);
  const mapController = useRef<StrategyMapController | null>(null);
  const aiTurnLogStart = useRef(0);
  const bridge = useMemo(() => createGameBridge(), []);
  const tacticalReachable = useMemo(() => {
    if (!tacticalBattle || !selectedTacticalUnitId || tacticalBattle.status !== 'ongoing') return [];
    try {
      return getReachableTiles(tacticalBattle, selectedTacticalUnitId);
    } catch {
      return [];
    }
  }, [tacticalBattle, selectedTacticalUnitId]);
  const tacticalAttackable = useMemo(() => {
    if (!tacticalBattle || !selectedTacticalUnitId || tacticalBattle.status !== 'ongoing') return [];
    try {
      return getAttackableUnitIds(tacticalBattle, selectedTacticalUnitId);
    } catch {
      return [];
    }
  }, [tacticalBattle, selectedTacticalUnitId]);
  const playerStrategicOrders = useMemo(
    () => getFactionStrategicOrders(state, state.playerFactionId),
    [state],
  );
  const playerDiplomaticOrders = useMemo(
    () => getFactionDiplomaticOrders(state, state.playerFactionId),
    [state],
  );

  useEffect(() => bridge.on('city:selected', ({ cityId }) => {
    setSelectedCityId(cityId);
    setIsCityPanelOpen(true);
  }), [bridge]);

  useEffect(() => {
    if (screen !== 'game' || !isCityPanelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsCityPanelOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isCityPanelOpen, screen]);

  useEffect(() => {
    if (screen !== 'game' || !mapHost.current) return;
    mapController.current = createStrategyMap(mapHost.current, bridge, state, selectedCityId);
    return () => {
      mapController.current?.destroy();
      mapController.current = null;
    };
    // Phaser owns its canvas lifecycle; state updates flow through the controller below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, screen]);

  useEffect(() => {
    mapController.current?.update(state, selectedCityId);
  }, [state, selectedCityId]);

  useEffect(() => {
    if (screen !== 'game' || !state.campaignStarted) return;
    try {
      saveToSlot(window.localStorage, 'auto', state, `${sourceLabel} · 自动存档`);
      setHasContinue(true);
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? `自动存档失败：${error.message}` : '自动存档失败。' });
    }
  }, [screen, state, sourceLabel]);

  useEffect(() => {
    if (screen !== 'battle' || !tacticalBattle || tacticalBattle.status !== 'ongoing') return;
    const playerSide = tacticalBattle.attackerFactionId === state.playerFactionId ? 'attacker' : 'defender';
    if (tacticalBattle.activeSide === playerSide) return;
    setIsResolving(true);
    setFeedback({ kind: 'success', message: '敌方正在判断移动与攻击目标……' });
    const timer = window.setTimeout(() => {
      setTacticalBattle((current) => current ? runBasicTacticalAi(current) : current);
      setSelectedTacticalUnitId(undefined);
      setIsResolving(false);
      setFeedback({ kind: 'success', message: '敌方阶段结束。' });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [screen, state.playerFactionId, tacticalBattle]);

  function beginNewGame() {
    setFeedback(undefined);
    setScreen('scenario');
  }

  function chooseScenario(period: BundledPeriodId) {
    const rulers = getScenarioRulers(period);
    setSelectedPeriod(period);
    setSelectedRulerIndex(rulers[0].sourceIndex);
    setScreen('ruler');
  }

  function startCampaign() {
    const next = configureLifecyclePolicy(
      createBundledScenario(selectedPeriod, selectedRulerIndex, selectedRulesetId),
      selectedLifecyclePolicy,
    );
    const label = sourceLabelForState(next);
    setState(next);
    setSelectedCityId(firstOwnedCityId(next));
    setIsCityPanelOpen(false);
    setSourceLabel(label);
    setMonthSummary([]);
    try {
      clearBattleCheckpoint();
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `旧战斗恢复记录无法安全清理：${error instanceof Error ? error.message : '浏览器存储不可用'}。请修复存储后重试开局。`,
      });
      return;
    }
    try {
      saveToSlot(window.localStorage, 'auto', next, `${label} · 自动存档`);
      setHasContinue(true);
      setFeedback({ kind: 'success', message: `已选择${next.factions[next.playerFactionId].name}，霸业由此开始。` });
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `霸业已开始，但自动存档不可用：${error instanceof Error ? error.message : '浏览器存储不可用'}。`,
      });
    }
    setScreen('game');
  }

  function continueCampaign() {
    try {
      let recovery;
      try {
        recovery = loadBattleRecovery(window.localStorage);
      } catch {
        clearBattleCheckpointBestEffort();
      }
      if (recovery?.status === 'committed') {
        try {
          saveToSlot(window.localStorage, 'auto', recovery.state, recovery.label);
          clearBattleCheckpoint();
        } catch (error) {
          setHasContinue(true);
          setFeedback({
            kind: 'error',
            message: `战后恢复记录尚未安全清理：${error instanceof Error ? error.message : '浏览器存储不可用'}。请修复存储后重试。`,
          });
          return;
        }
        setState(recovery.state);
        setSelectedCityId(firstOwnedCityId(recovery.state));
        setIsCityPanelOpen(false);
        setSourceLabel(sourceLabelForState(recovery.state));
        setMonthSummary([]);
        setScreen('game');
        setFeedback({
          kind: 'success',
          message: recovery.label ? `已载入：${recovery.label}` : '已载入战后存档。',
        });
        return;
      }
      if (recovery?.status === 'pending') {
        const battle = createTacticalBattle(recovery.state, recovery.order);
        setState(recovery.state);
        setSelectedCityId(recovery.order.targetCityId);
        setIsCityPanelOpen(false);
        setSourceLabel(sourceLabelForState(recovery.state));
        setMonthSummary([]);
        setTacticalBattle(battle);
        setSelectedTacticalUnitId(undefined);
        setPendingTacticalTargetId(undefined);
        setAiResumeFactionIndex(
          recovery.resume.kind === 'ai-phase' ? recovery.resume.nextFactionIndex : undefined,
        );
        setScreen('battle');
        setFeedback({
          kind: 'success',
          message: `已从战前检查点重新展开${recovery.mode === 'ai-defense' ? '守城战' : '进攻战'}。`,
        });
        return;
      }
      const envelope = loadFromSlot(window.localStorage, 'auto');
      if (!envelope) throw new Error('尚无自动存档');
      applyLoadedState(envelope.state, envelope.label);
    } catch (error) {
      setHasContinue(false);
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '自动存档载入失败。' });
    }
  }

  function saveManualSlot() {
    try {
      const occupied = window.localStorage.getItem(slotKey(selectedSaveSlot)) !== null;
      if (occupied && !window.confirm(`槽位 ${selectedSaveSlot} 已有存档，确认覆盖吗？`)) return;
      saveToSlot(window.localStorage, selectedSaveSlot, state, `${sourceLabel} · 槽位 ${selectedSaveSlot}`);
      setFeedback({ kind: 'success', message: `已保存到槽位 ${selectedSaveSlot}。` });
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '保存失败。' });
    }
  }

  function loadManualSlot() {
    try {
      const envelope = loadFromSlot(window.localStorage, selectedSaveSlot);
      if (!envelope) throw new Error(`槽位 ${selectedSaveSlot} 为空`);
      applyLoadedState(envelope.state, envelope.label);
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '载入失败。' });
    }
  }

  function applyLoadedState(next: GameState, label?: string) {
    clearBattleCheckpoint();
    setState(next);
    setSelectedCityId(firstOwnedCityId(next));
    setIsCityPanelOpen(false);
    setSourceLabel(sourceLabelForState(next));
    setMonthSummary([]);
    setFeedback({ kind: 'success', message: label ? `已载入：${label}` : '存档已载入。' });
    setScreen('game');
  }

  function exportCurrentSave() {
    const content = serializeSave(state, sourceLabel);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sanguo-baye-${state.calendar.year}-${String(state.calendar.month).padStart(2, '0')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setFeedback({ kind: 'success', message: '当前战役存档已导出。' });
  }

  async function importSaveFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const envelope = parseSave(await file.text());
      applyLoadedState(envelope.state, envelope.label ?? file.name);
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? `导入失败：${error.message}` : '导入失败。' });
    } finally {
      event.target.value = '';
    }
  }

  function applyPlayerAction(
    transform: (current: GameState) => GameState,
    selectedAfter?: string | ((next: GameState) => string),
  ): boolean {
    try {
      const next = transform(state);
      setState(next);
      if (selectedAfter) {
        setSelectedCityId(typeof selectedAfter === 'function' ? selectedAfter(next) : selectedAfter);
      }
      setFeedback({ kind: 'success', message: next.logs.at(-1)?.message ?? '命令已执行。' });
      return true;
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '命令执行失败。' });
      return false;
    }
  }

  function requestAttack(order: AttackOrder) {
    setPendingAttack(order);
    setFeedback(undefined);
  }

  function resolvePendingAttackQuickly() {
    if (!pendingAttack) return;
    const order = pendingAttack;
    setPendingAttack(undefined);
    applyPlayerAction(
      (current) => executeAttack(current, order),
      (next) => next.cities[order.targetCityId].ownerId === next.playerFactionId
        ? order.targetCityId
        : order.sourceCityId,
    );
  }

  function beginManualBattle() {
    if (!pendingAttack) return;
    try {
      const battle = createTacticalBattle(state, pendingAttack);
      clearBattleCheckpoint();
      let recoveryWarning: string | undefined;
      try {
        savePendingBattleRecovery(
          window.localStorage,
          state,
          pendingAttack,
          { kind: 'player-phase' },
          `${sourceLabel} · 进攻战前检查点`,
        );
        setHasContinue(true);
      } catch (error) {
        recoveryWarning = error instanceof Error ? error.message : '浏览器存储不可用';
      }
      setTacticalBattle(battle);
      setSelectedTacticalUnitId(undefined);
      setPendingTacticalTargetId(undefined);
      setPendingAttack(undefined);
      setFeedback(recoveryWarning
        ? { kind: 'error', message: `战场已经展开，但刷新恢复不可用：${recoveryWarning}` }
        : { kind: 'success', message: '战场已经展开；刷新页面会从战前检查点重开。' });
      setScreen('battle');
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '无法进入战场。' });
      setPendingAttack(undefined);
    }
  }

  function selectTacticalUnit(unitId: string) {
    if (!tacticalBattle || tacticalBattle.status !== 'ongoing' || isResolving) return;
    const playerSide = tacticalBattle.attackerFactionId === state.playerFactionId ? 'attacker' : 'defender';
    const unit = tacticalBattle.units[unitId];
    if (!unit || unit.troops <= 0) return;
    if (unit.side === playerSide) {
      if (tacticalBattle.activeSide !== playerSide) {
        setFeedback({ kind: 'error', message: '敌方阶段尚未结束。' });
        return;
      }
      if (unit.acted) {
        setFeedback({ kind: 'error', message: `${unit.name}本阶段已经行动。` });
        return;
      }
      setSelectedTacticalUnitId(unitId);
      setPendingTacticalTargetId(undefined);
      setFeedback({ kind: 'success', message: `已选择${unit.name}。青色格可移动，红框单位可攻击。` });
      return;
    }
    if (!selectedTacticalUnitId) {
      setFeedback({ kind: 'error', message: '请先选择一个己方单位。' });
      return;
    }
    if (!tacticalAttackable.includes(unitId)) {
      setFeedback({ kind: 'error', message: '目标不在当前单位的攻击范围内。' });
      return;
    }
    setPendingTacticalTargetId(unitId);
    const preview = previewTacticalAttack(tacticalBattle, selectedTacticalUnitId, unitId);
    setFeedback({
      kind: 'success',
      message: `已锁定${unit.name}：预计损失 ${preview.damage}，确认后才会执行攻击。`,
    });
  }

  function confirmSelectedTacticalAttack() {
    if (!tacticalBattle || !selectedTacticalUnitId || !pendingTacticalTargetId || isResolving) return;
    try {
      const next = attackTacticalUnit(tacticalBattle, selectedTacticalUnitId, pendingTacticalTargetId);
      setTacticalBattle(next);
      setPendingTacticalTargetId(undefined);
      setFeedback({ kind: 'success', message: next.logs.at(-1) ?? '攻击完成。' });
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '攻击失败。' });
    }
  }

  function moveSelectedTacticalUnit(position: TacticalPosition) {
    if (!tacticalBattle || !selectedTacticalUnitId || isResolving) return;
    try {
      const next = moveTacticalUnit(tacticalBattle, selectedTacticalUnitId, position);
      setTacticalBattle(next);
      setPendingTacticalTargetId(undefined);
      setFeedback({ kind: 'success', message: next.logs.at(-1) ?? '移动完成。' });
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '移动失败。' });
    }
  }

  function waitSelectedTacticalUnit() {
    if (!tacticalBattle || !selectedTacticalUnitId || isResolving) return;
    try {
      const next = waitTacticalUnit(tacticalBattle, selectedTacticalUnitId);
      setTacticalBattle(next);
      setPendingTacticalTargetId(undefined);
      setFeedback({ kind: 'success', message: next.logs.at(-1) ?? '单位已待命。' });
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '待命失败。' });
    }
  }

  function useSelectedTacticalSkill(skillId: TacticalSkillId, targetUnitId: string) {
    if (!tacticalBattle || !selectedTacticalUnitId || isResolving) return;
    try {
      const next = useTacticalSkill(tacticalBattle, selectedTacticalUnitId, skillId, targetUnitId);
      setTacticalBattle(next);
      setPendingTacticalTargetId(undefined);
      setFeedback({ kind: 'success', message: next.logs.at(-1) ?? '计谋执行完成。' });
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '计谋执行失败。' });
    }
  }

  function endPlayerTacticalSide() {
    if (!tacticalBattle || isResolving) return;
    try {
      const next = endTacticalSide(tacticalBattle);
      setTacticalBattle(next);
      setSelectedTacticalUnitId(undefined);
      setPendingTacticalTargetId(undefined);
      setFeedback({ kind: 'success', message: next.logs.at(-1) ?? '本方阶段结束。' });
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '无法结束阶段。' });
    }
  }

  function retreatPlayerTacticalSide() {
    if (!tacticalBattle || isResolving) return;
    try {
      const playerSide = tacticalBattle.attackerFactionId === state.playerFactionId ? 'attacker' : 'defender';
      const next = retreatTacticalSide(tacticalBattle, playerSide);
      setTacticalBattle(next);
      setSelectedTacticalUnitId(undefined);
      setPendingTacticalTargetId(undefined);
      setFeedback({ kind: 'success', message: next.logs.at(-1) ?? '本方已经撤退。' });
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '无法撤退。' });
    }
  }

  function finishManualBattle() {
    if (!tacticalBattle || tacticalBattle.status === 'ongoing') return;
    try {
      const result = createTacticalBattleResult(tacticalBattle);
      let next = applyBattleResult(state, result);
      if (next.pendingSuccession && aiResumeFactionIndex !== undefined) {
        next = {
          ...next,
          pendingSuccession: {
            ...next.pendingSuccession,
            resumeAiFactionIndex: aiResumeFactionIndex,
          },
        };
      }
      if (aiResumeFactionIndex !== undefined && next.phase !== 'ended' && !next.pendingSuccession) {
        const progress = continueTurnUntilPlayerDefense(next, aiResumeFactionIndex);
        applyInteractiveTurnProgress(progress, tacticalBattle.id);
      } else {
        const persistenceError = finalizeBattleRecovery(tacticalBattle.id, next);
        if (persistenceError) {
          setFeedback({ kind: 'error', message: `战斗已结算，但持久化失败：${persistenceError}。请重试结算。` });
          return;
        }
        setTacticalBattle(undefined);
        setSelectedTacticalUnitId(undefined);
        setPendingTacticalTargetId(undefined);
        setAiResumeFactionIndex(undefined);
        setState(next);
        setSelectedCityId(next.cities[result.targetCityId].ownerId === next.playerFactionId
          ? result.targetCityId
          : result.sourceCityId);
        setScreen('game');
        setFeedback({ kind: 'success', message: result.logs.at(-1) ?? '战斗已经结算。' });
      }
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '战斗结算失败。' });
    }
  }

  function applyInteractiveTurnProgress(progress: InteractiveTurnProgress, completedBattleId?: string) {
    if (progress.pendingPlayerDefense) {
      try {
        savePendingBattleRecovery(
          window.localStorage,
          progress.state,
          progress.pendingPlayerDefense.order,
          { kind: 'ai-phase', nextFactionIndex: progress.pendingPlayerDefense.nextFactionIndex },
          `${sourceLabel} · 守城战前检查点`,
        );
      } catch (error) {
        setIsResolving(false);
        setFeedback({
          kind: 'error',
          message: `下一场守城战的恢复点写入失败：${error instanceof Error ? error.message : '浏览器存储不可用'}。请重试结算。`,
        });
        return;
      }
      const battle = createTacticalBattle(progress.state, progress.pendingPlayerDefense.order);
      setState(progress.state);
      setTacticalBattle(battle);
      setSelectedTacticalUnitId(undefined);
      setPendingTacticalTargetId(undefined);
      setAiResumeFactionIndex(progress.pendingPlayerDefense.nextFactionIndex);
      setScreen('battle');
      setIsResolving(false);
      setFeedback({
        kind: 'success',
        message: `${progress.state.factions[battle.attackerFactionId].name}来袭，请准备守城。`,
      });
      return;
    }

    const persistenceError = completedBattleId
      ? finalizeBattleRecovery(completedBattleId, progress.state)
      : undefined;
    if (persistenceError) {
      setIsResolving(false);
      setFeedback({ kind: 'error', message: `月份已推进，但战斗结果持久化失败：${persistenceError}。请重试结算。` });
      return;
    }
    if (!completedBattleId) clearBattleCheckpointBestEffort();
    setState(progress.state);
    setTacticalBattle(undefined);
    setSelectedTacticalUnitId(undefined);
    setPendingTacticalTargetId(undefined);
    setAiResumeFactionIndex(undefined);
    setMonthSummary(summarizeMonth(progress.state.logs.slice(aiTurnLogStart.current)));
    if (progress.state.cities[selectedCityId]?.ownerId !== progress.state.playerFactionId) {
      setSelectedCityId(firstOwnedCityId(progress.state));
    }
    setScreen('game');
    setIsResolving(false);
    setFeedback({
      kind: 'success',
      message: progress.state.phase === 'ended'
        ? progress.state.outcome === 'victory' ? '战役已经胜利。' : '战役已经失败。'
        : `已进入 ${progress.state.calendar.year} 年 ${progress.state.calendar.month} 月，武将体力与城池资源完成结算。`,
    });
  }

  function finalizeBattleRecovery(battleId: string, next: GameState): string | undefined {
    try {
      saveCommittedBattleRecovery(
        window.localStorage,
        battleId,
        next,
        `${sourceLabel} · 战后提交`,
      );
      saveToSlot(window.localStorage, 'auto', next, `${sourceLabel} · 自动存档`);
      clearBattleCheckpoint();
      setHasContinue(true);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : '浏览器存储不可用';
    }
  }

  async function endMonth() {
    if (isResolving) return;
    setIsResolving(true);
    setFeedback({ kind: 'success', message: '正在推演其他势力行动……' });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      aiTurnLogStart.current = state.logs.length;
      applyInteractiveTurnProgress(advanceTurnUntilPlayerDefense(state));
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '月度推进失败。' });
      setIsResolving(false);
    }
  }

  function chooseSuccessor(officerId: string) {
    try {
      const pending = state.pendingSuccession;
      const next = resolveSuccession(state, officerId);
      setState(next);
      setFeedback({ kind: 'success', message: next.logs.at(-1)?.message ?? '新君已经继位。' });
      if (pending?.resumePhase === 'ai' && pending.resumeAiFactionIndex !== undefined) {
        applyInteractiveTurnProgress(continueTurnUntilPlayerDefense(next, pending.resumeAiFactionIndex));
      }
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '无法完成君主继承。' });
    }
  }

  if (screen === 'battle' && tacticalBattle) {
    return (
      <TacticalBattleScreen
        campaign={state}
        battle={tacticalBattle}
        bridge={bridge}
        selectedUnitId={selectedTacticalUnitId}
        pendingTargetUnitId={pendingTacticalTargetId}
        reachable={tacticalReachable}
        attackableUnitIds={tacticalAttackable}
        feedback={feedback}
        isResolving={isResolving}
        onUnitSelected={selectTacticalUnit}
        onConfirmAttack={confirmSelectedTacticalAttack}
        onTileSelected={moveSelectedTacticalUnit}
        onWait={waitSelectedTacticalUnit}
        onUseSkill={useSelectedTacticalSkill}
        onEndSide={endPlayerTacticalSide}
        onRetreat={retreatPlayerTacticalSide}
        onFinish={finishManualBattle}
      />
    );
  }

  if (screen === 'title') {
    return (
      <TitleScreen
        hasContinue={hasContinue}
        hasPendingSuccession={Boolean(state.pendingSuccession)}
        onNewGame={beginNewGame}
        onContinue={continueCampaign}
      />
    );
  }

  if (screen === 'scenario') {
    return <ScenarioScreen scenarios={scenarioOptions} onSelect={chooseScenario} onBack={() => setScreen('title')} />;
  }

  if (screen === 'ruler') {
    const scenario = scenarioOptions.find((candidate) => candidate.period === selectedPeriod)!;
    return (
      <RulerScreen
        scenario={scenario}
        rulers={getScenarioRulers(selectedPeriod)}
        selectedRulerIndex={selectedRulerIndex}
        onSelectRuler={setSelectedRulerIndex}
        lifecyclePolicy={selectedLifecyclePolicy}
        onLifecyclePolicyChange={setSelectedLifecyclePolicy}
        rulesetId={selectedRulesetId}
        onRulesetChange={setSelectedRulesetId}
        onStart={startCampaign}
        onBack={() => setScreen('scenario')}
      />
    );
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="brand-block">
          <p className="eyebrow">Playable strategy slice</p>
          <h1>三国霸业 · Web 重写</h1>
        </div>
        <div className="campaign-status">
          <span>{state.calendar.year} 年 {state.calendar.month} 月</span>
          <span>{sourceLabel}</span>
          <span>{getCampaignRuleset(state.rulesetId).label}</span>
        </div>
        <div className="top-actions">
          <div className="save-controls" aria-label="存档操作">
            <select value={selectedSaveSlot} onChange={(event) => setSelectedSaveSlot(event.target.value as Exclude<SaveSlotId, 'auto'>)}>
              <option value="1">槽位 1</option>
              <option value="2">槽位 2</option>
              <option value="3">槽位 3</option>
            </select>
            <button type="button" onClick={saveManualSlot}>保存</button>
            <button type="button" onClick={loadManualSlot}>载入</button>
            <button type="button" onClick={exportCurrentSave}>导出</button>
            <label className="file-action compact">
              导入
              <input type="file" accept="application/json,.json" onChange={importSaveFile} />
            </label>
          </div>
          <button type="button" className="return-title-action" onClick={() => setScreen('title')}>返回标题</button>
        </div>
      </header>

      <section className="map-section" aria-label="战略地图">
        <div className="map-toolbar">
          <span>拖动地图 · 滚轮缩放 · 点击城池</span>
          <span>{Object.keys(state.cities).length} 城 / {countCurrentOfficers(state)} 名当前人物</span>
        </div>
        {playerStrategicOrders.length > 0 && (
          <div className="strategic-order-strip" aria-label="执行中的战略命令">
            <strong>在途</strong>
            {playerStrategicOrders.slice(0, 3).map((order) => (
              <span key={order.id}>{describeStrategicOrder(state, order)}</span>
            ))}
            {playerStrategicOrders.length > 3 && (
              <details className="strategic-order-overflow">
                <summary>另有 {playerStrategicOrders.length - 3} 项在途命令</summary>
                <div>
                  {playerStrategicOrders.slice(3).map((order) => (
                    <span key={order.id}>{describeStrategicOrder(state, order)}</span>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
        {playerDiplomaticOrders.length > 0 && (
          <div className="strategic-order-strip" aria-label="执行中的谋略命令">
            <strong>谋略</strong>
            {playerDiplomaticOrders.slice(0, 3).map((order) => (
              <span key={order.id}>{describeDiplomaticOrder(state, order)}</span>
            ))}
            {playerDiplomaticOrders.length > 3 && (
              <details className="strategic-order-overflow">
                <summary>另有 {playerDiplomaticOrders.length - 3} 项谋略</summary>
                <div>
                  {playerDiplomaticOrders.slice(3).map((order) => (
                    <span key={order.id}>{describeDiplomaticOrder(state, order)}</span>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
        <div className="map-host" ref={mapHost} />
        {feedback && (
          <div className={`action-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
            {feedback.message}
          </div>
        )}
        {state.outcome && (
          <div className={`outcome-banner ${state.outcome}`} role="status">
            {state.outcome === 'victory' ? '战役胜利' : '战役失败'}
          </div>
        )}
      </section>

      {isCityPanelOpen && (
        <CityPanel
          state={state}
          cityId={selectedCityId}
          disabled={isResolving || Boolean(state.pendingSuccession)}
          onClose={() => setIsCityPanelOpen(false)}
        onDevelop={(cityId, officerId) => applyPlayerAction(
          (current) => developFarming(current, { cityId, officerId }),
        )}
        onDevelopCommerce={(cityId, officerId) => applyPlayerAction(
          (current) => developCommerce(current, { cityId, officerId }),
        )}
        onGovern={(cityId, officerId) => applyPlayerAction(
          (current) => governCity(current, { cityId, officerId }),
        )}
        onInspect={(cityId, officerId) => applyPlayerAction(
          (current) => inspectCity(current, { cityId, officerId }),
        )}
        onTrade={(cityId, officerId, direction, amount) => applyPlayerAction(
          (current) => tradeFood(current, { cityId, officerId, direction, amount }),
        )}
        onBanquet={(cityId, targetOfficerId) => applyPlayerAction(
          (current) => banquetOfficer(current, { cityId, targetOfficerId }),
        )}
        onPlunder={(cityId, officerId) => applyPlayerAction(
          (current) => plunderCity(current, { cityId, officerId }),
        )}
        onRecruit={(cityId, officerId) => applyPlayerAction(
          (current) => recruitTroops(current, { cityId, officerId }),
        )}
        onSearch={(cityId, officerId) => applyPlayerAction(
          (current) => searchCity(current, { cityId, officerId }),
        )}
        onRecruitOfficer={(cityId, executorOfficerId, targetOfficerId) => applyPlayerAction(
          (current) => recruitFreeOfficer(current, { cityId, executorOfficerId, targetOfficerId }),
        )}
        onReward={(cityId, officerId) => applyPlayerAction(
          (current) => rewardOfficer(current, { cityId, officerId }),
        )}
        onGiveItem={(cityId, officerId, itemId) => applyPlayerAction(
          (current) => giveItemToOfficer(current, { cityId, officerId, itemId }),
        )}
        onUnequipItem={(cityId, officerId, itemId) => applyPlayerAction(
          (current) => unequipOfficerItem(current, { cityId, officerId, itemId }),
        )}
        onConfiscateItem={(cityId, officerId, itemId) => applyPlayerAction(
          (current) => confiscateOfficerEquipment(current, { cityId, officerId, itemId }),
        )}
        onBanishOfficer={(cityId, officerId) => applyPlayerAction(
          (current) => banishOfficer(current, { cityId, officerId }),
        )}
        onRecruitCaptive={(cityId, executorOfficerId, captiveOfficerId) => applyPlayerAction(
          (current) => recruitCaptive(current, { cityId, executorOfficerId, captiveOfficerId }),
        )}
        onReleaseCaptive={(cityId, captiveOfficerId) => applyPlayerAction(
          (current) => releaseCaptive(current, { cityId, captiveOfficerId }),
        )}
        onExecuteCaptive={(cityId, captiveOfficerId) => applyPlayerAction(
          (current) => executeCaptive(current, { cityId, captiveOfficerId }),
        )}
        onMove={(sourceCityId, targetCityId, officerId) => applyPlayerAction(
          (current) => moveOfficer(current, { sourceCityId, targetCityId, officerId }),
          sourceCityId,
        )}
        onTransport={(sourceCityId, targetCityId, officerId, cargo) => applyPlayerAction(
          (current) => issueTransportOrder(current, { sourceCityId, targetCityId, officerId, cargo }),
          sourceCityId,
        )}
        onAppoint={(cityId, officerId) => applyPlayerAction(
          (current) => appointSatrap(current, { cityId, officerId }),
        )}
        onDistribute={(cityId, officerId, targetTroops) => applyPlayerAction(
          (current) => distributeTroops(current, { cityId, officerId, targetTroops }),
        )}
        onRecon={(sourceCityId, targetCityId, officerId) => applyPlayerAction(
          (current) => reconnoitreCity(current, { sourceCityId, targetCityId, officerId }),
          targetCityId,
        )}
        onDiplomacy={(kind, sourceCityId, officerId, targetOfficerId) => applyPlayerAction(
          (current) => issueDiplomaticOrder(current, { kind, sourceCityId, officerId, targetOfficerId }),
          sourceCityId,
        )}
          onAttack={(sourceCityId, targetCityId, officerIds, provisions) => requestAttack({
            sourceCityId,
            targetCityId,
            officerIds,
            provisions,
          })}
        />
      )}

      {pendingAttack && (
        <div
          className="battle-choice-backdrop"
          role="presentation"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setPendingAttack(undefined);
            if (event.key !== 'Tab') return;
            const controls = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), select:not(:disabled)',
              ),
            ];
            if (controls.length === 0) return;
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <section
            className="battle-choice-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="battle-choice-title"
            aria-describedby="battle-choice-description"
          >
            <p className="panel-kicker">Campaign decision</p>
            <h2 id="battle-choice-title">如何处理这场战斗？</h2>
            <p id="battle-choice-description">
              {state.cities[pendingAttack.sourceCityId].name}将向
              {state.cities[pendingAttack.targetCityId].name}出征，携粮 {pendingAttack.provisions}。
            </p>
            <div className="battle-choice-actions">
              <button type="button" className="primary-action" autoFocus onClick={beginManualBattle}>亲自指挥</button>
              <button type="button" onClick={resolvePendingAttackQuickly}>快速结算</button>
              <button type="button" onClick={() => setPendingAttack(undefined)}>取消</button>
            </div>
          </section>
        </div>
      )}

      {state.pendingSuccession && (
        <div
          className="battle-choice-backdrop"
          role="presentation"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              return;
            }
            if (event.key !== 'Tab') return;
            const controls = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), select:not(:disabled)',
              ),
            ];
            if (controls.length === 0) return;
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <section
            className="battle-choice-dialog succession-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="succession-title"
            aria-describedby="succession-description"
          >
            <p className="panel-kicker">Succession decision</p>
            <h2 id="succession-title">拥立新君</h2>
            <p id="succession-description">
              {state.officers[state.pendingSuccession.formerRulerOfficerId].name}
              {describeSuccessionReason(state.pendingSuccession.reason)}，
              {state.factions[state.pendingSuccession.factionId].name}必须立即确定继承人。
              此决策已经写入自动存档，刷新或返回标题不会丢失。
            </p>
            <div className="succession-candidates" role="list">
              {state.pendingSuccession.candidateOfficerIds.map((officerId, index) => {
                const officer = state.officers[officerId];
                return (
                  <button
                    type="button"
                    className={index === 0 ? 'primary-action' : undefined}
                    autoFocus={index === 0}
                    key={officer.id}
                    onClick={() => chooseSuccessor(officer.id)}
                  >
                    <strong>{officer.name}</strong>
                    <span>
                      智 {officer.intelligence} · 忠 {officer.loyalty} ·
                      {' '}{officer.cityId ? state.cities[officer.cityId]?.name : '在途'}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="succession-persistence-actions" aria-label="继承期间的存档操作">
              <label>
                <span>存档槽</span>
                <select
                  aria-label="继承存档槽"
                  value={selectedSaveSlot}
                  onChange={(event) =>
                    setSelectedSaveSlot(event.target.value as Exclude<SaveSlotId, 'auto'>)}
                >
                  <option value="1">槽位 1</option>
                  <option value="2">槽位 2</option>
                  <option value="3">槽位 3</option>
                </select>
              </label>
              <button type="button" onClick={saveManualSlot}>保存</button>
              <button type="button" onClick={exportCurrentSave}>导出</button>
              <button type="button" onClick={() => setScreen('title')}>返回标题</button>
            </div>
            {feedback && (
              <p
                className={`succession-feedback ${feedback.kind}`}
                role={feedback.kind === 'error' ? 'alert' : 'status'}
              >
                {feedback.message}
              </p>
            )}
            <small>继承前不能执行城池命令或结束本月；可在此保存、导出或返回标题。</small>
          </section>
        </div>
      )}

      <section className="log-panel" aria-label="日志">
        <div>
          <p className="panel-kicker">Campaign log</p>
          {monthSummary.length > 0 && (
            <div className="month-summary">
              <strong>本月摘要</strong>
              {monthSummary.map((message) => <p key={message}>{message}</p>)}
            </div>
          )}
        </div>
        <div className="log-lines">
          {state.logs.slice(-5).map((log) => <p key={log.id}>{log.message}</p>)}
        </div>
      </section>

      <nav className="campaign-dock" aria-label="战略地图导航">
        <button
          type="button"
          className={!isCityPanelOpen ? 'active' : undefined}
          aria-pressed={!isCityPanelOpen}
          onClick={() => setIsCityPanelOpen(false)}
        >
          <span aria-hidden="true">图</span>
          地图
        </button>
        <button
          type="button"
          className={isCityPanelOpen ? 'active' : undefined}
          aria-pressed={isCityPanelOpen}
          onClick={() => setIsCityPanelOpen(true)}
        >
          <span aria-hidden="true">城</span>
          城情
        </button>
        <label className="campaign-city-picker">
          <span className="visually-hidden">快速选择城池</span>
          <select
            aria-label="快速选择城池"
            value={selectedCityId}
            onChange={(event) => {
              setSelectedCityId(event.target.value);
              setIsCityPanelOpen(true);
            }}
          >
            {Object.values(state.cities).map((city) => (
              <option value={city.id} key={city.id}>
                {city.name} · {city.ownerId ? state.factions[city.ownerId]?.name ?? '未知势力' : '无主'}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="advance-month-action"
          disabled={isResolving || state.phase === 'ended' || Boolean(state.pendingSuccession)}
          onClick={endMonth}
        >
          <span aria-hidden="true">令</span>
          {isResolving ? '推演中…' : '结束本月'}
        </button>
      </nav>
    </main>
  );
}

function firstOwnedCityId(state: GameState): string {
  return Object.values(state.cities).find((city) => city.ownerId === state.playerFactionId)?.id
    ?? Object.keys(state.cities)[0];
}

function countCurrentOfficers(state: GameState): number {
  return Object.values(state.officers).filter(
    (officer) => officer.status !== 'hidden' && officer.status !== 'dead',
  ).length;
}

function describeSuccessionReason(reason: NonNullable<GameState['pendingSuccession']>['reason']): string {
  if (reason === 'capture') return '兵败被俘';
  if (reason === 'battle-death') return '兵败战死';
  if (reason === 'execution') return '遭到处斩';
  return '年迈病逝';
}

function loadInitialGame(): { state: GameState; sourceLabel: string; hasAutoSave: boolean } {
  try {
    const recovery = loadBattleRecovery(window.localStorage);
    if (recovery) {
      return {
        state: recovery.state,
        sourceLabel: sourceLabelForState(recovery.state),
        hasAutoSave: true,
      };
    }
  } catch {
    clearBattleCheckpointBestEffort();
  }
  try {
    const envelope = loadFromSlot(window.localStorage, 'auto');
    if (envelope) return { state: envelope.state, sourceLabel: sourceLabelForState(envelope.state), hasAutoSave: true };
  } catch {
    // A damaged automatic save must never prevent the game from starting.
  }
  const state = createSampleState();
  return { state, sourceLabel: sourceLabelForState(state), hasAutoSave: false };
}

function clearBattleCheckpoint(): void {
  deleteBattleCheckpoint(window.localStorage);
}

function clearBattleCheckpointBestEffort(): void {
  try {
    clearBattleCheckpoint();
  } catch {
    // Damaged recovery metadata must not prevent a clean fallback from loading.
  }
}

function sourceLabelForState(state: GameState): string {
  if (state.scenario?.source === 'baye-legacy') {
    const period = state.scenario.period as BundledPeriodId | undefined;
    const title = scenarioOptions.find((scenario) => scenario.period === period)?.title ?? `时期 ${period ?? 1}`;
    return `${title} · ${Object.keys(state.cities).length} 城`;
  }
  return `内置演示剧本 · ${Object.keys(state.cities).length} 城`;
}

function formatRouteWaypoints(state: GameState, routeCityIds: string[]): string {
  const waypoints = routeCityIds.slice(1, -1)
    .map((cityId) => state.cities[cityId]?.name ?? cityId);
  return waypoints.length > 0 ? `途经 ${waypoints.join('、')}` : '直达';
}

function formatFutureMonth(calendar: GameState['calendar'], offsetMonths: number): string {
  const zeroBased = calendar.year * 12 + calendar.month - 1 + offsetMonths;
  return `${Math.floor(zeroBased / 12)} 年 ${(zeroBased % 12) + 1} 月`;
}

function formatOrderCargo(cargo: GameState['strategicOrders'][string]['cargo']): string {
  return [
    cargo.money > 0 ? `${cargo.money} 金` : '',
    cargo.food > 0 ? `${cargo.food} 粮` : '',
    cargo.reserveTroops > 0 ? `${cargo.reserveTroops} 后备兵` : '',
  ].filter(Boolean).join('、');
}

function describeStrategicOrder(
  state: GameState,
  order: GameState['strategicOrders'][string],
): string {
  const kind = order.kind === 'transport' ? '输送' : '调动';
  const officer = state.officers[order.officerId]?.name ?? order.officerId;
  const source = state.cities[order.sourceCityId]?.name ?? order.sourceCityId;
  const target = state.cities[order.targetCityId]?.name ?? order.targetCityId;
  const timing = `预计 ${formatFutureMonth(state.calendar, order.remainingMonths)}${order.kind === 'transport' ? '完成' : '抵达'}`;
  const cargo = order.kind === 'transport' ? ` · ${formatOrderCargo(order.cargo)}` : '';
  return `${kind} · ${officer} · ${source} → ${target} · ${formatRouteWaypoints(state, order.routeCityIds)} · ${timing}${cargo}`;
}

function describeDiplomaticOrder(
  state: GameState,
  order: GameState['diplomaticOrders'][string],
): string {
  const labels = {
    alienate: '离间',
    canvass: '招揽',
    counterespionage: '策反',
    induce: '劝降',
  } as const;
  const officer = state.officers[order.officerId]?.name ?? order.officerId;
  const target = state.officers[order.targetOfficerId]?.name ?? order.targetOfficerId;
  const source = state.cities[order.sourceCityId]?.name ?? order.sourceCityId;
  return `${labels[order.kind]} · ${officer} · ${source} → ${target} · 已付 ${order.moneyCost} 金 · 预计 ${formatFutureMonth(state.calendar, order.remainingMonths)}回报`;
}
