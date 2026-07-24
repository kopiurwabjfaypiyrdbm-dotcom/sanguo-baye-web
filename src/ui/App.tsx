import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { executeAttack } from '../core/battle';
import { developFarming, distributeTroops, recruitTroops } from '../core/cityCommands';
import { createSampleState } from '../core/sampleState';
import { advanceTurn } from '../core/turn';
import type { GameState } from '../core/types';
import { createLegacyPeriodGameState, selectPlayerFaction } from '../data/legacyScenario';
import { createGameBridge } from '../game/events';
import { createStrategyMap, type StrategyMapController } from '../game/createGame';
import { CityPanel } from './CityPanel';

export function App() {
  const [state, setState] = useState<GameState>(() => createSampleState());
  const [selectedCityId, setSelectedCityId] = useState('luoyang');
  const [sourceLabel, setSourceLabel] = useState('内置演示剧本 · 12 城');
  const [loadError, setLoadError] = useState<string>();
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string }>();
  const [isResolving, setIsResolving] = useState(false);
  const mapHost = useRef<HTMLDivElement>(null);
  const mapController = useRef<StrategyMapController | null>(null);
  const bridge = useMemo(() => createGameBridge(), []);
  const campaignStarted = state.campaignStarted;

  useEffect(() => bridge.on('city:selected', ({ cityId }) => setSelectedCityId(cityId)), [bridge]);

  useEffect(() => {
    if (!mapHost.current) return;
    mapController.current = createStrategyMap(mapHost.current, bridge, state, selectedCityId);
    return () => {
      mapController.current?.destroy();
      mapController.current = null;
    };
    // Phaser owns its canvas lifecycle; state updates flow through the controller below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  useEffect(() => {
    mapController.current?.update(state, selectedCityId);
  }, [state, selectedCityId]);

  async function loadOriginalLibrary(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const next = createLegacyPeriodGameState(new Uint8Array(await file.arrayBuffer()), 1);
      setState(next);
      setSelectedCityId(firstOwnedCityId(next));
      setSourceLabel(`原版时期 1 · ${file.name} · 38 城`);
      setLoadError(undefined);
      setFeedback({ kind: 'success', message: '原版时期 1 已载入，可以开始下令。' });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '无法读取该资源库。');
    } finally {
      event.target.value = '';
    }
  }

  function changePlayerFaction(event: ChangeEvent<HTMLSelectElement>) {
    const next = selectPlayerFaction(state, event.target.value);
    setState(next);
    setSelectedCityId(firstOwnedCityId(next));
    setFeedback({ kind: 'success', message: `现在扮演${next.factions[next.playerFactionId].name}。` });
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
      setState(next);
      if (next.cities[selectedCityId]?.ownerId !== next.playerFactionId) {
        setSelectedCityId(firstOwnedCityId(next));
      }
      setFeedback({
        kind: 'success',
        message: `已进入 ${next.calendar.year} 年 ${next.calendar.month} 月，武将体力与城池资源完成结算。`,
      });
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '月度推进失败。' });
    } finally {
      setIsResolving(false);
    }
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
          <label className="file-action">
            载入原版资料
            <input type="file" accept=".lib,application/octet-stream" onChange={loadOriginalLibrary} />
          </label>
          <label className="ruler-select">
            <span>扮演君主</span>
            <select
              value={state.playerFactionId}
              onChange={changePlayerFaction}
              disabled={campaignStarted || isResolving}
              title={campaignStarted ? '战役开始后不能切换君主' : '选择本局扮演的君主'}
            >
              {state.factionOrder.map((factionId) => (
                <option value={factionId} key={factionId}>{state.factions[factionId].name}</option>
              ))}
            </select>
          </label>
          <button type="button" className="primary-action" disabled={isResolving || state.phase === 'ended'} onClick={endMonth}>
            {isResolving ? '推演中…' : '结束本月'}
          </button>
        </div>
      </header>

      <section className="map-section" aria-label="战略地图">
        <div className="map-toolbar">
          <span>拖动地图 · 滚轮缩放 · 点击城池</span>
          <span>{Object.keys(state.cities).length} 城 / {Object.keys(state.officers).length} 名当前人物</span>
        </div>
        <div className="map-host" ref={mapHost} />
        {loadError && <div className="load-error" role="alert">载入失败：{loadError}</div>}
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
        onDistribute={(cityId, officerId, targetTroops) => applyPlayerAction(
          (current) => distributeTroops(current, { cityId, officerId, targetTroops }),
        )}
        onAttack={(sourceCityId, targetCityId, officerIds, provisions) => applyPlayerAction(
          (current) => executeAttack(current, { sourceCityId, targetCityId, officerIds, provisions }),
          (next) => next.cities[targetCityId].ownerId === next.playerFactionId ? targetCityId : sourceCityId,
        )}
      />

      <section className="log-panel" aria-label="日志">
        <p className="panel-kicker">Campaign log</p>
        <div className="log-lines">
          {state.logs.slice(-3).map((log) => <p key={log.id}>{log.message}</p>)}
        </div>
      </section>
    </main>
  );
}

function firstOwnedCityId(state: GameState): string {
  return Object.values(state.cities).find((city) => city.ownerId === state.playerFactionId)?.id
    ?? Object.keys(state.cities)[0];
}
