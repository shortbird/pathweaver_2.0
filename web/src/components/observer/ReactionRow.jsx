import { useState } from 'react';
import { bool, object, shape, string } from 'prop-types';
import { REACTIONS, setReaction, clearReaction } from '../../services/friendsAPI';

/**
 * ReactionRow — a friend's one-tap encouragement on a feed card.
 *
 * The fixed palette as chips. Counts are per key and there is no total
 * anywhere: the palette is encouragement, and a number to rank by is the
 * thing core_philosophy forbids. Tapping a chip sets that reaction
 * (replacing a different one); tapping the chip already set clears it.
 *
 * Tappable for a peer viewer; read-only for the work's owner and their
 * adults, who see what friends left. Same component as the app's.
 */
export default function ReactionRow({ target, summary, canReact }) {
  const [byKey, setByKey] = useState(summary?.by_key || {});
  const [mine, setMine] = useState(summary?.mine ?? null);
  const [busy, setBusy] = useState(false);

  const tap = async (key) => {
    if (!canReact || busy) return;
    setBusy(true);
    const prevMine = mine;
    const prevByKey = byKey;
    const next = { ...byKey };
    if (prevMine) next[prevMine] = Math.max(0, (next[prevMine] || 1) - 1);
    const clearing = prevMine === key;
    if (!clearing) next[key] = (next[key] || 0) + 1;
    setByKey(next);
    setMine(clearing ? null : key);
    try {
      if (clearing) await clearReaction(target);
      else await setReaction(target, key);
    } catch {
      setByKey(prevByKey);
      setMine(prevMine);
    } finally {
      setBusy(false);
    }
  };

  const visible = REACTIONS.filter((r) => canReact || (byKey[r.key] || 0) > 0);
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 pb-3" aria-label="Reactions">
      {visible.map((r) => {
        const count = byKey[r.key] || 0;
        const active = mine === r.key;
        const cls = `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
          active ? 'bg-optio-purple/10 border-optio-purple text-optio-purple font-semibold' : 'bg-gray-50 border-gray-200 text-gray-600'
        }`;
        const body = <><span aria-hidden="true">{r.emoji}</span>{r.label}{count > 0 ? ` · ${count}` : ''}</>;
        return canReact ? (
          <button
            key={r.key}
            type="button"
            onClick={(e) => { e.stopPropagation(); tap(r.key); }}
            disabled={busy}
            aria-pressed={active}
            aria-label={r.label}
            data-testid={`reaction-${r.key}`}
            className={cls}
          >
            {body}
          </button>
        ) : (
          <span key={r.key} className={cls}>{body}</span>
        );
      })}
    </div>
  );
}

ReactionRow.propTypes = {
  target: shape({
    studentId: string.isRequired,
    completionId: string,
    learningEventId: string,
  }).isRequired,
  summary: shape({
    by_key: object,
    mine: string,
  }),
  canReact: bool,
};
