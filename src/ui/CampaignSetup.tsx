import type { BundledPeriodId, RulerOption, ScenarioOption } from '../data/bundledScenarios';

export function TitleScreen({
  hasContinue,
  onNewGame,
  onContinue,
}: {
  hasContinue: boolean;
  onNewGame: () => void;
  onContinue: () => void;
}) {
  return (
    <main className="entry-shell title-screen">
      <div className="entry-ornament" aria-hidden="true" />
      <section className="title-card" aria-labelledby="game-title">
        <p className="entry-era">汉末 · 群雄逐鹿</p>
        <h1 id="game-title">三国霸业</h1>
        <p className="title-subtitle">步步高电子词典版 · 现代 Web 重写</p>
        <div className="title-actions">
          <button type="button" className="entry-primary" onClick={onNewGame}>
            <span>新君登基</span>
            <small>选择时期与君主，开始新的霸业</small>
          </button>
          <button type="button" className="entry-secondary" onClick={onContinue} disabled={!hasContinue}>
            <span>重返沙场</span>
            <small>{hasContinue ? '继续最近的自动存档' : '尚无可继续的战役'}</small>
          </button>
        </div>
        <p className="entry-note">四个原版时期剧本已内置，无需选择本地资料文件</p>
      </section>
    </main>
  );
}

export function ScenarioScreen({
  scenarios,
  onSelect,
  onBack,
}: {
  scenarios: ScenarioOption[];
  onSelect: (period: BundledPeriodId) => void;
  onBack: () => void;
}) {
  return (
    <main className="entry-shell setup-screen">
      <section className="setup-card" aria-labelledby="scenario-title">
        <header className="setup-heading">
          <button type="button" className="entry-back" onClick={onBack}>返回</button>
          <div>
            <p className="entry-era">新君登基</p>
            <h1 id="scenario-title">选择历史时期</h1>
          </div>
          <span className="setup-step">第一步 / 共两步</span>
        </header>
        <div className="scenario-grid">
          {scenarios.map((scenario) => (
            <button
              type="button"
              className={`scenario-card period-${scenario.period}`}
              key={scenario.period}
              onClick={() => onSelect(scenario.period)}
            >
              <span className="scenario-number">时期 {scenario.period}</span>
              <strong>{scenario.title}</strong>
              <span className="scenario-year">公元 {scenario.year} 年</span>
              <p>{scenario.description}</p>
              <small>38 城 · {scenario.rulerCount} 方诸侯</small>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

export function RulerScreen({
  scenario,
  rulers,
  selectedRulerIndex,
  onSelectRuler,
  onStart,
  onBack,
}: {
  scenario: ScenarioOption;
  rulers: RulerOption[];
  selectedRulerIndex: number;
  onSelectRuler: (sourceIndex: number) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const selected = rulers.find((ruler) => ruler.sourceIndex === selectedRulerIndex) ?? rulers[0];
  return (
    <main className="entry-shell setup-screen">
      <section className="setup-card ruler-setup" aria-labelledby="ruler-title">
        <header className="setup-heading">
          <button type="button" className="entry-back" onClick={onBack}>返回</button>
          <div>
            <p className="entry-era">{scenario.title} · 公元 {scenario.year} 年</p>
            <h1 id="ruler-title">选择扮演君主</h1>
          </div>
          <span className="setup-step">第二步 / 共两步</span>
        </header>
        <div className="ruler-layout">
          <div className="ruler-grid" role="listbox" aria-label="可选君主">
            {rulers.map((ruler) => (
              <button
                type="button"
                role="option"
                aria-selected={ruler.sourceIndex === selected?.sourceIndex}
                className={ruler.sourceIndex === selected?.sourceIndex ? 'selected' : ''}
                key={ruler.sourceIndex}
                onClick={() => onSelectRuler(ruler.sourceIndex)}
              >
                <strong>{ruler.name}</strong>
                <span>{ruler.cityCount} 城 · {ruler.officerCount} 将</span>
              </button>
            ))}
          </div>
          <aside className="ruler-preview">
            <p>即将扮演</p>
            <strong>{selected?.name}</strong>
            <dl>
              <div><dt>初始城池</dt><dd>{selected?.cityCount ?? 0}</dd></div>
              <div><dt>所属人物</dt><dd>{selected?.officerCount ?? 0}</dd></div>
              <div><dt>天下城池</dt><dd>38</dd></div>
            </dl>
            <button type="button" className="entry-primary start-campaign" onClick={onStart} disabled={!selected}>
              开始霸业
            </button>
          </aside>
        </div>
      </section>
    </main>
  );
}
