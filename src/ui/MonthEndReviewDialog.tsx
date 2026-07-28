import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { MonthAdvanceReview, MonthResolutionReport } from '../core/monthReview';

type MonthEndReviewDialogProps = {
  review: MonthAdvanceReview;
  onCancel: () => void;
  onConfirm: () => void;
  onSelectCity: (cityId: string) => void;
};

export function MonthEndReviewDialog({ review, onCancel, onConfirm, onSelectCity }: MonthEndReviewDialogProps) {
  return (
    <MonthOverlay titleId="month-end-review-title" onCancel={onCancel}>
      <header className="month-review-heading">
        <div>
          <p className="panel-kicker">Month planning review</p>
          <h2 id="month-end-review-title">确认结束 {review.year} 年 {review.month} 月</h2>
        </div>
        <button type="button" aria-label="返回本月" onClick={onCancel}>×</button>
      </header>

      <div className="month-review-metrics" aria-label="本月计划概况">
        <span><strong>{review.actedOfficerCount}</strong> 人已行动</span>
        <span><strong>{review.availableOfficerCount}</strong> 人未行动</span>
        <span><strong>{review.playerCityCount}</strong> 座城池</span>
        <span><strong>{review.strategicOrderCount + review.diplomaticOrderCount}</strong> 项在途命令</span>
      </div>

      <section className="month-review-section">
        <h3>本月重要行动</h3>
        {review.actions.length > 0
          ? <ul>{review.actions.map((action) => <li key={action}>{action}</li>)}</ul>
          : <p className="month-review-empty">尚未记录会改变战役状态的主要行动。</p>}
      </section>

      <section className="month-review-section">
        <h3>结束前检查</h3>
        {review.notices.length > 0 ? (
          <div className="month-review-notices">
            {review.notices.map((notice) => (
              <article className={`month-review-notice ${notice.tone}`} key={notice.id}>
                <div>
                  <strong>{notice.title}</strong>
                  <p>{notice.detail}</p>
                </div>
                {notice.cityId && (
                  <button type="button" onClick={() => onSelectCity(notice.cityId!)}>查看城池</button>
                )}
              </article>
            ))}
          </div>
        ) : <p className="month-review-empty">当前没有需要特别提醒的月末风险。</p>}
      </section>

      <footer className="month-review-actions">
        <button type="button" onClick={onCancel}>返回继续部署</button>
        <button type="button" className="primary-action" onClick={onConfirm}>确认结束本月</button>
      </footer>
    </MonthOverlay>
  );
}

type MonthResolutionDialogProps = {
  report: MonthResolutionReport;
  onClose: () => void;
  onSelectCity: (cityId: string) => void;
};

export function MonthResolutionDialog({ report, onClose, onSelectCity }: MonthResolutionDialogProps) {
  return (
    <MonthOverlay titleId="month-resolution-title" onCancel={onClose}>
      <header className="month-review-heading">
        <div>
          <p className="panel-kicker">Monthly resolution</p>
          <h2 id="month-resolution-title">{report.year} 年 {report.month} 月战报</h2>
        </div>
        <button type="button" aria-label="关闭月报" onClick={onClose}>×</button>
      </header>

      <section className="month-report-headline" aria-label="本月要闻">
        <h3>本月要闻</h3>
        {report.headline.map((message) => <p key={message}>{message}</p>)}
      </section>

      {report.groups.length > 0 ? (
        <div className="month-report-groups">
          {report.groups.map((group, index) => (
            <details key={group.category} open={index === 0 && group.items.length <= 5}>
              <summary>{group.label}<span>{group.items.length}</span></summary>
              <div>
                {group.items.map((item) => (
                  <article key={item.id}>
                    <p>{item.message}</p>
                    {item.cityId && (
                      <button type="button" onClick={() => onSelectCity(item.cityId!)}>前往城池</button>
                    )}
                  </article>
                ))}
              </div>
            </details>
          ))}
        </div>
      ) : <p className="month-review-empty">本月没有需要展开的其他记录。</p>}

      <footer className="month-review-actions">
        <span>共收录 {report.totalEvents} 条结算记录</span>
        <button type="button" className="primary-action" onClick={onClose}>返回战略地图</button>
      </footer>
    </MonthOverlay>
  );
}

type MonthOverlayProps = {
  titleId: string;
  onCancel: () => void;
  children: ReactNode;
};

function MonthOverlay({ titleId, onCancel, children }: MonthOverlayProps) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    dialogRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), summary') ?? [])];
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
    <div className="month-review-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="month-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {children}
      </section>
    </div>
  );
}
