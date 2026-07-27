import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { buildCityBrowserEntries, buildOfficerBrowserEntries } from '../core/campaignNavigation';
import { getFactionDiplomaticOrders } from '../core/diplomaticOrders';
import { getFactionStrategicOrders } from '../core/strategicOrders';
import { getCampaignRuleset } from '../core/rulesets';
import type { GameState } from '../core/types';
import type { SaveSlotId } from '../core/saveStorage';

export type CampaignNavView = 'cities' | 'officers' | 'orders' | 'system';

type CampaignNavigatorProps = {
  view: CampaignNavView;
  state: GameState;
  selectedCityId: string;
  selectedSaveSlot: Exclude<SaveSlotId, 'auto'>;
  onSelectSaveSlot: (slot: Exclude<SaveSlotId, 'auto'>) => void;
  onSelectCity: (cityId: string) => void;
  onSelectOfficer: (officerId: string, cityId?: string) => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onToggleFullscreen: () => void;
  onReturnTitle: () => void;
  onClose: () => void;
  feedback?: { kind: 'success' | 'error'; message: string };
};

const VIEW_TITLES: Record<CampaignNavView, string> = {
  cities: '城池总览',
  officers: '人物总览',
  orders: '在途命令',
  system: '系统与存档',
};

export function CampaignNavigator(props: CampaignNavigatorProps) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    panelRef.current?.focus();
    return () => previousFocus?.focus();
  }, [props.view]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...(panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), label.file-action',
    ) ?? [])];
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="campaign-navigator-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) props.onClose();
    }}>
      <section
        ref={panelRef}
        className="campaign-navigator"
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-navigator-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="campaign-navigator-heading">
          <div>
            <p className="panel-kicker">Campaign index</p>
            <h2 id="campaign-navigator-title">{VIEW_TITLES[props.view]}</h2>
          </div>
          <button type="button" aria-label={`关闭${VIEW_TITLES[props.view]}`} onClick={props.onClose}>×</button>
        </header>
        {props.view === 'cities' && <CityBrowser {...props} />}
        {props.view === 'officers' && <OfficerBrowser {...props} />}
        {props.view === 'orders' && <OrderBrowser state={props.state} />}
        {props.view === 'system' && <SystemBrowser {...props} />}
      </section>
    </div>
  );
}

function CityBrowser({ state, selectedCityId, onSelectCity }: CampaignNavigatorProps) {
  const [scope, setScope] = useState<'owned' | 'scouted' | 'all'>('owned');
  const [query, setQuery] = useState('');
  const entries = useMemo(() => buildCityBrowserEntries(state), [state]);
  const visible = entries.filter((entry) =>
    (scope === 'all' || (scope === 'owned' ? entry.isOwned : entry.knowledge === 'report'))
    && `${entry.name}${entry.ownerName}`.includes(query.trim()));

  return (
    <div className="campaign-browser-body">
      <div className="campaign-browser-tools">
        <div className="segmented-control" role="group" aria-label="城池范围">
          <button type="button" className={scope === 'owned' ? 'active' : undefined} onClick={() => setScope('owned')}>己方</button>
          <button type="button" className={scope === 'scouted' ? 'active' : undefined} onClick={() => setScope('scouted')}>已侦察</button>
          <button type="button" className={scope === 'all' ? 'active' : undefined} onClick={() => setScope('all')}>天下</button>
        </div>
        <label><span className="visually-hidden">搜索城池</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索城池或势力" /></label>
      </div>
      <div className="campaign-browser-list city-browser-list" role="list">
        {visible.map((entry) => (
          <button
            type="button"
            className={entry.id === selectedCityId ? 'selected' : undefined}
            key={entry.id}
            onClick={() => onSelectCity(entry.id)}
          >
            <span className="browser-entry-main"><strong>{entry.name}</strong><small>{entry.ownerName}</small></span>
            {entry.knowledge === 'public' ? (
              <span className="browser-entry-muted">未侦察 · 仅公开归属</span>
            ) : (
              <span className="browser-entry-stats">
                <span>将 {entry.officerCount}</span><span>金 {entry.money}</span><span>粮 {entry.food}</span><span>备 {entry.reserveTroops}</span>
              </span>
            )}
            {entry.observedLabel && <small className="browser-entry-observed">{entry.observedLabel}</small>}
          </button>
        ))}
        {visible.length === 0 && <p className="campaign-browser-empty">没有符合当前筛选的城池。</p>}
      </div>
    </div>
  );
}

function OfficerBrowser({ state, onSelectOfficer }: CampaignNavigatorProps) {
  const [scope, setScope] = useState<'all' | 'serving' | 'talent' | 'intel'>('all');
  const [query, setQuery] = useState('');
  const entries = useMemo(() => buildOfficerBrowserEntries(state), [state]);
  const visible = entries.filter((entry) => {
    const inScope = scope === 'all'
      || (scope === 'serving' && entry.group === 'serving')
      || (scope === 'talent' && (entry.group === 'free' || entry.group === 'captive'))
      || (scope === 'intel' && entry.group === 'intel');
    return inScope && `${entry.name}${entry.cityName}${entry.statusLabel}`.includes(query.trim());
  });

  return (
    <div className="campaign-browser-body">
      <div className="campaign-browser-tools">
        <div className="segmented-control" role="group" aria-label="人物范围">
          <button type="button" className={scope === 'all' ? 'active' : undefined} onClick={() => setScope('all')}>全部</button>
          <button type="button" className={scope === 'serving' ? 'active' : undefined} onClick={() => setScope('serving')}>在职</button>
          <button type="button" className={scope === 'talent' ? 'active' : undefined} onClick={() => setScope('talent')}>人才俘虏</button>
          <button type="button" className={scope === 'intel' ? 'active' : undefined} onClick={() => setScope('intel')}>情报</button>
        </div>
        <label><span className="visually-hidden">搜索人物</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索人物或城市" /></label>
      </div>
      <div className="campaign-browser-list officer-browser-list" role="list">
        {visible.map((entry) => (
          <button type="button" key={entry.id} disabled={!entry.cityId} onClick={() => onSelectOfficer(entry.id, entry.cityId)}>
            <span className="browser-entry-main"><strong>{entry.name}</strong><small>{entry.statusLabel} · {entry.cityName}</small></span>
            {entry.group === 'serving' && (
              <span className="browser-entry-stats">
                <span>体 {entry.stamina}</span><span>兵 {entry.troops}</span><span>{entry.acted ? '已行动' : '可行动'}</span>
              </span>
            )}
            {entry.observedLabel && <small className="browser-entry-observed">{entry.observedLabel}</small>}
          </button>
        ))}
        {visible.length === 0 && <p className="campaign-browser-empty">没有符合当前筛选的已知人物。</p>}
      </div>
    </div>
  );
}

function OrderBrowser({ state }: { state: GameState }) {
  const strategicOrders = getFactionStrategicOrders(state, state.playerFactionId);
  const diplomaticOrders = getFactionDiplomaticOrders(state, state.playerFactionId);
  const diplomacyLabels = { alienate: '离间', canvass: '招揽', counterespionage: '策反', induce: '劝降' } as const;
  return (
    <div className="campaign-browser-body order-browser">
      <section>
        <h3>调动与输送 <span>{strategicOrders.length}</span></h3>
        <div className="order-browser-list">
          {strategicOrders.map((order) => {
            const officer = state.officers[order.officerId];
            const cargo = [
              order.cargo.money > 0 ? `${order.cargo.money} 金` : '',
              order.cargo.food > 0 ? `${order.cargo.food} 粮` : '',
              order.cargo.reserveTroops > 0 ? `${order.cargo.reserveTroops} 后备兵` : '',
            ].filter(Boolean).join('、');
            return (
              <article key={order.id}>
                <strong>{order.kind === 'move' ? '调动' : '输送'} · {officer?.name ?? '未知武将'}</strong>
                <p>{state.cities[order.sourceCityId]?.name} → {state.cities[order.targetCityId]?.name} · 剩余 {order.remainingMonths} 月</p>
                <small>{order.kind === 'transport' ? `${cargo || '无货物'}；失败时货物损失，执行者返回` : `${order.routeCityIds.length - 1} 段道路；抵达前不驻城`}</small>
              </article>
            );
          })}
          {strategicOrders.length === 0 && <p className="campaign-browser-empty">当前没有调动或输送命令。</p>}
        </div>
      </section>
      <section>
        <h3>谋略 <span>{diplomaticOrders.length}</span></h3>
        <div className="order-browser-list">
          {diplomaticOrders.map((order) => (
            <article key={order.id}>
              <strong>{diplomacyLabels[order.kind]} · {state.officers[order.officerId]?.name ?? '未知武将'}</strong>
              <p>目标 {state.officers[order.targetOfficerId]?.name ?? '人物已失效'} · 剩余 {order.remainingMonths} 月</p>
              <small>已付 {order.moneyCost} 金；目标变化可能令命令中止或失效</small>
            </article>
          ))}
          {diplomaticOrders.length === 0 && <p className="campaign-browser-empty">当前没有执行中的谋略。</p>}
        </div>
      </section>
    </div>
  );
}

function SystemBrowser(props: CampaignNavigatorProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="campaign-browser-body system-browser">
      <section>
        <h3>本地存档</h3>
        <p>自动存档随合法状态变化更新；手动槽位用于保留长期节点。</p>
        <label className="system-slot-field">
          <span>手动槽位</span>
          <select value={props.selectedSaveSlot} onChange={(event) => props.onSelectSaveSlot(event.target.value as Exclude<SaveSlotId, 'auto'>)}>
            <option value="1">槽位 1</option><option value="2">槽位 2</option><option value="3">槽位 3</option>
          </select>
        </label>
        <div className="system-action-grid">
          <button type="button" onClick={props.onSave}>保存</button>
          <button type="button" onClick={props.onLoad}>载入</button>
          <button type="button" onClick={props.onExport}>导出 JSON</button>
          <button type="button" onClick={() => importInputRef.current?.click()}>导入 JSON</button>
          <input ref={importInputRef} className="visually-hidden" type="file" accept="application/json,.json" aria-label="选择导入存档文件" onChange={props.onImport} tabIndex={-1} />
        </div>
        {props.feedback && <p className={`system-feedback ${props.feedback.kind}`} role={props.feedback.kind === 'error' ? 'alert' : 'status'}>{props.feedback.message}</p>}
      </section>
      <section>
        <h3>显示与战役</h3>
        <dl className="system-campaign-meta">
          <div><dt>日期</dt><dd>{props.state.calendar.year} 年 {props.state.calendar.month} 月</dd></div>
          <div><dt>回合</dt><dd>{props.state.turn}</dd></div>
          <div><dt>随机种子</dt><dd>{props.state.rngSeed}</dd></div>
          <div><dt>规则集</dt><dd>{getCampaignRuleset(props.state.rulesetId).label}</dd></div>
          <div><dt>人物规则</dt><dd>开局后锁定</dd></div>
        </dl>
        <button type="button" className="system-fullscreen-action" onClick={props.onToggleFullscreen}>切换全屏显示</button>
        <button type="button" className="return-title-action" onClick={props.onReturnTitle}>返回标题画面</button>
      </section>
    </div>
  );
}
