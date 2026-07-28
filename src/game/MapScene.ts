import Phaser from 'phaser';
import type { GameState } from '../core/types';
import type { GameBridge } from './events';

const strategicMapBackground = new URL('../../assets/production/map/strategic-map-background-v1.png', import.meta.url).href;
const cityModel = new URL('../../assets/production/map/city-model-slate-v3.png', import.meta.url).href;
const factionFlag = new URL('../../assets/production/map/faction-flag-reference-v3.png', import.meta.url).href;

const WORLD_WIDTH = 1120;
const WORLD_HEIGHT = 680;

export class MapScene extends Phaser.Scene {
  private state: GameState;
  private selectedCityId: string;
  private assetsReady = false;
  private backgroundLayer?: Phaser.GameObjects.Container;
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
    this.loadArtAssets();
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.drawBackground();
    this.redrawMap();
    this.fitMap();
    this.bindCameraControls();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fitMap());
  }

  private loadArtAssets(): void {
    const assets = [
      ['strategic-map-background', strategicMapBackground],
      ['city-model-slate', cityModel],
      ['faction-flag-reference', factionFlag],
    ] as const;
    Promise.all(assets.map(([key, url]) => new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        this.textures.addImage(key, image);
        resolve();
      };
      image.onerror = () => reject(new Error(`Unable to load map art: ${url}`));
      image.src = url;
    }))).then(() => {
      if (!this.sys.isActive()) return;
      this.assetsReady = true;
      this.drawBackground();
      this.redrawMap();
    }).catch(() => {
      // Keep the vector fallback if an optional art asset is unavailable.
    });
  }

  updateMap(state: GameState, selectedCityId: string): void {
    this.state = state;
    this.selectedCityId = selectedCityId;
    if (this.sys.isActive()) this.redrawMap();
  }

  private drawBackground(): void {
    this.backgroundLayer?.destroy(true);
    const layer = this.add.container(0, 0);
    this.backgroundLayer = layer;

    if (this.assetsReady && this.textures.exists('strategic-map-background')) {
      const background = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 'strategic-map-background');
      background.setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT);
      background.setAlpha(0.94);
      layer.add(background);
    } else {
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
      layer.add(graphics);
    }

    const wash = this.add.graphics();
    wash.fillStyle(0x20352f, this.assetsReady ? 0.12 : 0);
    wash.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    wash.lineStyle(2, 0x7e704f, 0.3);
    wash.strokeRect(12, 12, WORLD_WIDTH - 24, WORLD_HEIGHT - 24);
    layer.add(wash);
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

    const hasArt = this.assetsReady && this.textures.exists('city-model-slate') && this.textures.exists('faction-flag-reference');
    for (const city of cities) {
      const faction = this.state.factions[city.ownerId];
      const color = Phaser.Display.Color.HexStringToColor(faction?.color ?? '#77786f').color;
      const size = city.type === 'capital' ? 68 : 54;
      const flagHeight = city.type === 'capital' ? 60 : 48;
      if (city.id === this.selectedCityId) {
        const ring = this.add.ellipse(city.x, city.y - 2, size + 16, size * 0.62, 0xf1d585, 0.18);
        ring.setStrokeStyle(2.5, 0xf1d585, 0.95);
        layer.add(ring);
      }

      const hoverHighlight = this.add.ellipse(city.x, city.y - 2, size + 12, size * 0.58, 0xf1d585, 0.08);
      hoverHighlight.setStrokeStyle(2.5, 0xf1d585, 0.96);
      hoverHighlight.setVisible(false);
      layer.add(hoverHighlight);

      let marker: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
      let flag: Phaser.GameObjects.Image | undefined;
      let factionField: Phaser.GameObjects.Rectangle | undefined;
      if (hasArt) {
        flag = this.add.image(city.x + size * 0.2, city.y - size * 0.72, 'faction-flag-reference');
        const flagWidth = flagHeight * 0.55;
        flag.setDisplaySize(flagWidth, flagHeight);
        flag.setOrigin(0.08, 0.92);
        const flagLeft = city.x + size * 0.2 - flagWidth * 0.08;
        const flagTop = city.y - size * 0.72 - flagHeight * 0.92;
        factionField = this.add.rectangle(
          flagLeft + flagWidth * 0.39,
          flagTop + flagHeight * 0.49,
          flagWidth * 0.38,
          flagHeight * 0.43,
          color,
          0.88,
        );
        factionField.setStrokeStyle(1.2, 0xe5c873, 0.94);
        marker = this.add.image(city.x, city.y, 'city-model-slate');
        marker.setDisplaySize(size, size);
        marker.setOrigin(0.5, 0.72);
      } else {
        marker = this.add.circle(city.x, city.y, city.type === 'capital' ? 13 : 10, color, 1);
        marker.setStrokeStyle(city.ownerId === this.state.playerFactionId ? 3 : 2, 0xf4ead0, 0.9);
      }

      marker.setInteractive({ useHandCursor: true });
      marker.on('pointerover', () => {
        hoverHighlight.setVisible(true);
      });
      marker.on('pointerout', () => {
        hoverHighlight.setVisible(false);
      });
      marker.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event.stopPropagation();
        this.bridge.emit('city:selected', { cityId: city.id });
      });
      const label = this.add.text(city.x, city.y + size * 0.3, city.name, {
        color: '#f7f0dc',
        fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        stroke: '#10211f',
        strokeThickness: 4,
      });
      label.setOrigin(0.5, 0);
      if (flag) layer.add(flag);
      if (factionField) layer.add(factionField);
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
