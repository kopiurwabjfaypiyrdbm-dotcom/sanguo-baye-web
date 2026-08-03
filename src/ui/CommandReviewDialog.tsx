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
        className="command-review-dialog dangerous"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-review-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="command-review-heading">
          <div>
            <p className="panel-kicker">高风险{review.category}命令</p>
            <h2 id="command-review-title">{review.title}</h2>
          </div>
        </header>

        <p className="command-danger-context">
          {review.city}
          {review.actor ? ` · ${review.actor}` : ''}
          {review.target ? ` → ${review.target}` : ''}
        </p>

        {review.risks && review.risks.length > 0 && (
          <section className="command-review-risks">
            <h3>确认承担以下后果</h3>
            <ul>{review.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
          </section>
        )}

        <p className="command-danger-gain">
          {review.effects.join('；')}
          {review.costs.length > 0 ? `。消耗：${review.costs.join('、')}` : ''}
        </p>

        <footer className="command-review-actions">
          <button type="button" autoFocus onClick={onCancel}>取消</button>
          <button
            type="button"
            className="danger-action"
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
