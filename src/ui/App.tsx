import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { applyBattleResult, executeAttack, type AttackOrder } from '../core/battle';
import { developFarming, distributeTroops, recruitTroops } from '../core/cityCommands';
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
  loadBattleCheckpoint,
  loadFromSlot,
  saveBattleCheckpoint,
  savePlayerBattleRollback,
  saveToSlot,
  slotKey,
  type SaveSlotId,
} from '../core/saveStorage';
import {
  advanceTurnUntilPlayerDefense,
  continueTurnUntilPlayerDefense,
  type InteractiveTurnProgress,
} from '../core/turn';
import type { GameLog, GameState } from '../core/types';
import {
  attackTacticalUnit,
  createTacticalBattle,
  createTacticalBattleResult,
  endTacticalSide,
  getAttackableUnitIds,
  getReachableTiles,
  moveTacticalUnit,
  runBasicTacticalAi,
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

type AppScreen = 'title' | 'scenario' | 'ruler' | 'game' | 'battle';
const scenarioOptions = getScenarioOptions();

export function App() {
  const initialGame = useMemo(loadInitialGame, []);
  const [state, setState] = useState<GameState>(initialGame.state);
  const [screen, setScreen] = useState<AppScreen>('title');
  const [hasContinue, setHasContinue] = useState(initialGame.hasAutoSave);
  const [selectedPeriod, setSelectedPeriod] = useState<BundledPeriodId>(1);
  const [selectedRulerIndex, setSelectedRulerIndex] = useState(() => getScenarioRulers(1)[0].sourceIndex);
  const [selectedCityId, setSelectedCityId] = useState(() => firstOwnedCityId(initialGame.state));
  const [sourceLabel, setSourceLabel] = useState(initialGame.sourceLabel);
  const [selectedSaveSlot, setSelectedSaveSlot] = useState<Exclude<SaveSlotId, 'auto'>>('1');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string }>();
  const [monthSummary, setMonthSummary] = useState<string[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [pendingAttack, setPendingAttack] = useState<AttackOrder>();
  const [tacticalBattle, setTacticalBattle] = useState<TacticalBattleState>();
  const [selectedTacticalUnitId, setSelectedTacticalUnitId] = useState<string>();
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

  useEffect(() => bridge.on('city:selected', ({ cityId }) => setSelectedCityId(cityId)), [bridge]);

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
    const next = createBundledScenario(selectedPeriod, selectedRulerIndex);
    const label = sourceLabelForState(next);
    setState(next);
    setSelectedCityId(firstOwnedCityId(next));
    setSourceLabel(label);
    setMonthSummary([]);
    setFeedback({ kind: 'success', message: `已选择${next.factions[next.playerFactionId].name}，霸业由此开始。` });
    try {
      clearBattleCheckpoint();
      saveToSlot(window.localStorage, 'auto', next, `${label} · 自动存档`);
      setHasContinue(true);
    } catch {
      // Starting a campaign remains possible even if browser storage is unavailable.
    }
    setScreen('game');
  }

  function continueCampaign() {
    try {
      let checkpoint;
      try {
        checkpoint = loadBattleCheckpoint(window.localStorage);
      } catch {
        clearBattleCheckpoint();
      }
      if (checkpoint) {
        const battle = createTacticalBattle(checkpoint.state, checkpoint.order);
        setState(checkpoint.state);
        setSelectedCityId(checkpoint.order.targetCityId);
        setSourceLabel(sourceLabelForState(checkpoint.state));
        setMonthSummary([]);
        setTacticalBattle(battle);
        setSelectedTacticalUnitId(undefined);
        setAiResumeFactionIndex(checkpoint.nextFactionIndex);
        setScreen('battle');
        setFeedback({ kind: 'success', message: '已恢复到上一场未完成守城战的战前检查点。' });
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
      try {
        savePlayerBattleRollback(window.localStorage, state, `${sourceLabel} · 战前自动存档`);
        setHasContinue(true);
      } catch {
        // The battle remains playable when browser storage is unavailable.
      }
      setTacticalBattle(battle);
      setSelectedTacticalUnitId(undefined);
      setPendingAttack(undefined);
      setFeedback({ kind: 'success', message: '战场已经展开，请选择己方单位。' });
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
      setFeedback({ kind: 'success', message: `已选择${unit.name}。青色格可移动，红框单位可攻击。` });
      return;
    }
    if (!selectedTacticalUnitId) {
      setFeedback({ kind: 'error', message: '请先选择一个己方单位。' });
      return;
    }
    try {
      const next = attackTacticalUnit(tacticalBattle, selectedTacticalUnitId, unitId);
      setTacticalBattle(next);
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
      setFeedback({ kind: 'success', message: next.logs.at(-1) ?? '本方阶段结束。' });
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '无法结束阶段。' });
    }
  }

  function finishManualBattle() {
    if (!tacticalBattle || tacticalBattle.status === 'ongoing') return;
    try {
      const result = createTacticalBattleResult(tacticalBattle);
      const next = applyBattleResult(state, result);
      setTacticalBattle(undefined);
      setSelectedTacticalUnitId(undefined);
      if (aiResumeFactionIndex !== undefined && next.phase !== 'ended') {
        const progress = continueTurnUntilPlayerDefense(next, aiResumeFactionIndex);
        setAiResumeFactionIndex(undefined);
        applyInteractiveTurnProgress(progress);
      } else {
        clearBattleCheckpoint();
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

  function applyInteractiveTurnProgress(progress: InteractiveTurnProgress) {
    setState(progress.state);
    if (progress.pendingPlayerDefense) {
      try {
        saveBattleCheckpoint(
          window.localStorage,
          progress.state,
          progress.pendingPlayerDefense.order,
          progress.pendingPlayerDefense.nextFactionIndex,
          `${sourceLabel} · 守城战前检查点`,
        );
      } catch {
        // The battle remains playable when browser storage is unavailable.
      }
      const battle = createTacticalBattle(progress.state, progress.pendingPlayerDefense.order);
      setTacticalBattle(battle);
      setSelectedTacticalUnitId(undefined);
      setAiResumeFactionIndex(progress.pendingPlayerDefense.nextFactionIndex);
      setScreen('battle');
      setIsResolving(false);
      setFeedback({
        kind: 'success',
        message: `${progress.state.factions[battle.attackerFactionId].name}来袭，请准备守城。`,
      });
      return;
    }

    setAiResumeFactionIndex(undefined);
    clearBattleCheckpoint();
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

  if (screen === 'battle' && tacticalBattle) {
    return (
      <TacticalBattleScreen
        campaign={state}
        battle={tacticalBattle}
        bridge={bridge}
        selectedUnitId={selectedTacticalUnitId}
        reachable={tacticalReachable}
        attackableUnitIds={tacticalAttackable}
        feedback={feedback}
        isResolving={isResolving}
        onUnitSelected={selectTacticalUnit}
        onTileSelected={moveSelectedTacticalUnit}
        onWait={waitSelectedTacticalUnit}
        onUseSkill={useSelectedTacticalSkill}
        onEndSide={endPlayerTacticalSide}
        onFinish={finishManualBattle}
      />
    );
  }

  if (screen === 'title') {
    return <TitleScreen hasContinue={hasContinue} onNewGame={beginNewGame} onContinue={continueCampaign} />;
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
          <button type="button" className="primary-action" disabled={isResolving || state.phase === 'ended'} onClick={endMonth}>
            {isResolving ? '推演中…' : '结束本月'}
          </button>
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

      <CityPanel
        state={state}
        cityId={selectedCityId}
        disabled={isResolving}
        onDevelop={(cityId, officerId) => applyPlayerAction(
          (current) => developFarming(current, { cityId, officerId }),
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
        onRecruitCaptive={(cityId, executorOfficerId, captiveOfficerId) => applyPlayerAction(
          (current) => recruitCaptive(current, { cityId, executorOfficerId, captiveOfficerId }),
        )}
        onReleaseCaptive={(cityId, captiveOfficerId) => applyPlayerAction(
          (current) => releaseCaptive(current, { cityId, captiveOfficerId }),
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
        onAttack={(sourceCityId, targetCityId, officerIds, provisions) => requestAttack({
          sourceCityId,
          targetCityId,
          officerIds,
          provisions,
        })}
      />

      {pendingAttack && (
        <div
          className="battle-choice-backdrop"
          role="presentation"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setPendingAttack(undefined);
            if (event.key !== 'Tab') return;
            const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
            if (buttons.length === 0) return;
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
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
    </main>
  );
}

function firstOwnedCityId(state: GameState): string {
  return Object.values(state.cities).find((city) => city.ownerId === state.playerFactionId)?.id
    ?? Object.keys(state.cities)[0];
}

function countCurrentOfficers(state: GameState): number {
  return Object.values(state.officers).filter((officer) => officer.status !== 'hidden').length;
}

function loadInitialGame(): { state: GameState; sourceLabel: string; hasAutoSave: boolean } {
  try {
    const checkpoint = loadBattleCheckpoint(window.localStorage);
    if (checkpoint) {
      return {
        state: checkpoint.state,
        sourceLabel: sourceLabelForState(checkpoint.state),
        hasAutoSave: true,
      };
    }
  } catch {
    clearBattleCheckpoint();
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
  try {
    deleteBattleCheckpoint(window.localStorage);
  } catch {
    // Checkpoint cleanup must never block campaign progress or loading.
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

function summarizeMonth(logs: GameLog[]): string[] {
  const important = logs
    .filter((log) =>
      log.kind === 'ai'
      || (log.kind === 'battle' && (log.message.includes('占领') || log.message.includes('击退')))
      || log.message.includes('粮草不足')
      || log.message.includes('抵达')
      || log.message.includes('目标易主')
      || log.message.includes('失效')
      || log.message.includes('流落')
      || log.message.includes('输送'))
    .map((log) => log.message);
  if (important.length > 0) return [...new Set(important)].slice(0, 5);
  return ['各势力本月没有发生重大事件。'];
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
