import Phaser from 'phaser';
import { BAYE_TERRAINS } from '../compat/baye/tacticalBattle';
import { getTacticalPath, type TacticalBattleState, type TacticalPosition } from '../core/tacticalBattle';
import { TACTICAL_UNIT_ART, getTacticalUnitArt } from './tacticalUnitArt';
import {
  getTacticalUnitAnimationKey,
  TACTICAL_UNIT_ANIMATIONS,
  TACTICAL_UNIT_ANIMATION_STATES,
  type TacticalUnitAnimationSheet,
  type TacticalUnitAnimationState,
} from './tacticalUnitAnimation';
import type { GameBridge } from './events';

const CELL_SIZE = 68;
const OFFSET_X = 66;
const OFFSET_Y = 48;
const WORLD_WIDTH = 950;
const WORLD_HEIGHT = 640;

const terrainColors = [
  0x72905f,
  0x9ba76b,
  0x9b8965,
  0x426b4e,
  0xb58d62,
  0x8b5a45,
  0x78664f,
  0x477f8a,
] as const;

const terrainLabels = ['草', '原', '山', '林', '村', '城', '营', '水'] as const;

export class BattleScene extends Phaser.Scene {
  private battle: TacticalBattleState;
  private selectedUnitId?: string;
  private reachable: TacticalPosition[] = [];
  private attackableUnitIds: string[] = [];
  private battleLayer?: Phaser.GameObjects.Container;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private unitAnimationStates = new Map<string, TacticalUnitAnimationState>();
  private unitAnimationTimers = new Map<string, Phaser.Time.TimerEvent>();

  constructor(
    battle: TacticalBattleState,
    selectedUnitId: string | undefined,
    reachable: TacticalPosition[],
    attackableUnitIds: string[],
    private readonly bridge: GameBridge,
  ) {
    super('tactical-battle');
    this.battle = battle;
    this.selectedUnitId = selectedUnitId;
    this.reachable = reachable;
    this.attackableUnitIds = attackableUnitIds;
  }

  preload(): void {
    for (const art of Object.values(TACTICAL_UNIT_ART)) {
      this.load.image(art.key, art.source);
    }
    for (const animation of Object.values(TACTICAL_UNIT_ANIMATIONS)) {
      this.load.spritesheet(animation.key, animation.source, {
        frameWidth: animation.frameWidth,
        frameHeight: animation.frameHeight,
        endFrame: animation.frameCount - 1,
      });
    }
  }

  create(): void {
    for (const [armsTypeValue, animation] of Object.entries(TACTICAL_UNIT_ANIMATIONS) as Array<[string, TacticalUnitAnimationSheet]>) {
      const armsType = Number(armsTypeValue) as keyof typeof TACTICAL_UNIT_ANIMATIONS;
      for (const [state, config] of Object.entries(TACTICAL_UNIT_ANIMATION_STATES) as Array<[TacticalUnitAnimationState, (typeof TACTICAL_UNIT_ANIMATION_STATES)[TacticalUnitAnimationState]]>) {
        this.anims.create({
          key: getTacticalUnitAnimationKey(armsType, state),
          frames: this.anims.generateFrameNumbers(animation.key, {
            start: config.startFrame,
            end: config.endFrame,
          }),
          frameRate: config.frameRate,
          repeat: config.repeat,
        });
      }
    }
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.redraw();
    this.fitBattlefield();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.beginPan, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.panBattlefield, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.beginPan, this);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.panBattlefield, this);
      for (const timer of this.unitAnimationTimers.values()) timer.remove(false);
      this.unitAnimationTimers.clear();
    });
  }

  updateBattle(
    battle: TacticalBattleState,
    selectedUnitId: string | undefined,
    reachable: TacticalPosition[],
    attackableUnitIds: string[],
  ): void {
    const previousBattle = this.battle;
    this.battle = battle;
    this.selectedUnitId = selectedUnitId;
    this.reachable = reachable;
    this.attackableUnitIds = attackableUnitIds;
    for (const unit of Object.values(battle.units)) {
      const previous = previousBattle.units[unit.id];
      if (!previous) continue;
      if (unit.troops < previous.troops) this.setUnitAnimationState(unit.id, 'hit', 520);
      else if (unit.x !== previous.x || unit.y !== previous.y) this.setUnitAnimationState(unit.id, 'move', 720);
    }
    if (this.sys.isActive()) this.redraw();
  }

  playUnitAction(unitId: string, action: TacticalUnitAnimationState): void {
    if (!this.battle.units[unitId]) return;
    const duration = action === 'attack' ? 620 : action === 'hit' ? 520 : action === 'move' ? 720 : undefined;
    this.setUnitAnimationState(unitId, action, duration);
    if (this.sys.isActive()) this.redraw();
  }

  private setUnitAnimationState(unitId: string, state: TacticalUnitAnimationState, resetAfterMs?: number): void {
    const existing = this.unitAnimationTimers.get(unitId);
    existing?.remove(false);
    this.unitAnimationTimers.delete(unitId);
    this.unitAnimationStates.set(unitId, state);
    if (resetAfterMs === undefined || state === 'idle') return;
    const timer = this.time.delayedCall(resetAfterMs, () => {
      this.unitAnimationTimers.delete(unitId);
      this.unitAnimationStates.set(unitId, 'idle');
      if (this.sys.isActive()) this.redraw();
    });
    this.unitAnimationTimers.set(unitId, timer);
  }

  private redraw(): void {
    this.battleLayer?.destroy(true);
    const layer = this.add.container(0, 0);
    this.battleLayer = layer;
    const reachable = new Set(this.reachable.map((position) => `${position.x},${position.y}`));
    const attackable = new Set(this.attackableUnitIds);
    const pathPreview = this.add.graphics();

    const backdrop = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH - 24, WORLD_HEIGHT - 24, 0x132522, 1);
    backdrop.setStrokeStyle(2, 0x60756a, 0.45);
    layer.add(backdrop);

    for (const tile of this.battle.tiles) {
      const centerX = OFFSET_X + tile.x * CELL_SIZE + CELL_SIZE / 2;
      const centerY = OFFSET_Y + tile.y * CELL_SIZE + CELL_SIZE / 2;
      const isReachable = reachable.has(`${tile.x},${tile.y}`);
      const rect = this.add.rectangle(centerX, centerY, CELL_SIZE - 2, CELL_SIZE - 2, terrainColors[tile.terrain], 0.92);
      rect.setStrokeStyle(isReachable ? 4 : 1, isReachable ? 0x7ed9ed : 0x233c36, isReachable ? 0.95 : 0.65);
      if (isReachable) {
        rect.setInteractive({ useHandCursor: true });
        rect.on('pointerup', (pointer: Phaser.Input.Pointer) => {
          if (pointer.getDistance() > 10) return;
          this.bridge.emit('tactical:tile-selected', { x: tile.x, y: tile.y });
        });
        rect.on('pointerover', () => {
          pathPreview.clear();
          if (!this.selectedUnitId) return;
          const path = getTacticalPath(this.battle, this.selectedUnitId, tile);
          if (path.length < 2) return;
          pathPreview.lineStyle(5, 0x9ae8f5, 0.9);
          pathPreview.beginPath();
          pathPreview.moveTo(
            OFFSET_X + path[0].x * CELL_SIZE + CELL_SIZE / 2,
            OFFSET_Y + path[0].y * CELL_SIZE + CELL_SIZE / 2,
          );
          for (const position of path.slice(1)) {
            pathPreview.lineTo(
              OFFSET_X + position.x * CELL_SIZE + CELL_SIZE / 2,
              OFFSET_Y + position.y * CELL_SIZE + CELL_SIZE / 2,
            );
          }
          pathPreview.strokePath();
        });
        rect.on('pointerout', () => pathPreview.clear());
      }
      const label = this.add.text(centerX - CELL_SIZE / 2 + 5, centerY - CELL_SIZE / 2 + 3, terrainLabels[tile.terrain], {
        color: tile.terrain === BAYE_TERRAINS.indexOf('river') ? '#d9f5ff' : '#f2ecd8',
        fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
      });
      label.setAlpha(0.72);
      layer.add([rect, label]);
      if (tile.objective === 'city') {
        const objective = this.add.text(centerX, centerY + 20, '目标', {
          color: '#ffe3a0',
          fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
          fontSize: '10px',
          fontStyle: 'bold',
          backgroundColor: '#59392dcc',
          padding: { x: 4, y: 1 },
        }).setOrigin(0.5);
        layer.add(objective);
      }
    }
    layer.add(pathPreview);

    for (const unit of Object.values(this.battle.units).filter((candidate) => candidate.troops > 0)) {
      const centerX = OFFSET_X + unit.x * CELL_SIZE + CELL_SIZE / 2;
      const centerY = OFFSET_Y + unit.y * CELL_SIZE + CELL_SIZE / 2;
      const selected = unit.id === this.selectedUnitId;
      const canAttack = attackable.has(unit.id);
      const color = unit.side === 'attacker' ? 0xb85f43 : 0x416fa4;
      const feedback = this.add.ellipse(centerX, centerY + 24, selected ? 52 : 46, selected ? 15 : 12, color, unit.acted ? 0.18 : 0.32);
      feedback.setStrokeStyle(selected ? 4 : canAttack ? 4 : 2, selected ? 0xffdf80 : canAttack ? 0xff776d : 0xf4ead0, 1);

      const art = getTacticalUnitArt(unit.armsType);
      const animation = TACTICAL_UNIT_ANIMATIONS[unit.armsType];
      const animationState = this.unitAnimationStates.get(unit.id) ?? 'idle';
      const sprite = this.textures.exists(animation.key)
        ? this.add.sprite(centerX, centerY + 27, animation.key)
            .setDisplaySize(54, 54)
            .setOrigin(0.5, 1)
            .play(getTacticalUnitAnimationKey(unit.armsType, animationState))
        : this.textures.exists(art.key)
        ? this.add.image(centerX, centerY + 27, art.key).setDisplaySize(54, 54).setOrigin(0.5, 1)
        : this.add.circle(centerX, centerY - 2, 18, color, unit.acted ? 0.48 : 0.96);
      sprite.setAlpha(unit.acted ? 0.52 : 1);

      const hitTarget = this.add.zone(centerX, centerY, 58, 64).setInteractive({ useHandCursor: true });
      hitTarget.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (pointer.getDistance() > 10) return;
        pointer.event.stopPropagation();
        this.bridge.emit('tactical:unit-selected', { unitId: unit.id });
      });
      layer.add([feedback, sprite, hitTarget]);
    }

    const footer = this.add.text(WORLD_WIDTH / 2, WORLD_HEIGHT - 22, '青色：可移动格 · 拖动：查看战场 · 攻方占城后需结束本方阶段', {
      color: '#c7d5ca',
      fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
      fontSize: '13px',
    }).setOrigin(0.5);
    layer.add(footer);
  }

  private fitBattlefield(): void {
    const camera = this.cameras.main;
    const containZoom = Math.min(this.scale.width / WORLD_WIDTH, this.scale.height / WORLD_HEIGHT) * 0.98;
    const mapIsWiderThanWorld = this.scale.width / Math.max(1, this.scale.height) > WORLD_WIDTH / WORLD_HEIGHT;
    const readableLandscapeZoom = mapIsWiderThanWorld ? this.scale.width / WORLD_WIDTH * 0.92 : containZoom;
    const zoom = Phaser.Math.Clamp(
      Math.max(containZoom, readableLandscapeZoom),
      0.25,
      1.25,
    );
    camera.setZoom(zoom);
    camera.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  }

  private handleResize(): void {
    this.fitBattlefield();
  }

  private beginPan(pointer: Phaser.Input.Pointer): void {
    this.lastPointerX = pointer.x;
    this.lastPointerY = pointer.y;
  }

  private panBattlefield(pointer: Phaser.Input.Pointer): void {
    if (!pointer.isDown) return;
    const deltaX = pointer.x - this.lastPointerX;
    const deltaY = pointer.y - this.lastPointerY;
    this.lastPointerX = pointer.x;
    this.lastPointerY = pointer.y;
    if (pointer.getDistance() <= 8) return;
    const camera = this.cameras.main;
    camera.scrollX -= deltaX / camera.zoom;
    camera.scrollY -= deltaY / camera.zoom;
  }
}
