import { useEffect, useRef, type KeyboardEvent } from 'react';

export type CommandReview = {
  category: '内政' | '人事' | '军事' | '谋略';
  title: string;
  city: string;
  actor?: string;
  target?: string;
  effects: string[];
  costs: string[];
  risks?: string[];
  confirmLabel?: string;
  dangerous?: boolean;
};

type CommandReviewDialogProps = {
  review: CommandReview;
  onCancel: () => void;
  onConfirm: () => void;
};

export function CommandReviewDialog({ review, onCancel, onConfirm }: CommandReviewDialogProps) {
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
    const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
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
    <div
      className="command-review-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        className={`command-review-dialog ${review.dangerous ? 'dangerous' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-review-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="command-review-heading">
          <div>
            <p className="panel-kicker">{review.category}命令 · 最终确认</p>
            <h2 id="command-review-title">{review.title}</h2>
          </div>
          <button type="button" aria-label="取消命令" onClick={onCancel}>×</button>
        </header>

        <ol className="command-flow-steps" aria-label="命令流程">
          <li className="complete">指令</li>
          <li className="complete">执行者</li>
          <li className="complete">目标参数</li>
          <li className="active">确认</li>
        </ol>

        <dl className="command-review-context">
          <div><dt>所在城池</dt><dd>{review.city}</dd></div>
          {review.actor && <div><dt>执行武将</dt><dd>{review.actor}</dd></div>}
          {review.target && <div><dt>命令目标</dt><dd>{review.target}</dd></div>}
        </dl>

        <div className="command-review-columns">
          <section>
            <h3>预期效果</h3>
            <ul>{review.effects.map((effect) => <li key={effect}>{effect}</li>)}</ul>
          </section>
          <section>
            <h3>消耗</h3>
            <ul>{review.costs.map((cost) => <li key={cost}>{cost}</li>)}</ul>
          </section>
        </div>

        {review.risks && review.risks.length > 0 && (
          <section className="command-review-risks">
            <h3>{review.dangerous ? '不可逆风险' : '结果说明'}</h3>
            <ul>{review.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
          </section>
        )}

        <footer className="command-review-actions">
          <button type="button" onClick={onCancel}>返回调整</button>
          <button
            type="button"
            className={review.dangerous ? 'danger-action' : 'primary-action'}
            data-command-confirm
            onClick={onConfirm}
          >
            {review.confirmLabel ?? `确认${review.title}`}
          </button>
        </footer>
      </section>
    </div>
  );
}
