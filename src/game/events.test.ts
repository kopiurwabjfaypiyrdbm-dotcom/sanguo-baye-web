import { describe, expect, it, vi } from 'vitest';
import { createGameBridge } from './events';

describe('game event bridge', () => {
  it('emits city selection and supports unsubscribe', () => {
    const bridge = createGameBridge();
    const listener = vi.fn();
    const unsubscribe = bridge.on('city:selected', listener);

    bridge.emit('city:selected', { cityId: 'luoyang' });
    unsubscribe();
    bridge.emit('city:selected', { cityId: 'xuchang' });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ cityId: 'luoyang' });
  });
});
