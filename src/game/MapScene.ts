import Phaser from 'phaser';
import type { GameState } from '../core/types';
import type { GameBridge } from './events';

const WORLD_WIDTH = 1120;
const WORLD_HEIGHT = 680;

export class MapScene extends Phaser.Scene {
  private state: GameState;
  private selectedCityId: string;
  private mapLayer?: Phaser.GameObjects.Container;
  private dragOrigin?: { x: number; y: number; scrollX: number; scrollY: number };

  constructor(
    state: GameState,
    selectedCityId: string,
    private readonly bridge: GameBridge,
  ) {
    super('strategy-map');
    this.state = state;
    this.selectedCityId = selectedCityId;
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.drawBackground();
    this.redrawMap();
    this.fitMap();
    this.bindCameraControls();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fitMap());
  }

  updateMap(state: GameState, selectedCityId: string): void {
    this.state = state;
    this.selectedCityId = selectedCityId;
    if (this.sys.isActive()) this.redrawMap();
  }

  private drawBackground(): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x182c29, 1);
    graphics.fillRoundedRect(18, 18, WORLD_WIDTH - 36, WORLD_HEIGHT - 36, 22);
    graphics.lineStyle(1, 0x49635a, 0.23);
    for (let x = 70; x < WORLD_WIDTH; x += 88) graphics.lineBetween(x, 38, x, WORLD_HEIGHT - 38);
    for (let y = 62; y < WORLD_HEIGHT; y += 76) graphics.lineBetween(38, y, WORLD_WIDTH - 38, y);
    graphics.lineStyle(22, 0x244e55, 0.3);
    const river = new Phaser.Curves.CubicBezier(
      new Phaser.Math.Vector2(70, 470),
      new Phaser.Math.Vector2(340, 420),
      new Phaser.Math.Vector2(540, 600),
      new Phaser.Math.Vector2(1050, 515),
    );
    graphics.strokePoints(river.getPoints(64), false, false);
    graphics.lineStyle(2, 0x668d88, 0.35);
    graphics.strokePoints(river.getPoints(64), false, false);
  }

  private redrawMap(): void {
    this.mapLayer?.destroy(true);
    const layer = this.add.container(0, 0);
    this.mapLayer = layer;

    const roadGraphics = this.add.graphics();
    roadGraphics.lineStyle(3, 0xc7b680, 0.34);
    const cities = Object.values(this.state.cities);
    for (const city of cities) {
      for (const neighborId of city.neighbors) {
        if (city.id.localeCompare(neighborId) >= 0) continue;
        const neighbor = this.state.cities[neighborId];
        if (neighbor) roadGraphics.lineBetween(city.x, city.y, neighbor.x, neighbor.y);
      }
    }
    layer.add(roadGraphics);

    for (const city of cities) {
      const faction = this.state.factions[city.ownerId];
      const color = Phaser.Display.Color.HexStringToColor(faction?.color ?? '#77786f').color;
      const radius = city.type === 'capital' ? 13 : 10;
      if (city.id === this.selectedCityId) {
        const ring = this.add.circle(city.x, city.y, radius + 7, 0xf1d585, 0.14);
        ring.setStrokeStyle(3, 0xf1d585, 0.95);
        layer.add(ring);
      }
      const marker = this.add.circle(city.x, city.y, radius, color, 1);
      marker.setStrokeStyle(city.ownerId === this.state.playerFactionId ? 3 : 2, 0xf4ead0, 0.9);
      marker.setInteractive({ useHandCursor: true });
      marker.on('pointerover', () => marker.setScale(1.18));
      marker.on('pointerout', () => marker.setScale(1));
      marker.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event.stopPropagation();
        this.bridge.emit('city:selected', { cityId: city.id });
      });
      const label = this.add.text(city.x, city.y + radius + 8, city.name, {
        color: '#f7f0dc',
        fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        stroke: '#10211f',
        strokeThickness: 4,
      });
      label.setOrigin(0.5, 0);
      layer.add([marker, label]);
    }
  }

  private bindCameraControls(): void {
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown[], _dx: number, deltaY: number) => {
      const camera = this.cameras.main;
      const worldBefore = camera.getWorldPoint(pointer.x, pointer.y);
      camera.setZoom(Phaser.Math.Clamp(camera.zoom - deltaY * 0.001, 0.55, 1.65));
      const worldAfter = camera.getWorldPoint(pointer.x, pointer.y);
      camera.scrollX += worldBefore.x - worldAfter.x;
      camera.scrollY += worldBefore.y - worldAfter.y;
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, objects: unknown[]) => {
      if (objects.length === 0) {
        this.dragOrigin = {
          x: pointer.x,
          y: pointer.y,
          scrollX: this.cameras.main.scrollX,
          scrollY: this.cameras.main.scrollY,
        };
      }
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || !this.dragOrigin) return;
      const camera = this.cameras.main;
      camera.scrollX = this.dragOrigin.scrollX - (pointer.x - this.dragOrigin.x) / camera.zoom;
      camera.scrollY = this.dragOrigin.scrollY - (pointer.y - this.dragOrigin.y) / camera.zoom;
    });
    this.input.on('pointerup', () => {
      this.dragOrigin = undefined;
    });
  }

  private fitMap(): void {
    const camera = this.cameras.main;
    const zoom = Phaser.Math.Clamp(
      Math.min(this.scale.width / WORLD_WIDTH, this.scale.height / WORLD_HEIGHT) * 0.96,
      0.55,
      1.2,
    );
    camera.setZoom(zoom);
    camera.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  }
}
