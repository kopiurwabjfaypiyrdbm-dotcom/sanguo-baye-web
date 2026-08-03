import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PwaStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent>();
  const [registrationError, setRegistrationError] = useState<string>();
  const [installDismissed, setInstallDismissed] = useState(false);
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches;
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      setRegistrationError(error instanceof Error ? error.message : String(error));
    },
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => setInstallPrompt(undefined);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstallPrompt(undefined);
    else setInstallDismissed(true);
  }

  if (isOnline && !offlineReady && !needRefresh && !registrationError
    && (!installPrompt || isInstalled || installDismissed)) return null;

  return (
    <aside className="pwa-status" aria-live="polite">
      {!isOnline && (
        <div className="pwa-status-message persistent">
          <span aria-hidden="true">离</span>
          <p><strong>离线模式</strong><small>可继续游玩与保存，入口动画可能使用静态背景。</small></p>
        </div>
      )}
      {offlineReady && (
        <div className="pwa-status-message">
          <span aria-hidden="true">备</span>
          <p><strong>离线准备完成</strong><small>核心游戏已缓存到本机。</small></p>
          <button type="button" onClick={() => setOfflineReady(false)}>知道了</button>
        </div>
      )}
      {needRefresh && (
        <div className="pwa-status-message update">
          <span aria-hidden="true">新</span>
          <p><strong>新版本已就绪</strong><small>更新不会删除本地战役存档。</small></p>
          <button type="button" onClick={() => void updateServiceWorker(true)}>现在更新</button>
          <button type="button" className="quiet" onClick={() => setNeedRefresh(false)}>稍后</button>
        </div>
      )}
      {installPrompt && !isInstalled && !installDismissed && (
        <div className="pwa-status-message install">
          <span aria-hidden="true">装</span>
          <p><strong>安装到设备</strong><small>以独立横屏应用打开，减少浏览器栏干扰。</small></p>
          <button type="button" onClick={() => void installApp()}>安装</button>
          <button type="button" className="quiet" onClick={() => setInstallDismissed(true)}>暂不</button>
        </div>
      )}
      {registrationError && (
        <div className="pwa-status-message error" role="alert">
          <span aria-hidden="true">警</span>
          <p><strong>离线服务启动失败</strong><small>{registrationError}</small></p>
          <button type="button" onClick={() => setRegistrationError(undefined)}>关闭</button>
        </div>
      )}
    </aside>
  );
}
