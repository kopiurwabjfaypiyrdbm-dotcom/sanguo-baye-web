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
import type { TacticalMapController } from '../game/createBattleGame';
import type { GameBridge } from '../game/events';
import { formatTacticalUnitStatus } from './tacticalBattleUnitStatus';

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
  onCancelAttack: () => void;
  onTileSelected: (position: TacticalPosition) => void;
  onWait: () => void;
  onUseSkill: (skillId: TacticalSkillId, targetUnitId: string) => void;
  onEndSide: () => void;
  onRetreat: () => void;
  onFinish: () => void;
};

type BattlePanel = 'player-roster' | 'enemy-roster' | 'situation' | 'move' | 'attack' | 'skills' | 'details' | 'log';
type ActionMode = 'move' | 'attack';

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
  onCancelAttack,
  onTileSelected,
  onWait,
  onUseSkill,
  onEndSide,
  onRetreat,
  onFinish,
}: TacticalBattleScreenProps) {
  const mapHost = useRef<HTMLDivElement>(null);
  const controller = useRef<TacticalMapController | null>(null);
  const latestMapInput = useRef({ battle, selectedUnitId, reachable, attackableUnitIds });
  const [openPanel, setOpenPanel] = useState<BattlePanel>();
  const [actionMode, setActionMode] = useState<ActionMode>('move');
  const [confirmingRetreat, setConfirmingRetreat] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapLoadError, setMapLoadError] = useState<string>();
  const playerSide = battle.attackerFactionId === campaign.playerFactionId ? 'attacker' : 'defender';
  const enemySide = playerSide === 'attacker' ? 'defender' : 'attacker';
  const selectedUnit = selectedUnitId ? battle.units[selectedUnitId] : undefined;
  const pendingTarget = pendingTargetUnitId ? battle.units[pendingTargetUnitId] : undefined;
  const pendingAttackPreview = selectedUnit && pendingTarget
    ? previewTacticalAttack(battle, selectedUnit.id, pendingTarget.id)
    : undefined;
  const isConfirmingAction = Boolean(pendingTarget) || confirmingRetreat;
  const shownReachable = actionMode === 'move' ? reachable : [];
  const shownAttackable = actionMode === 'attack' ? attackableUnitIds : [];
  latestMapInput.current = { battle, selectedUnitId, reachable: shownReachable, attackableUnitIds: shownAttackable };

  useEffect(() => bridge.on('tactical:unit-selected', ({ unitId }) => onUnitSelected(unitId)), [bridge, onUnitSelected]);
  useEffect(() => bridge.on('tactical:tile-selected', onTileSelected), [bridge, onTileSelected]);

  useEffect(() => {
    if (!mapHost.current) return;
    let cancelled = false;
    let createdController: TacticalMapController | null = null;
    const host = mapHost.current;
    setIsMapReady(false);
    setMapLoadError(undefined);
    void import('../game/createBattleGame')
      .then(({ createTacticalMap }) => {
        if (cancelled) return;
        const latest = latestMapInput.current;
        createdController = createTacticalMap(
          host,
          bridge,
          latest.battle,
          latest.selectedUnitId,
          latest.reachable,
          latest.attackableUnitIds,
        );
        controller.current = createdController;
        setIsMapReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMapLoadError(error instanceof Error ? error.message : '战场模块加载失败');
      });
    return () => {
      cancelled = true;
      createdController?.destroy();
      if (controller.current === createdController) controller.current = null;
    };
    // Phaser is loaded only when the battle screen opens; later updates flow through the controller below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  useEffect(() => {
    controller.current?.update(battle, selectedUnitId, shownReachable, shownAttackable);
  }, [battle, selectedUnitId, shownReachable, shownAttackable]);

  useEffect(() => {
    setActionMode('move');
    setOpenPanel(undefined);
  }, [selectedUnitId]);

  useEffect(() => {
    if (selectedUnit?.moved && !selectedUnit.acted) setActionMode('attack');
    if (selectedUnit?.acted || battle.status !== 'ongoing') setOpenPanel(undefined);
    if (battle.status !== 'ongoing') setConfirmingRetreat(false);
  }, [battle.status, selectedUnit?.acted, selectedUnit?.moved]);

  useEffect(() => {
    if (!openPanel && !isConfirmingAction) return;
    const closeTransientSurface = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (confirmingRetreat) setConfirmingRetreat(false);
      else if (pendingTarget) onCancelAttack();
      else setOpenPanel(undefined);
    };
    window.addEventListener('keydown', closeTransientSurface);
    return () => window.removeEventListener('keydown', closeTransientSurface);
  }, [confirmingRetreat, isConfirmingAction, onCancelAttack, openPanel, pendingTarget]);

  const attacker = campaign.factions[battle.attackerFactionId];
  const defender = campaign.factions[battle.defenderFactionId];
  const activeName = battle.activeSide === 'attacker' ? attacker?.name : defender?.name;
  const canCommand = battle.status === 'ongoing' && battle.activeSide === playerSide && !isResolving;
  const units = Object.values(battle.units);
  const playerUnits = units.filter((unit) => unit.side === playerSide);
  const enemyUnits = units.filter((unit) => unit.side === enemySide);
  const playerTroops = playerUnits.reduce((sum, unit) => sum + Math.max(0, unit.troops), 0);
  const enemyTroops = enemyUnits.reduce((sum, unit) => sum + Math.max(0, unit.troops), 0);
  const unactedCount = units
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

  function togglePanel(panel: BattlePanel) {
    setConfirmingRetreat(false);
    setOpenPanel((current) => current === panel ? undefined : panel);
  }

  function chooseMove(position: TacticalPosition) {
    setOpenPanel(undefined);
    onTileSelected(position);
  }

  function chooseAttackTarget(unitId: string) {
    setActionMode('attack');
    setOpenPanel(undefined);
    onUnitSelected(unitId);
  }

  function useSkill(skillId: TacticalSkillId, unitId: string) {
    setOpenPanel(undefined);
    onUseSkill(skillId, unitId);
  }

  return (
    <main className="battle-shell">
      <header className="battle-top-bar">
        <div className="battle-title-block">
          <p className="eyebrow">Manual battle</p>
          <h1>{campaign.cities[battle.sourceCityId].name} → {campaign.cities[battle.targetCityId].name}</h1>
        </div>
        <div className="battle-vitals" aria-label="战场摘要">
          <span className="active">第 {battle.day}/{battle.maxDays} 日 · {battle.status === 'ongoing' ? `${activeName ?? battle.activeSide}行动` : '战斗结束'}</span>
          <span className="player">我军 {number.format(playerTroops)}</span>
          <span className="enemy">敌军 {number.format(enemyTroops)}</span>
          <span>{TACTICAL_WEATHER_LABELS[battle.weather]} · 未行动 {battle.status === 'ongoing' ? unactedCount : 0}</span>
        </div>
        <nav className="battle-utility-actions" aria-label="战场信息">
          <button type="button" aria-pressed={openPanel === 'player-roster'} onClick={() => togglePanel('player-roster')}>我军</button>
          <button type="button" aria-pressed={openPanel === 'enemy-roster'} onClick={() => togglePanel('enemy-roster')}>敌军</button>
          <button type="button" aria-pressed={openPanel === 'situation'} onClick={() => togglePanel('situation')}>战况</button>
          <button type="button" aria-pressed={openPanel === 'log'} onClick={() => togglePanel('log')}>日志</button>
        </nav>
      </header>

      <section className="battle-main">
        <div className="battle-map-host" ref={mapHost} aria-label="战术地图" aria-busy={!isMapReady} />
        {!isMapReady && (
          <div className={`canvas-loading battle-canvas-loading ${mapLoadError ? 'error' : ''}`} role={mapLoadError ? 'alert' : 'status'}>
            <strong>{mapLoadError ? '战术地图加载失败' : '正在布置战场'}</strong>
            <span>{mapLoadError ? '请刷新页面，从战前检查点恢复。' : '正在载入战场绘制模块。'}</span>
          </div>
        )}
        {openPanel && (
          <aside className={`battle-edge-panel ${openPanel === 'enemy-roster' ? 'from-right' : ''}`} aria-label={panelTitle(openPanel)}>
            <header>
              <div>
                <p className="panel-kicker">Battle information</p>
                <h2>{panelTitle(openPanel)}</h2>
              </div>
              <button type="button" aria-label="关闭战场面板" onClick={() => setOpenPanel(undefined)}>×</button>
            </header>

            {openPanel === 'player-roster' && (
              <UnitRoster
                battle={battle}
                side={playerSide}
                selectedUnitId={selectedUnitId}
                canCommand={canCommand}
                playerSide={playerSide}
                attackableUnitIds={attackableUnitIds}
                onUnitSelected={(unitId) => {
                  setOpenPanel(undefined);
                  onUnitSelected(unitId);
                }}
              />
            )}
            {openPanel === 'enemy-roster' && (
              <UnitRoster
                battle={battle}
                side={enemySide}
                selectedUnitId={selectedUnitId}
                canCommand={canCommand}
                playerSide={playerSide}
                attackableUnitIds={attackableUnitIds}
                onUnitSelected={chooseAttackTarget}
              />
            )}
            {openPanel === 'situation' && (
              <div className="battle-situation-grid">
                <span><strong>战场</strong>{TACTICAL_BATTLEFIELD_LABELS[battle.battlefieldTemplate]}</span>
                <span><strong>进军</strong>{TACTICAL_APPROACH_LABELS[battle.approach]}</span>
                <span><strong>天气</strong>{TACTICAL_WEATHER_LABELS[battle.weather]}</span>
                <span><strong>身份</strong>玩家为{playerSide === 'attacker' ? '攻方' : '守方'}</span>
                <span><strong>攻方粮</strong>{number.format(battle.attackerFood)} · 日耗 {attackerUse} · 约 {Math.ceil(battle.attackerFood / attackerUse)} 日</span>
                <span><strong>守方粮</strong>{number.format(battle.defenderFood)} · 日耗 {defenderUse} · 约 {Math.ceil(battle.defenderFood / defenderUse)} 日</span>
                <p>攻方占领城池并结束本方阶段可获胜；任一方主将败退、粮尽或全军溃退也会结束战斗。</p>
              </div>
            )}
            {openPanel === 'move' && selectedUnit && (
              <div className="battle-target-list">
                <p>也可直接点击地图上的青色格；以下按钮保留键盘与精确坐标操作。</p>
                {reachable.length > 0 ? reachable.map((position) => (
                  <button type="button" key={`${position.x}:${position.y}`} onClick={() => chooseMove(position)}>
                    <strong>{position.x + 1},{position.y + 1}</strong>
                    <span>移动消耗 {getTacticalPathCost(battle, selectedUnit.id, position) ?? '?'}</span>
                  </button>
                )) : <p>当前没有可移动位置。</p>}
              </div>
            )}
            {openPanel === 'attack' && selectedUnit && (
              <div className="battle-target-list">
                <p>选择目标后会先显示伤害预览，确认才会执行。</p>
                {attackableUnitIds.length > 0 ? attackableUnitIds.map((unitId) => {
                  const preview = previewTacticalAttack(battle, selectedUnit.id, unitId);
                  return (
                    <button type="button" key={unitId} onClick={() => chooseAttackTarget(unitId)}>
                      <strong>{battle.units[unitId].name}</strong>
                      <span>预计伤害 {preview.damage} · 剩余 {preview.targetTroopsAfter}</span>
                    </button>
                  );
                }) : <p>当前没有处于普攻范围内的目标。</p>}
              </div>
            )}
            {openPanel === 'skills' && selectedUnit && (
              <SkillList
                battle={battle}
                selectedUnit={selectedUnit}
                skills={selectedSkills}
                canCommand={canCommand}
                onUseSkill={useSkill}
              />
            )}
            {openPanel === 'details' && selectedUnit && (
              <div className="battle-unit-details">
                <h3>{selectedUnit.name} · {BAYE_ARMS_LABELS[selectedUnit.armsType]}</h3>
                <dl>
                  <div><dt>兵力</dt><dd>{number.format(selectedUnit.troops)}</dd></div>
                  <div><dt>等级</dt><dd>{selectedUnit.level}</dd></div>
                  <div><dt>移动</dt><dd>{getTacticalUnitMobility(selectedUnit)}</dd></div>
                  <div><dt>普攻</dt><dd>{getTacticalNormalAttackLabel(selectedUnit)}</dd></div>
                  <div><dt>计谋点</dt><dd>{selectedUnit.skillPoints}/{selectedUnit.maxSkillPoints}</dd></div>
                  <div><dt>状态</dt><dd>{statusLabel(selectedUnit.status)}</dd></div>
                  <div><dt>地形</dt><dd>{selectedTerrain === undefined ? '未知' : BAYE_TERRAIN_LABELS[selectedTerrain]}</dd></div>
                  <div><dt>行动</dt><dd>{selectedUnit.acted ? '已行动' : selectedUnit.moved ? '已移动' : '待命'}</dd></div>
                </dl>
                {selectedEquipment.length > 0 && <p>装备：{selectedEquipment.join('、')}</p>}
                {selectedUnit.officerId && (battle.experienceGains[selectedUnit.officerId] ?? 0) > 0 && <p>本场经验 +{battle.experienceGains[selectedUnit.officerId]}</p>}
                {battle.commanderUnitIds[selectedUnit.side] === selectedUnit.id && <p className="danger-note">本方主将：败退即战败。</p>}
              </div>
            )}
            {openPanel === 'log' && (
              <div className="battle-log-list">
                <ol>{battle.logs.slice(-20).map((message, index) => <li key={`${battle.logs.length - 20 + index}:${message}`}>{message}</li>)}</ol>
              </div>
            )}
          </aside>
        )}
      </section>

      <section className="battle-command-bar">
        {feedback && (
          <div className={`battle-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
            {feedback.message}
          </div>
        )}

        {pendingTarget && pendingAttackPreview && (
          <div className="battle-attack-confirm" role="dialog" aria-label="确认普通攻击">
            <div>
              <strong>{selectedUnit?.name} → {pendingTarget.name}</strong>
              <span>预计伤害 {pendingAttackPreview.damage} · 目标剩余 {pendingAttackPreview.targetTroopsAfter} · 地形修正 {pendingAttackPreview.attackerTerrainShift}/{pendingAttackPreview.defenderTerrainShift}</span>
            </div>
            <button type="button" autoFocus onClick={onCancelAttack}>取消</button>
            <button type="button" className="primary-action" disabled={!canCommand} onClick={onConfirmAttack}>确认攻击</button>
          </div>
        )}

        {confirmingRetreat && (
          <div className="battle-retreat-confirm" role="alertdialog" aria-label="确认全军撤退">
            <span>全军撤退会立即判负，是否确认？</span>
            <button type="button" autoFocus onClick={() => setConfirmingRetreat(false)}>取消</button>
            <button type="button" className="danger-action" disabled={!canCommand} onClick={() => { setConfirmingRetreat(false); onRetreat(); }}>确认撤退</button>
          </div>
        )}

        <button type="button" className="battle-selection-card" aria-label="current unit status" disabled={!selectedUnit || isConfirmingAction} onClick={() => togglePanel('details')}>
          {selectedUnit ? (
            <>
              <strong>{selectedUnit.name}</strong>
              <span>{formatTacticalUnitStatus(selectedUnit, BAYE_ARMS_LABELS[selectedUnit.armsType], statusLabel(selectedUnit.status))}</span>
              <small>{selectedTerrain === undefined ? '选择单位详情' : `${BAYE_TERRAIN_LABELS[selectedTerrain]} · 计谋点 ${selectedUnit.skillPoints}/${selectedUnit.maxSkillPoints}`}</small>
            </>
          ) : <span>{canCommand ? '点击战场或我军名单选择单位' : isResolving ? '敌方正在行动……' : '等待战斗结算'}</span>}
        </button>

        <div className="battle-command-actions" aria-label="当前单位动作">
          {battle.status === 'ongoing' ? (
            <>
              <button type="button" className={actionMode === 'move' ? 'active' : undefined} disabled={isConfirmingAction || !canCommand || !selectedUnit || selectedUnit.moved || selectedUnit.acted} onClick={() => { setActionMode('move'); togglePanel('move'); }}>
                <strong>移动</strong><span>{reachable.length} 格</span>
              </button>
              <button type="button" className={actionMode === 'attack' ? 'active' : undefined} disabled={isConfirmingAction || !canCommand || !selectedUnit || selectedUnit.acted} onClick={() => { setActionMode('attack'); togglePanel('attack'); }}>
                <strong>普攻</strong><span>{attackableUnitIds.length} 目标</span>
              </button>
              <button type="button" disabled={isConfirmingAction || !canCommand || !selectedUnit || selectedUnit.acted || !selectedUnit.officerId} onClick={() => togglePanel('skills')}>
                <strong>计谋</strong><span>{selectedSkills.length} 项</span>
              </button>
              <button type="button" disabled={isConfirmingAction || !canCommand || !selectedUnit || selectedUnit.acted} onClick={onWait}>
                <strong>待命</strong><span>结束行动</span>
              </button>
              <button type="button" disabled={isConfirmingAction || !canCommand} onClick={onEndSide}>
                <strong>结束阶段</strong><span>{unactedCount} 队未动</span>
              </button>
              <button type="button" className="danger-action" disabled={isConfirmingAction || !canCommand} onClick={() => { setOpenPanel(undefined); setConfirmingRetreat(true); }}>
                <strong>撤退</strong><span>立即判负</span>
              </button>
            </>
          ) : (
            <button type="button" className="primary-action battle-finish-action" onClick={onFinish}>
              <strong>结算并返回战略地图</strong>
            </button>
          )}
        </div>
      </section>

      {battle.status !== 'ongoing' && (
        <div className={`battle-outcome ${battle.status}`} role="status" aria-live="assertive">
          <strong>{battle.status === 'attacker-won' ? '攻方胜利' : '守方胜利'}</strong>
          <span>{victoryReasonLabel(battle.victoryReason)}</span>
        </div>
      )}
    </main>
  );
}

function SkillList({
  battle,
  selectedUnit,
  skills,
  canCommand,
  onUseSkill,
}: {
  battle: TacticalBattleState;
  selectedUnit: TacticalBattleState['units'][string];
  skills: Array<(typeof TACTICAL_SKILLS)[TacticalSkillId]>;
  canCommand: boolean;
  onUseSkill: (skillId: TacticalSkillId, targetUnitId: string) => void;
}) {
  return (
    <div className="battle-skill-list" aria-label="计谋列表">
      <p className="battle-skill-reason">技能采用现代数据驱动规则；原版兵种技能资源尚未进入可再分发基线。</p>
      {skills.map((skill) => {
        const targetIds = getTacticalSkillTargetIds(battle, selectedUnit.id, skill.id);
        const unavailableReason = selectedUnit.status === 'silenced'
          ? '禁咒状态下无法施展'
          : selectedUnit.intelligence < skill.minimumIntelligence
            ? `智力不足（${selectedUnit.intelligence}/${skill.minimumIntelligence}）`
            : selectedUnit.skillPoints < skill.cost
              ? `计谋点不足（${selectedUnit.skillPoints}/${skill.cost}）`
              : selectedUnit.acted
                ? '本阶段已行动'
                : targetIds.length === 0 ? '范围内没有合法目标' : undefined;
        return (
          <article className="battle-skill-row" key={skill.id}>
            <div>
              <strong>{skill.name}</strong>
              <span>{skill.description}</span>
              <small>范围 {skill.range} · 消耗 {skill.cost} · 智力 {skill.minimumIntelligence}</small>
            </div>
            {unavailableReason ? <span className="battle-skill-reason">{unavailableReason}</span> : (
              <div className="battle-skill-targets">
                {targetIds.map((unitId) => {
                  const preview = previewTacticalSkill(battle, selectedUnit.id, skill.id, unitId);
                  const effect = preview.expectedTroopChange === 0
                    ? preview.expectedFoodChange === 0 ? '' : `粮伤 ${Math.abs(preview.expectedFoodChange)}`
                    : `${preview.expectedTroopChange > 0 ? '恢复' : '伤害'} ${Math.abs(preview.expectedTroopChange)}`;
                  const resultingStatus = preview.resultingStatus ? ` · ${TACTICAL_STATUS_LABELS[preview.resultingStatus]}` : '';
                  return (
                    <button type="button" key={unitId} disabled={!canCommand} onClick={() => onUseSkill(skill.id, unitId)}>
                      <strong>{battle.units[unitId].name}</strong>
                      <span>{preview.successChance}% · {effect}{resultingStatus}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function panelTitle(panel: BattlePanel): string {
  if (panel === 'player-roster') return '我军队伍';
  if (panel === 'enemy-roster') return '敌军队伍';
  if (panel === 'situation') return '战况与胜负条件';
  if (panel === 'move') return '选择移动位置';
  if (panel === 'attack') return '选择普攻目标';
  if (panel === 'skills') return '选择计谋与目标';
  if (panel === 'details') return '单位详情';
  return '战场纪录';
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
