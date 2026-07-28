import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <aside className="orientation-notice" role="status" aria-label="屏幕方向提示">
      <span aria-hidden="true">↻</span>
      <strong>横屏游玩体验更佳</strong>
      <small>旋转设备后，地图与命令会获得更完整的操作空间。</small>
    </aside>
  </React.StrictMode>,
);
