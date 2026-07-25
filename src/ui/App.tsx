import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { executeAttack } from '../core/battle';
import { developFarming, distributeTroops, recruitTroops } from '../core/cityCommands';
import { createSampleState } from '../core/sampleState';
import { appointSatrap, moveOfficer, recruitFreeOfficer, rewardOfficer, searchCity } from '../core/personnelCommands';
import { parseSave, serializeSave } from '../core/saveGame';
import { loadFromSlot, saveToSlot, slotKey, type SaveSlotId } from '../core/saveStorage';
import { advanceTurn } from '../core/turn';
import type { GameLog, GameState } from '../core/types';
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

type AppScreen = 'title' | 'scenario' | 'ruler' | 'game';
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
  const mapHost = useRef<HTMLDivElement>(null);
  const mapController = useRef<StrategyMapController | null>(null);
  const bridge = useMemo(() => createGameBridge(), []);

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
      saveToSlot(window.localStorage, 'auto', next, `${label} · 自动存档`);
      setHasContinue(true);
    } catch {
      // Starting a campaign remains possible even if browser storage is unavailable.
    }
    setScreen('game');
  }

  function continueCampaign() {
    try {
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
  ) {
    try {
      const next = transform(state);
      setState(next);
      if (selectedAfter) {
        setSelectedCityId(typeof selectedAfter === 'function' ? selectedAfter(next) : selectedAfter);
      }
      setFeedback({ kind: 'success', message: next.logs.at(-1)?.message ?? '命令已执行。' });
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '命令执行失败。' });
    }
  }

  async function endMonth() {
    if (isResolving) return;
    setIsResolving(true);
    setFeedback({ kind: 'success', message: '正在推演其他势力行动……' });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      const next = advanceTurn(state);
      setMonthSummary(summarizeMonth(next.logs.slice(state.logs.length)));
      setState(next);
      if (next.cities[selectedCityId]?.ownerId !== next.playerFactionId) {
        setSelectedCityId(firstOwnedCityId(next));
      }
      setFeedback({
        kind: 'success',
        message: next.phase === 'ended'
          ? next.outcome === 'victory' ? '战役已经胜利。' : '战役已经失败。'
          : `已进入 ${next.calendar.year} 年 ${next.calendar.month} 月，武将体力与城池资源完成结算。`,
      });
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '月度推进失败。' });
    } finally {
      setIsResolving(false);
    }
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
        onMove={(sourceCityId, targetCityId, officerId) => applyPlayerAction(
          (current) => moveOfficer(current, { sourceCityId, targetCityId, officerId }),
          targetCityId,
        )}
        onAppoint={(cityId, officerId) => applyPlayerAction(
          (current) => appointSatrap(current, { cityId, officerId }),
        )}
        onDistribute={(cityId, officerId, targetTroops) => applyPlayerAction(
          (current) => distributeTroops(current, { cityId, officerId, targetTroops }),
        )}
        onAttack={(sourceCityId, targetCityId, officerIds, provisions) => applyPlayerAction(
          (current) => executeAttack(current, { sourceCityId, targetCityId, officerIds, provisions }),
          (next) => next.cities[targetCityId].ownerId === next.playerFactionId ? targetCityId : sourceCityId,
        )}
      />

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
    const envelope = loadFromSlot(window.localStorage, 'auto');
    if (envelope) return { state: envelope.state, sourceLabel: sourceLabelForState(envelope.state), hasAutoSave: true };
  } catch {
    // A damaged automatic save must never prevent the game from starting.
  }
  const state = createSampleState();
  return { state, sourceLabel: sourceLabelForState(state), hasAutoSave: false };
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
      || log.message.includes('粮草不足'))
    .map((log) => log.message);
  if (important.length > 0) return [...new Set(important)].slice(0, 5);
  return ['各势力本月没有发生重大事件。'];
}
