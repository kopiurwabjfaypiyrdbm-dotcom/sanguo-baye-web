export function App() {
  return (
    <main className="app-shell">
      <section className="top-bar">
        <div>
          <p className="eyebrow">Web Prototype</p>
          <h1>Web 三国霸业 v0.1</h1>
        </div>
        <button type="button" className="primary-action">
          结束回合
        </button>
      </section>

      <section className="map-host" aria-label="主地图">
        <div className="map-placeholder">
          <span className="map-grid-label">主地图加载区</span>
        </div>
      </section>

      <aside className="side-panel" aria-label="城池面板">
        <p className="panel-kicker">City</p>
        <h2>城池面板</h2>
        <p>选择地图上的城池后，这里会显示资源、驻守武将和出征操作。</p>
      </aside>

      <section className="log-panel" aria-label="日志">
        <p className="panel-kicker">Log</p>
        <p>准备进入战略回合。</p>
      </section>
    </main>
  );
}
