import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export type NativeBackHandler = () => boolean;

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function registerNativeBackHandler(handler: NativeBackHandler): () => void {
  if (!isNativeAndroid()) return () => undefined;

  document.documentElement.dataset.runtime = 'android';
  let disposed = false;
  let removeListener: (() => Promise<void>) | undefined;

  void CapacitorApp.addListener('backButton', async ({ canGoBack }) => {
    const tacticalOverlay = document.querySelector(
      '.battle-edge-panel, .battle-attack-confirm, .battle-retreat-confirm',
    );
    if (tacticalOverlay) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      return;
    }
    if (handler()) return;
    if (canGoBack) window.history.back();
    else await CapacitorApp.minimizeApp();
  }).then((listener) => {
    removeListener = () => listener.remove();
    if (disposed) void removeListener();
  });

  return () => {
    disposed = true;
    if (removeListener) void removeListener();
  };
}
