import Phaser from 'phaser';
import { BAYE_TERRAINS } from '../compat/baye/tacticalBattle';
import { getTacticalPath, type TacticalBattleState, type TacticalPosition } from '../core/tacticalBattle';
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

  create(): void {
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
    });
  }

  updateBattle(
    battle: TacticalBattleState,
    selectedUnitId: string | undefined,
    reachable: TacticalPosition[],
    attackableUnitIds: string[],
  ): void {
    this.battle = battle;
    this.selectedUnitId = selectedUnitId;
    this.reachable = reachable;
    this.attackableUnitIds = attackableUnitIds;
    if (this.sys.isActive()) this.redraw();
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
      const marker = this.add.circle(centerX, centerY - 5, selected ? 23 : 20, color, unit.acted ? 0.48 : 0.96);
      marker.setStrokeStyle(selected ? 4 : canAttack ? 4 : 2, selected ? 0xffdf80 : canAttack ? 0xff776d : 0xf4ead0, 1);
      marker.setInteractive({ useHandCursor: true });
      marker.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (pointer.getDistance() > 10) return;
        pointer.event.stopPropagation();
        this.bridge.emit('tactical:unit-selected', { unitId: unit.id });
      });
      const name = this.add.text(centerX, centerY - 10, unit.name.slice(0, 4), {
        color: '#fff7df',
        fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        stroke: '#1b2824',
        strokeThickness: 3,
      }).setOrigin(0.5);
      const troops = this.add.text(centerX, centerY + 13, String(unit.troops), {
        color: '#fff2c8',
        fontFamily: 'Consolas, monospace',
        fontSize: '10px',
        backgroundColor: '#17231fd9',
        padding: { x: 3, y: 1 },
      }).setOrigin(0.5);
      layer.add([marker, name, troops]);
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
