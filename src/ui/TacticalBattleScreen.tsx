import { useEffect, useRef, useState } from 'react';
import { BAYE_ARMS_LABELS, BAYE_TERRAIN_LABELS } from '../compat/baye/tacticalBattle';
import {
  getTacticalPathCost,
  getTacticalNormalAttackLabel,
  getTacticalProvisionUse,
  getTacticalSkillTargetIds,
  getTacticalTile,
  getTacticalUnitMobility,
  previewTacticalAttack,
  previewTacticalSkill,
  TACTICAL_APPROACH_LABELS,
  TACTICAL_BATTLEFIELD_LABELS,
  TACTICAL_SKILLS,
  TACTICAL_STATUS_LABELS,
  TACTICAL_WEATHER_LABELS,
  type TacticalSkillId,
  type TacticalBattleState,
  type TacticalPosition,
  type TacticalVictoryReason,
} from '../core/tacticalBattle';
import type { GameState } from '../core/types';
import { getOfficerEquipmentIds } from '../core/equipment';
import { createTacticalMap, type TacticalMapController } from '../game/createBattleGame';
import type { GameBridge } from '../game/events';

type TacticalBattleScreenProps = {
  campaign: GameState;
  battle: TacticalBattleState;
  bridge: GameBridge;
  selectedUnitId?: string;
  pendingTargetUnitId?: string;
  reachable: TacticalPosition[];
  attackableUnitIds: string[];
  feedback?: { kind: 'success' | 'error'; message: string };
  isResolving: boolean;
  onUnitSelected: (unitId: string) => void;
  onConfirmAttack: () => void;
  onTileSelected: (position: TacticalPosition) => void;
  onWait: () => void;
  onUseSkill: (skillId: TacticalSkillId, targetUnitId: string) => void;
  onEndSide: () => void;
  onRetreat: () => void;
  onFinish: () => void;
};

const number = new Intl.NumberFormat('zh-CN');

export function TacticalBattleScreen({
  campaign,
  battle,
  bridge,
  selectedUnitId,
  pendingTargetUnitId,
  reachable,
  attackableUnitIds,
  feedback,
  isResolving,
  onUnitSelected,
  onConfirmAttack,
  onTileSelected,
  onWait,
  onUseSkill,
  onEndSide,
  onRetreat,
  onFinish,
}: TacticalBattleScreenProps) {
  const mapHost = useRef<HTMLDivElement>(null);
  const controller = useRef<TacticalMapController | null>(null);
  const [confirmingRetreat, setConfirmingRetreat] = useState(false);
  const playerSide = battle.attackerFactionId === campaign.playerFactionId ? 'attacker' : 'defender';
  const selectedUnit = selectedUnitId ? battle.units[selectedUnitId] : undefined;
  const pendingTarget = pendingTargetUnitId ? battle.units[pendingTargetUnitId] : undefined;
  const pendingAttackPreview = selectedUnit && pendingTarget
    ? previewTacticalAttack(battle, selectedUnit.id, pendingTarget.id)
    : undefined;

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

  useEffect(() => {
    if (battle.status !== 'ongoing') setConfirmingRetreat(false);
  }, [battle.status]);

  const attacker = campaign.factions[battle.attackerFactionId];
  const defender = campaign.factions[battle.defenderFactionId];
  const activeName = battle.activeSide === 'attacker' ? attacker?.name : defender?.name;
  const canCommand = battle.status === 'ongoing' && battle.activeSide === playerSide && !isResolving;
  const unactedCount = Object.values(battle.units)
    .filter((unit) => unit.side === battle.activeSide && unit.troops > 0 && !unit.acted).length;
  const selectedTerrain = selectedUnit
    ? getTacticalTile(battle, selectedUnit.x, selectedUnit.y)?.terrain
    : undefined;
  const selectedOfficer = selectedUnit?.officerId ? campaign.officers[selectedUnit.officerId] : undefined;
  const selectedEquipment = selectedOfficer
    ? getOfficerEquipmentIds(selectedOfficer)
      .map((itemId) => campaign.items[itemId]?.name)
      .filter(Boolean)
    : [];
  const selectedSkills = selectedUnit?.officerId ? Object.values(TACTICAL_SKILLS) : [];
  const attackerUse = getTacticalProvisionUse(battle, 'attacker');
  const defenderUse = getTacticalProvisionUse(battle, 'defender');

  return (
    <main className="battle-shell">
      <header className="battle-top-bar">
        <div>
          <p className="eyebrow">Manual tactical battle</p>
          <h1>{campaign.cities[battle.sourceCityId].name} → {campaign.cities[battle.targetCityId].name}</h1>
        </div>
        <div className="battle-status-strip">
          <span>第 {battle.day} 日</span>
          <span>期限 {battle.maxDays} 日</span>
          <span>天气 {TACTICAL_WEATHER_LABELS[battle.weather]}</span>
          <span>攻粮 {number.format(battle.attackerFood)}（日耗 {attackerUse} / 约 {Math.ceil(battle.attackerFood / attackerUse)} 日）</span>
          <span>守粮 {number.format(battle.defenderFood)}（日耗 {defenderUse} / 约 {Math.ceil(battle.defenderFood / defenderUse)} 日）</span>
          <span>玩家为{playerSide === 'attacker' ? '攻方' : '守方'}</span>
          <span>战场 {TACTICAL_BATTLEFIELD_LABELS[battle.battlefieldTemplate]} · {TACTICAL_APPROACH_LABELS[battle.approach]}</span>
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
            canCommand={canCommand}
            playerSide={playerSide}
            attackableUnitIds={attackableUnitIds}
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
            canCommand={canCommand}
            playerSide={playerSide}
            attackableUnitIds={attackableUnitIds}
            onUnitSelected={onUnitSelected}
          />
        </aside>
      </section>

      <section className="battle-command-bar">
        {feedback && (
          <div className={`battle-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
            {feedback.message}
          </div>
        )}
        <div className="battle-selection">
          {selectedUnit ? (
            <>
              <strong>{selectedUnit.name}</strong>
              <span>
                {BAYE_ARMS_LABELS[selectedUnit.armsType]} · 兵 {number.format(selectedUnit.troops)} ·
                等级 {selectedUnit.level} · 移动 {getTacticalUnitMobility(selectedUnit)} · 普攻 {getTacticalNormalAttackLabel(selectedUnit)}
              </span>
              <span>计谋点 {selectedUnit.skillPoints} / {selectedUnit.maxSkillPoints} · 状态 {statusLabel(selectedUnit.status)}</span>
              {selectedUnit.officerId && (battle.experienceGains[selectedUnit.officerId] ?? 0) > 0 && (
                <span>本场经验 +{battle.experienceGains[selectedUnit.officerId]}</span>
              )}
              {selectedTerrain !== undefined && <span>所在地形：{BAYE_TERRAIN_LABELS[selectedTerrain]}</span>}
              {selectedEquipment.length > 0 && <span>装备：{selectedEquipment.join('、')}</span>}
              {battle.commanderUnitIds[selectedUnit.side] === selectedUnit.id && <span>身份：本方主将（败退即战败）</span>}
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
                  预览攻击 {battle.units[unitId].name}
                  （预计 {previewTacticalAttack(battle, selectedUnit.id, unitId).damage}）
                </button>
              ))}
            </div>
          )}
          {selectedUnit && (
            <div className="battle-skill-list" aria-label="计谋列表">
              <span className="battle-skill-reason">
                技能来源：现代数据驱动规则；原版兵种技能 ID 资源尚未进入可再分发基线。
              </span>
              {selectedUnit.officerId ? selectedSkills.map((skill) => {
                const targetIds = getTacticalSkillTargetIds(battle, selectedUnit.id, skill.id);
                const unavailableReason = selectedUnit.status === 'silenced'
                  ? '禁咒状态下无法施展计谋'
                  : selectedUnit.intelligence < skill.minimumIntelligence
                  ? `智力不足（${selectedUnit.intelligence}/${skill.minimumIntelligence}）`
                  : selectedUnit.skillPoints < skill.cost
                    ? `计谋点不足（${selectedUnit.skillPoints}/${skill.cost}）`
                    : selectedUnit.acted
                      ? '本阶段已行动'
                      : targetIds.length === 0
                        ? '范围内没有合法目标'
                        : undefined;
                return (
                  <div className="battle-skill-row" key={skill.id}>
                    <div>
                      <strong>{skill.name}</strong>
                      <span>{skill.description} 范围 {skill.range} · 消耗 {skill.cost} · 智力 {skill.minimumIntelligence}</span>
                    </div>
                    {unavailableReason ? (
                      <span className="battle-skill-reason">{unavailableReason}</span>
                    ) : targetIds.map((unitId) => {
                      const preview = previewTacticalSkill(battle, selectedUnit.id, skill.id, unitId);
                      const change = preview.expectedTroopChange === 0
                        ? ''
                        : ` · ${preview.expectedTroopChange > 0 ? '恢复' : '伤害'} ${Math.abs(preview.expectedTroopChange)}`;
                      const foodChange = preview.expectedFoodChange === 0
                        ? ''
                        : ` · 粮草伤害 ${Math.abs(preview.expectedFoodChange)}`;
                      const status = preview.resultingStatus
                        ? ` · 状态 ${TACTICAL_STATUS_LABELS[preview.resultingStatus]}`
                        : '';
                      return (
                        <button
                          type="button"
                          key={`skill:${skill.id}:${unitId}`}
                          disabled={!canCommand}
                          onClick={() => onUseSkill(skill.id, unitId)}
                        >
                          对 {battle.units[unitId].name}
                          （{preview.successChance}%{change}{foodChange}{status} ·
                          天候×{preview.weatherMultiplier.toFixed(2)} ·
                          地形×{preview.terrainMultiplier.toFixed(2)} ·
                          兵种×{preview.armsMultiplier.toFixed(2)}）
                        </button>
                      );
                    })}
                  </div>
                );
              }) : <span className="battle-skill-reason">守备军无法施展计谋。</span>}
            </div>
          )}
        </div>
        {pendingTarget && pendingAttackPreview && (
          <div className="battle-attack-confirm" role="status">
            <strong>攻击预览：{selectedUnit?.name} → {pendingTarget.name}</strong>
            <span>
              预计伤害 {pendingAttackPreview.damage}，目标剩余 {pendingAttackPreview.targetTroopsAfter}；
              攻方地形修正 {pendingAttackPreview.attackerTerrainShift}，
              守方地形修正 {pendingAttackPreview.defenderTerrainShift}。
            </span>
            <button type="button" className="primary-action" disabled={!canCommand} onClick={onConfirmAttack}>
              确认攻击
            </button>
          </div>
        )}
        <div className="battle-command-actions">
          <button
            type="button"
            disabled={!canCommand || !selectedUnit || selectedUnit.side !== playerSide || selectedUnit.acted}
            onClick={onWait}
          >
            待命
          </button>
          <button type="button" disabled={!canCommand} onClick={onEndSide}>结束本方阶段</button>
          {confirmingRetreat ? (
            <>
              <button
                type="button"
                className="danger-action"
                disabled={!canCommand}
                onClick={() => {
                  setConfirmingRetreat(false);
                  onRetreat();
                }}
              >
                确认全军撤退
              </button>
              <button type="button" onClick={() => setConfirmingRetreat(false)}>取消撤退</button>
            </>
          ) : (
            <button type="button" disabled={!canCommand} onClick={() => setConfirmingRetreat(true)}>
              全军撤退
            </button>
          )}
          <button type="button" className="primary-action" disabled={battle.status === 'ongoing'} onClick={onFinish}>
            结算并返回战略地图
          </button>
        </div>
      </section>

      <details className="battle-log">
        <summary>战场纪录（最近 {Math.min(10, battle.logs.length)} 条）</summary>
        <ol>
          {battle.logs.slice(-10).map((message, index) => <li key={`${battle.logs.length - 10 + index}:${message}`}>{message}</li>)}
        </ol>
      </details>

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
  if (reason === 'attacker-retreated') return '攻方主动全军撤退。';
  if (reason === 'defender-retreated') return '守方主动放弃城池并撤退。';
  if (reason === 'attacker-commander-defeated') return '攻方主将败退。';
  if (reason === 'defender-commander-defeated') return '守方主将败退。';
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
  canCommand,
  playerSide,
  attackableUnitIds,
  onUnitSelected,
}: {
  battle: TacticalBattleState;
  side: 'attacker' | 'defender';
  selectedUnitId?: string;
  canCommand: boolean;
  playerSide: 'attacker' | 'defender';
  attackableUnitIds: string[];
  onUnitSelected: (unitId: string) => void;
}) {
  const units = Object.values(battle.units).filter((unit) => unit.side === side);
  return (
    <div className="battle-unit-list">
      {units.map((unit) => {
        const canSelect = unit.troops > 0 && canCommand && (
          unit.side === playerSide
            ? !unit.acted
            : Boolean(selectedUnitId) && attackableUnitIds.includes(unit.id)
        );
        return (
          <button
            type="button"
            className={`battle-unit-row ${unit.id === selectedUnitId ? 'selected' : ''} ${unit.troops <= 0 ? 'defeated' : ''}`}
            key={unit.id}
            disabled={!canSelect}
            aria-pressed={unit.id === selectedUnitId}
            onClick={() => onUnitSelected(unit.id)}
          >
            <strong>{unit.name}</strong>
            {battle.commanderUnitIds[side] === unit.id && <span>主将</span>}
            <span>{BAYE_ARMS_LABELS[unit.armsType]}</span>
            <span>Lv {unit.level}</span>
            <span>{number.format(unit.troops)} 兵</span>
            <span>{unit.troops <= 0 ? '溃退' : unit.status !== 'normal' ? statusLabel(unit.status) : unit.acted ? '已行动' : '待命'}</span>
          </button>
        );
      })}
    </div>
  );
}

function statusLabel(status: TacticalBattleState['units'][string]['status']): string {
  return TACTICAL_STATUS_LABELS[status];
}
