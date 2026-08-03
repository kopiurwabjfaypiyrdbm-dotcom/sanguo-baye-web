import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { buildCityBrowserEntries, buildOfficerBrowserEntries } from '../core/campaignNavigation';
import { getCampaignRuleset } from '../core/rulesets';
import { buildMonthAdvanceReview, buildMonthResolutionReport } from '../core/monthReview';
import { getOfficerEquipmentIds } from '../core/equipment';
import type { GameState } from '../core/types';
import type { SaveSlotId } from '../core/saveStorage';

export type CampaignNavView = 'intelligence' | 'cities' | 'officers' | 'treasures' | 'delegation' | 'system';

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
  intelligence: '本月情报',
  cities: '城池总览',
  officers: '人物总览',
  treasures: '宝物库',
  delegation: '委任方略',
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
        {props.view === 'intelligence' && <IntelligenceBrowser {...props} />}
        {props.view === 'cities' && <CityBrowser {...props} />}
        {props.view === 'officers' && <OfficerBrowser {...props} />}
        {props.view === 'treasures' && <TreasureBrowser state={props.state} />}
        {props.view === 'delegation' && <DelegationBrowser {...props} />}
        {props.view === 'system' && <SystemBrowser {...props} />}
      </section>
    </div>
  );
}

function IntelligenceBrowser({ state, onSelectCity }: CampaignNavigatorProps) {
  const review = useMemo(() => buildMonthAdvanceReview(state), [state]);
  const recentReport = useMemo(
    () => buildMonthResolutionReport(state.logs.slice(-30), state),
    [state],
  );
  const reportItems = recentReport.groups.flatMap((group) =>
    group.items.map((item) => ({ ...item, groupLabel: group.label })));

  return (
    <div className="campaign-browser-body intelligence-browser">
      <div className="intelligence-summary" aria-label="本月概况">
        <span><strong>{review.notices.length}</strong> 项提醒</span>
        <span><strong>{review.availableOfficerCount}</strong> 人待命</span>
        <span><strong>{review.strategicOrderCount + review.diplomaticOrderCount}</strong> 项在途</span>
        <span><strong>{state.logs.filter((log) => log.turn === state.turn).length}</strong> 条本月消息</span>
      </div>
      <div className="intelligence-feed" role="list">
        {review.notices.map((notice) => (
          <button
            type="button"
            className={`intelligence-row ${notice.tone}`}
            key={notice.id}
            disabled={!notice.cityId}
            onClick={() => notice.cityId && onSelectCity(notice.cityId)}
          >
            <span className="intelligence-kind">提醒</span>
            <span><strong>{notice.title}</strong><small>{notice.detail}</small></span>
            <span className="intelligence-location">{notice.cityId ? `${state.cities[notice.cityId]?.name} ›` : '全局'}</span>
          </button>
        ))}
        {reportItems.map((item) => (
          <button
            type="button"
            className="intelligence-row"
            key={item.id}
            disabled={!item.cityId}
            onClick={() => item.cityId && onSelectCity(item.cityId)}
          >
            <span className="intelligence-kind">{item.groupLabel}</span>
            <span><strong>{item.message}</strong></span>
            <span className="intelligence-location">{item.cityId ? `${state.cities[item.cityId]?.name} ›` : '天下'}</span>
          </button>
        ))}
        {review.notices.length === 0 && reportItems.length === 0 && (
          <p className="campaign-browser-empty">本月暂无需要主公留意的消息。</p>
        )}
      </div>
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

function TreasureBrowser({ state }: { state: GameState }) {
  const entries = useMemo(() => {
    const visible = new Map<string, { itemId: string; location: string; holder?: string }>();
    for (const city of Object.values(state.cities)) {
      if (city.ownerId !== state.playerFactionId) continue;
      for (const itemId of city.itemIds ?? []) {
        visible.set(itemId, { itemId, location: city.name });
      }
    }
    for (const officer of Object.values(state.officers)) {
      if (officer.factionId !== state.playerFactionId || officer.status === 'dead') continue;
      for (const itemId of getOfficerEquipmentIds(officer)) {
        visible.set(itemId, {
          itemId,
          location: officer.cityId ? state.cities[officer.cityId]?.name ?? '在途' : '在途',
          holder: officer.name,
        });
      }
    }
    return [...visible.values()]
      .map((entry) => ({ ...entry, item: state.items[entry.itemId] }))
      .filter((entry) => Boolean(entry.item))
      .sort((a, b) => a.item.name.localeCompare(b.item.name, 'zh-Hans-CN'));
  }, [state]);

  return (
    <div className="campaign-browser-body treasure-browser">
      <p className="browser-intro">汇总本势力已经发现并持有的宝物。赏赐与没收仍需进入宝物所在城市或持有人详情执行。</p>
      <div className="campaign-browser-list treasure-browser-list" role="list">
        {entries.map(({ item, location, holder }) => (
          <article key={item.id}>
            <span className="treasure-seal" aria-hidden="true">宝</span>
            <div><strong>{item.name}</strong><small>{holder ? `${holder}持有 · ${location}` : `收藏于${location}`}</small></div>
            <span className="browser-entry-stats">
              {item.forceBonus !== 0 && <span>武 {item.forceBonus > 0 ? '+' : ''}{item.forceBonus}</span>}
              {item.intelligenceBonus !== 0 && <span>智 {item.intelligenceBonus > 0 ? '+' : ''}{item.intelligenceBonus}</span>}
              {item.moveBonus !== 0 && <span>移 {item.moveBonus > 0 ? '+' : ''}{item.moveBonus}</span>}
            </span>
          </article>
        ))}
        {entries.length === 0 && <p className="campaign-browser-empty">本势力尚未发现宝物，可通过城池搜寻获得线索。</p>}
      </div>
    </div>
  );
}

function DelegationBrowser({ state, onSelectCity }: CampaignNavigatorProps) {
  const ownedCities = Object.values(state.cities)
    .filter((city) => city.ownerId === state.playerFactionId)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  const unlocked = ownedCities.length >= 6;
  return (
    <div className="campaign-browser-body delegation-browser">
      <div className="delegation-intro">
        <div><strong>{unlocked ? '委任规划已开放' : '扩张至 6 城后开放委任'}</strong><p>委任将用于多城时期的内政、征兵、人才与运输方针；正式自动执行规则将在后续阶段接入。</p></div>
        <span>{ownedCities.length} / 6 城</span>
      </div>
      <div className="delegation-city-list" role="list">
        {ownedCities.map((city) => {
          const officers = Object.values(state.officers).filter((officer) =>
            officer.status === 'serving' && officer.cityId === city.id && officer.factionId === state.playerFactionId);
          const warnings = [
            !city.satrapOfficerId ? '太守空缺' : '',
            officers.length === 0 ? '无人驻守' : '',
            city.food < 200 ? '粮草偏低' : '',
            city.condition && city.condition !== 'normal' ? '灾情未解' : '',
          ].filter(Boolean);
          return (
            <button type="button" key={city.id} onClick={() => onSelectCity(city.id)}>
              <span><strong>{city.name}</strong><small>{state.officers[city.satrapOfficerId ?? '']?.name ?? '太守空缺'} · {officers.length} 将</small></span>
              <span>{warnings.join(' · ') || '运转正常'} ›</span>
            </button>
          );
        })}
      </div>
      <fieldset disabled className="delegation-policy-preview">
        <legend>未来可设置的委任方针</legend>
        <label><input type="checkbox" /> 优先补足粮草与民忠</label>
        <label><input type="checkbox" /> 前线自动征兵与补员</label>
        <label><input type="checkbox" /> 搜寻并尝试登用本地人才</label>
        <label><input type="checkbox" /> 后方向前线组织物资输送</label>
      </fieldset>
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
