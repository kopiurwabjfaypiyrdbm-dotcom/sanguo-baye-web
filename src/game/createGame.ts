import Phaser from 'phaser';
import type { GameState } from '../core/types';
import type { GameBridge } from './events';
import { MapScene } from './MapScene';

export type StrategyMapController = {
  update(state: GameState, selectedCityId: string): void;
  focusPlayerTerritory(): void;
  showWholeMap(): void;
  destroy(): void;
};

export function createStrategyMap(
  container: HTMLElement,
  bridge: GameBridge,
  state: GameState,
  selectedCityId: string,
): StrategyMapController {
  const scene = new MapScene(state, selectedCityId, bridge);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    backgroundColor: '#10211f',
    antialias: true,
    audio: { noAudio: true },
    render: { transparent: false },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: container.clientWidth,
      height: container.clientHeight,
    },
    scene: [scene],
  });

  let resizeFrame = 0;
  const resizeToHost = () => {
    resizeFrame = 0;
    const width = Math.max(1, Math.round(container.clientWidth));
    const height = Math.max(1, Math.round(container.clientHeight));
    if (game.scale.width === width && game.scale.height === height) return;
    game.scale.resize(width, height);
  };
  const scheduleResize = () => {
    if (resizeFrame !== 0) return;
    resizeFrame = window.requestAnimationFrame(resizeToHost);
  };
  const resizeObserver = new ResizeObserver(scheduleResize);
  resizeObserver.observe(container);
  window.visualViewport?.addEventListener('resize', scheduleResize);
  scheduleResize();

  return {
    update(nextState, nextSelectedCityId) {
      scene.updateMap(nextState, nextSelectedCityId);
    },
    focusPlayerTerritory() {
      scene.focusPlayerTerritory();
    },
    showWholeMap() {
      scene.showWholeMap();
    },
    destroy() {
      resizeObserver.disconnect();
      window.visualViewport?.removeEventListener('resize', scheduleResize);
      if (resizeFrame !== 0) window.cancelAnimationFrame(resizeFrame);
      game.destroy(true);
    },
  };
}
