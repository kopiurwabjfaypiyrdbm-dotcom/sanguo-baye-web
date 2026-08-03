import Phaser from 'phaser';
import type { GameState } from '../core/types';
import type { GameBridge } from './events';

const WORLD_WIDTH = 1120;
const WORLD_HEIGHT = 680;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.8;
const MAX_TERRITORY_ZOOM = 1.45;

type CameraMode = 'territory' | 'world' | 'manual';

export class MapScene extends Phaser.Scene {
  private state: GameState;
  private selectedCityId: string;
  private mapLayer?: Phaser.GameObjects.Container;
  private dragOrigin?: { x: number; y: number; scrollX: number; scrollY: number };
  private pointerDownAt = new Map<number, { x: number; y: number }>();
  private cityPointerReleased = new Set<number>();
  private lastPinchDistance?: number;
  private cameraMode: CameraMode = 'territory';
  private lastAnchorKey = '';

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
    this.focusPlayerTerritory();
    this.bindCameraControls();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.restoreCameraFraming, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.restoreCameraFraming, this);
    });
  }

  updateMap(state: GameState, selectedCityId: string): void {
    this.state = state;
    this.selectedCityId = selectedCityId;
    if (this.sys.isActive()) this.redrawMap();
  }

  update(): void {
    this.publishCityAnchor(this.selectedCityId);
  }

  focusPlayerTerritory(): void {
    this.cameraMode = 'territory';
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    const owned = Object.values(this.state.cities)
      .filter((city) => city.ownerId === this.state.playerFactionId);
    const contextualIds = new Set(owned.flatMap((city) => [city.id, ...city.neighbors]));
    const contextualCities = [...contextualIds]
      .map((cityId) => this.state.cities[cityId])
      .filter((city) => Boolean(city));
    this.frameCities(contextualCities.length > 0 ? contextualCities : owned);
  }

  showWholeMap(): void {
    this.cameraMode = 'world';
    const camera = this.cameras.main;
    const zoom = Phaser.Math.Clamp(
      Math.min(this.scale.width / WORLD_WIDTH, this.scale.height / WORLD_HEIGHT) * 0.96,
      MIN_ZOOM,
      1.2,
    );
    camera.setZoom(zoom);
    const visibleWorldWidth = this.scale.width / zoom;
    const visibleWorldHeight = this.scale.height / zoom;
    const horizontalMargin = Math.max(0, visibleWorldWidth - WORLD_WIDTH);
    const verticalMargin = Math.max(0, visibleWorldHeight - WORLD_HEIGHT);
    camera.setBounds(
      -horizontalMargin / 2,
      -verticalMargin / 2,
      WORLD_WIDTH + horizontalMargin,
      WORLD_HEIGHT + verticalMargin,
    );
    camera.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
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
      const radius = city.type === 'capital' ? 16 : 13;
      const isOwned = city.ownerId === this.state.playerFactionId;
      if (isOwned) {
        const ownedRing = this.add.circle(city.x, city.y, radius + 4, 0xe4c46e, 0.06);
        ownedRing.setStrokeStyle(2, 0xe4c46e, 0.95);
        const banner = this.add.rectangle(city.x + radius + 6, city.y - radius - 4, 7, 10, 0xe4c46e, 0.95);
        banner.setStrokeStyle(1, 0x2a382e, 0.8);
        layer.add([ownedRing, banner]);
      }
      if (city.id === this.selectedCityId) {
        const ring = this.add.circle(city.x, city.y, radius + 10, 0xffffff, 0.1);
        ring.setStrokeStyle(4, 0xfff2bd, 1);
        layer.add(ring);
      }
      const marker = this.add.circle(city.x, city.y, radius, color, 1);
      marker.setStrokeStyle(2, 0xf4ead0, 0.88);
      const hitTarget = this.add.zone(city.x, city.y, 48, 48).setInteractive({ useHandCursor: true });
      hitTarget.on('pointerover', () => marker.setScale(1.16));
      hitTarget.on('pointerout', () => marker.setScale(1));
      hitTarget.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        const startedAt = this.pointerDownAt.get(pointer.id);
        if (!startedAt || Phaser.Math.Distance.Between(startedAt.x, startedAt.y, pointer.x, pointer.y) > 10) return;
        this.cityPointerReleased.add(pointer.id);
        this.bridge.emit('city:selected', { cityId: city.id });
        this.publishCityAnchor(city.id, true);
      });
      const label = this.add.text(city.x, city.y + radius + 8, city.name, {
        color: '#f7f0dc',
        fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        stroke: '#10211f',
        strokeThickness: 4,
      });
      label.setOrigin(0.5, 0);
      if (city.type === 'capital') {
        const capitalMark = this.add.text(city.x, city.y - radius - 11, '◆', {
          color: isOwned ? '#f3d47d' : '#e8dcc0',
          fontSize: '11px',
          stroke: '#10211f',
          strokeThickness: 3,
        }).setOrigin(0.5);
        layer.add(capitalMark);
      }
      layer.add([marker, label, hitTarget]);
    }
  }

  private bindCameraControls(): void {
    this.input.addPointer(1);
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown[], _dx: number, deltaY: number) => {
      this.cameraMode = 'manual';
      const camera = this.cameras.main;
      const worldBefore = camera.getWorldPoint(pointer.x, pointer.y);
      camera.setZoom(Phaser.Math.Clamp(camera.zoom - deltaY * 0.001, MIN_ZOOM, MAX_ZOOM));
      const worldAfter = camera.getWorldPoint(pointer.x, pointer.y);
      camera.scrollX += worldBefore.x - worldAfter.x;
      camera.scrollY += worldBefore.y - worldAfter.y;
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerDownAt.set(pointer.id, { x: pointer.x, y: pointer.y });
      this.dragOrigin = {
        x: pointer.x,
        y: pointer.y,
        scrollX: this.cameras.main.scrollX,
        scrollY: this.cameras.main.scrollY,
      };
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const first = this.input.pointer1;
      const second = this.input.pointer2;
      if (first.isDown && second.isDown) {
        const distance = Phaser.Math.Distance.Between(first.x, first.y, second.x, second.y);
        if (this.lastPinchDistance && this.lastPinchDistance > 0) {
          const camera = this.cameras.main;
          const centerX = (first.x + second.x) / 2;
          const centerY = (first.y + second.y) / 2;
          const worldBefore = camera.getWorldPoint(centerX, centerY);
          camera.setZoom(Phaser.Math.Clamp(
            camera.zoom * (distance / this.lastPinchDistance),
            MIN_ZOOM,
            MAX_ZOOM,
          ));
          const worldAfter = camera.getWorldPoint(centerX, centerY);
          camera.scrollX += worldBefore.x - worldAfter.x;
          camera.scrollY += worldBefore.y - worldAfter.y;
          this.cameraMode = 'manual';
        }
        this.lastPinchDistance = distance;
        this.dragOrigin = undefined;
        return;
      }
      this.lastPinchDistance = undefined;
      if (!pointer.isDown || !this.dragOrigin) return;
      const camera = this.cameras.main;
      camera.scrollX = this.dragOrigin.scrollX - (pointer.x - this.dragOrigin.x) / camera.zoom;
      camera.scrollY = this.dragOrigin.scrollY - (pointer.y - this.dragOrigin.y) / camera.zoom;
      if (Phaser.Math.Distance.Between(this.dragOrigin.x, this.dragOrigin.y, pointer.x, pointer.y) > 4) {
        this.cameraMode = 'manual';
      }
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const startedAt = this.pointerDownAt.get(pointer.id);
      this.dragOrigin = undefined;
      this.lastPinchDistance = undefined;
      // Phaser's global pointerup can run before an interactive zone's pointerup.
      // Defer cleanup one tick so a city hit can mark the pointer first.
      this.time.delayedCall(0, () => {
        const selectedCity = this.cityPointerReleased.delete(pointer.id);
        if (!selectedCity && startedAt
          && Phaser.Math.Distance.Between(startedAt.x, startedAt.y, pointer.x, pointer.y) <= 10) {
          this.bridge.emit('map:cleared', {});
        }
        this.pointerDownAt.delete(pointer.id);
      });
    });
  }

  private restoreCameraFraming(): void {
    if (this.cameraMode === 'world') this.showWholeMap();
    else if (this.cameraMode === 'territory') this.focusPlayerTerritory();
  }

  private frameCities(cities: Array<GameState['cities'][string]>): void {
    if (cities.length === 0) {
      this.showWholeMap();
      return;
    }
    const camera = this.cameras.main;
    const xs = cities.map((city) => city.x);
    const ys = cities.map((city) => city.y);
    const minX = Math.max(0, Math.min(...xs) - 120);
    const maxX = Math.min(WORLD_WIDTH, Math.max(...xs) + 120);
    const minY = Math.max(0, Math.min(...ys) - 105);
    const maxY = Math.min(WORLD_HEIGHT, Math.max(...ys) + 105);
    const zoom = Phaser.Math.Clamp(
      Math.min(this.scale.width / Math.max(260, maxX - minX), this.scale.height / Math.max(220, maxY - minY)) * 0.88,
      0.72,
      MAX_TERRITORY_ZOOM,
    );
    camera.setZoom(zoom);
    camera.centerOn((minX + maxX) / 2, (minY + maxY) / 2);
  }

  private publishCityAnchor(cityId: string, force = false): void {
    if (!this.sys.isActive()) return;
    const city = this.state.cities[cityId];
    if (!city) return;
    const camera = this.cameras.main;
    const x = (city.x - camera.worldView.x) * camera.zoom + camera.x;
    const y = (city.y - camera.worldView.y) * camera.zoom + camera.y;
    const visible = x >= -24 && y >= -24 && x <= camera.width + 24 && y <= camera.height + 24;
    const roundedX = Math.round(x);
    const roundedY = Math.round(y);
    const anchorKey = `${cityId}:${roundedX}:${roundedY}:${camera.width}:${camera.height}:${visible}`;
    if (!force && anchorKey === this.lastAnchorKey) return;
    this.lastAnchorKey = anchorKey;
    this.bridge.emit('city:anchor-changed', {
      cityId,
      x: roundedX,
      y: roundedY,
      viewportWidth: camera.width,
      viewportHeight: camera.height,
      visible,
    });
  }
}
