import { useEffect, useRef } from 'react';
import { BAYE_ARMS_LABELS, BAYE_TERRAIN_LABELS } from '../compat/baye/tacticalBattle';
import {
  getTacticalPathCost,
  getTacticalAttackRange,
  getTacticalTile,
  previewTacticalAttack,
  type TacticalBattleState,
  type TacticalPosition,
  type TacticalVictoryReason,
} from '../core/tacticalBattle';
import type { GameState } from '../core/types';
import { createTacticalMap, type TacticalMapController } from '../game/createBattleGame';
import type { GameBridge } from '../game/events';

type TacticalBattleScreenProps = {
  campaign: GameState;
  battle: TacticalBattleState;
  bridge: GameBridge;
  selectedUnitId?: string;
  reachable: TacticalPosition[];
  attackableUnitIds: string[];
  feedback?: { kind: 'success' | 'error'; message: string };
  isResolving: boolean;
  onUnitSelected: (unitId: string) => void;
  onTileSelected: (position: TacticalPosition) => void;
  onWait: () => void;
  onEndSide: () => void;
  onFinish: () => void;
};

const number = new Intl.NumberFormat('zh-CN');

export function TacticalBattleScreen({
  campaign,
  battle,
  bridge,
  selectedUnitId,
  reachable,
  attackableUnitIds,
  feedback,
  isResolving,
  onUnitSelected,
  onTileSelected,
  onWait,
  onEndSide,
  onFinish,
}: TacticalBattleScreenProps) {
  const mapHost = useRef<HTMLDivElement>(null);
  const controller = useRef<TacticalMapController | null>(null);
  const playerSide = battle.attackerFactionId === campaign.playerFactionId ? 'attacker' : 'defender';
  const selectedUnit = selectedUnitId ? battle.units[selectedUnitId] : undefined;

  useEffect(() => bridge.on('tactical:unit-selected', ({ unitId }) => onUnitSelected(unitId)), [bridge, onUnitSelected]);
  useEffect(() => bridge.on('tactical:tile-selected', onTileSelected), [bridge, onTileSelected]);

  useEffect(() => {
    if (!mapHost.current) return;
    controller.current = createTacticalMap(
      mapHost.current,
      bridge,
      battle,
      selectedUnitId,
      reachable,
      attackableUnitIds,
    );
    return () => {
      controller.current?.destroy();
      controller.current = null;
    };
    // Phaser owns the canvas lifecycle; updates flow through the controller below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  useEffect(() => {
    controller.current?.update(battle, selectedUnitId, reachable, attackableUnitIds);
  }, [battle, selectedUnitId, reachable, attackableUnitIds]);

  const attacker = campaign.factions[battle.attackerFactionId];
  const defender = campaign.factions[battle.defenderFactionId];
  const activeName = battle.activeSide === 'attacker' ? attacker?.name : defender?.name;
  const canCommand = battle.status === 'ongoing' && battle.activeSide === playerSide && !isResolving;
  const unactedCount = Object.values(battle.units)
    .filter((unit) => unit.side === battle.activeSide && unit.troops > 0 && !unit.acted).length;
  const selectedTerrain = selectedUnit
    ? getTacticalTile(battle, selectedUnit.x, selectedUnit.y)?.terrain
    : undefined;

  return (
    <main className="battle-shell">
      <header className="battle-top-bar">
        <div>
          <p className="eyebrow">Manual tactical battle</p>
          <h1>{campaign.cities[battle.sourceCityId].name} → {campaign.cities[battle.targetCityId].name}</h1>
        </div>
        <div className="battle-status-strip">
          <span>第 {battle.day} 日</span>
          <span>攻粮 {number.format(battle.attackerFood)}</span>
          <span>守粮 {number.format(battle.defenderFood)}</span>
          <span>{battle.status === 'ongoing' ? `${activeName ?? battle.activeSide}行动` : '战斗结束'}</span>
          {battle.status === 'ongoing' && <span>未行动 {unactedCount} 队</span>}
        </div>
      </header>

      <section className="battle-main">
        <aside className="battle-roster attacker">
          <p className="panel-kicker">攻方 · {attacker?.name}</p>
          <UnitRoster
            battle={battle}
            side="attacker"
            selectedUnitId={selectedUnitId}
            onUnitSelected={onUnitSelected}
          />
        </aside>
        <div className="battle-map-host" ref={mapHost} />
        <aside className="battle-roster defender">
          <p className="panel-kicker">守方 · {defender?.name}</p>
          <UnitRoster
            battle={battle}
            side="defender"
            selectedUnitId={selectedUnitId}
            onUnitSelected={onUnitSelected}
          />
        </aside>
      </section>

      <section className="battle-command-bar">
        <div className="battle-selection">
          {selectedUnit ? (
            <>
              <strong>{selectedUnit.name}</strong>
              <span>
                {BAYE_ARMS_LABELS[selectedUnit.armsType]} · 兵 {number.format(selectedUnit.troops)} ·
                移动 {selectedUnit.mobility} · 射程 {getTacticalAttackRange(selectedUnit.armsType)}
              </span>
              {selectedTerrain !== undefined && <span>所在地形：{BAYE_TERRAIN_LABELS[selectedTerrain]}</span>}
              <span>{selectedUnit.acted ? '本阶段已行动' : selectedUnit.moved ? '已移动，可攻击或待命' : '等待命令'}</span>
            </>
          ) : (
            <span>{canCommand ? '选择己方单位开始行动。' : isResolving ? '敌方正在行动……' : '等待战斗结算。'}</span>
          )}
          {canCommand && selectedUnit && !selectedUnit.acted && (
            <div className="battle-keyboard-targets" aria-label="可用战术目标">
              {reachable.map((position) => (
                <button
                  type="button"
                  key={`move:${position.x}:${position.y}`}
                  onClick={() => onTileSelected(position)}
                >
                  移至 {position.x + 1},{position.y + 1}
                  （耗 {getTacticalPathCost(battle, selectedUnit.id, position) ?? '?'}）
                </button>
              ))}
              {attackableUnitIds.map((unitId) => (
                <button type="button" key={`attack:${unitId}`} onClick={() => onUnitSelected(unitId)}>
                  攻击 {battle.units[unitId].name}
                  （预计 {previewTacticalAttack(battle, selectedUnit.id, unitId).damage}）
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="battle-command-actions">
          <button
            type="button"
            disabled={!canCommand || !selectedUnit || selectedUnit.side !== playerSide || selectedUnit.acted}
            onClick={onWait}
          >
            待命
          </button>
          <button type="button" disabled={!canCommand} onClick={onEndSide}>结束本方阶段</button>
          <button type="button" className="primary-action" disabled={battle.status === 'ongoing'} onClick={onFinish}>
            结算并返回战略地图
          </button>
        </div>
      </section>

      <details className="battle-log" open>
        <summary>战场纪录（最近 {Math.min(10, battle.logs.length)} 条）</summary>
        <ol>
          {battle.logs.slice(-10).map((message, index) => <li key={`${battle.logs.length - 10 + index}:${message}`}>{message}</li>)}
        </ol>
      </details>

      {feedback && (
        <div className={`battle-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
          {feedback.message}
        </div>
      )}
      {battle.status !== 'ongoing' && (
        <div className={`battle-outcome ${battle.status}`} role="status" aria-live="assertive">
          <strong>{battle.status === 'attacker-won' ? '攻方胜利' : '守方胜利'}</strong>
          <span>{victoryReasonLabel(battle.victoryReason)}</span>
        </div>
      )}
    </main>
  );
}

function victoryReasonLabel(reason?: TacticalVictoryReason): string {
  if (reason === 'objective-held') return '攻方占领城池并坚持到阶段结束。';
  if (reason === 'attacker-food-exhausted') return '攻方粮草耗尽，被迫撤军。';
  if (reason === 'defender-food-exhausted') return '守方粮草耗尽，城池失守。';
  if (reason === 'day-limit') return '攻方未能在期限内破城。';
  if (reason === 'annihilation') return '一方部队全部溃退。';
  return '战斗胜负已确定。';
}

function UnitRoster({
  battle,
  side,
  selectedUnitId,
  onUnitSelected,
}: {
  battle: TacticalBattleState;
  side: 'attacker' | 'defender';
  selectedUnitId?: string;
  onUnitSelected: (unitId: string) => void;
}) {
  const units = Object.values(battle.units).filter((unit) => unit.side === side);
  return (
    <div className="battle-unit-list">
      {units.map((unit) => (
        <button
          type="button"
          className={`battle-unit-row ${unit.id === selectedUnitId ? 'selected' : ''} ${unit.troops <= 0 ? 'defeated' : ''}`}
          key={unit.id}
          disabled={unit.troops <= 0}
          aria-pressed={unit.id === selectedUnitId}
          onClick={() => onUnitSelected(unit.id)}
        >
          <strong>{unit.name}</strong>
          <span>{BAYE_ARMS_LABELS[unit.armsType]}</span>
          <span>{number.format(unit.troops)} 兵</span>
          <span>{unit.troops <= 0 ? '溃退' : unit.acted ? '已行动' : '待命'}</span>
        </button>
      ))}
    </div>
  );
}
