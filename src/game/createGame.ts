import Phaser from 'phaser';
import type { GameState } from '../core/types';
import type { GameBridge } from './events';
import { MapScene } from './MapScene';

export type StrategyMapController = {
  update(state: GameState, selectedCityId: string): void;
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
    render: { transparent: false },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: container.clientWidth,
      height: container.clientHeight,
    },
    scene: [scene],
  });
  return {
    update(nextState, nextSelectedCityId) {
      scene.updateMap(nextState, nextSelectedCityId);
    },
    destroy() {
      game.destroy(true);
    },
  };
}
