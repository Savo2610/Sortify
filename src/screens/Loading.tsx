import { IconCheck } from '../components/Icons';
import { Logo } from '../components/Logo';
import { Spinner } from '../components/ui';
import type { LoadStep } from '../lib/session';

export function Loading({ steps, title = 'Songs werden geladen' }: { steps: LoadStep[]; title?: string }) {
  const loaded = steps.reduce((a, s) => a + s.loaded, 0);
  const total = steps.reduce((a, s) => a + s.total, 0);
  const pct = total ? Math.min(100, (loaded / total) * 100) : 4;
  return (
    <div className="loading">
      <div className="loading__pulse">
        <Logo size={56} />
      </div>
      <h1>{title}</h1>
      <p className="muted">
        {total ? `${loaded.toLocaleString('de-DE')} von ${total.toLocaleString('de-DE')} Songs` : 'Einen Moment …'}
      </p>
      <div className="progress loading__bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      {steps.length > 0 && (
        <ul className="loading__steps">
          {steps.map((s) => (
            <li key={s.id} className={s.done ? 'is-done' : ''}>
              <span className="loading__icon">{s.done ? <IconCheck size={14} strokeWidth={3} /> : <Spinner size={14} />}</span>
              <span className="loading__name">{s.label}</span>
              <span className="muted">{s.total ? `${s.loaded}/${s.total}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
