import Phaser from 'phaser';
import type { TacticalBattleState, TacticalPosition } from '../core/tacticalBattle';
import { BattleScene } from './BattleScene';
import type { GameBridge } from './events';

export type TacticalMapController = {
  update(
    battle: TacticalBattleState,
    selectedUnitId: string | undefined,
    reachable: TacticalPosition[],
    attackableUnitIds: string[],
  ): void;
  destroy(): void;
};

export function createTacticalMap(
  container: HTMLElement,
  bridge: GameBridge,
  battle: TacticalBattleState,
  selectedUnitId: string | undefined,
  reachable: TacticalPosition[],
  attackableUnitIds: string[],
): TacticalMapController {
  const scene = new BattleScene(battle, selectedUnitId, reachable, attackableUnitIds, bridge);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    backgroundColor: '#10211f',
    antialias: true,
    audio: { noAudio: true },
    render: { transparent: false },
    input: { touch: { capture: false } },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: container.clientWidth,
      height: container.clientHeight,
    },
    scene: [scene],
  });
  return {
    update(nextBattle, nextSelectedUnitId, nextReachable, nextAttackableUnitIds) {
      scene.updateBattle(nextBattle, nextSelectedUnitId, nextReachable, nextAttackableUnitIds);
    },
    destroy() {
      game.destroy(true);
    },
  };
}
