export type GameEventMap = {
  'city:selected': { cityId: string };
};

export type GameBridge = {
  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void;
  on<K extends keyof GameEventMap>(event: K, listener: (payload: GameEventMap[K]) => void): () => void;
};

export function createGameBridge(): GameBridge {
  const listeners = new Map<keyof GameEventMap, Set<(payload: never) => void>>();
  return {
    emit(event, payload) {
      for (const listener of listeners.get(event) ?? []) listener(payload as never);
    },
    on(event, listener) {
      const eventListeners = listeners.get(event) ?? new Set();
      eventListeners.add(listener as (payload: never) => void);
      listeners.set(event, eventListeners);
      return () => eventListeners.delete(listener as (payload: never) => void);
    },
  };
}
