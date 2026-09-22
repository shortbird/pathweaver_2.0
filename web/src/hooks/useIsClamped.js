import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Whether a `line-clamp-*` element is actually hiding anything.
 *
 * A "Show more" button needs to know if there IS more, and the obvious way to
 * guess — count the characters — is wrong at every width but one. The quest
 * header offered "Show more" above 140 characters while clamping at two lines,
 * so a 172-character description that fits two lines on a laptop drew a button
 * that expanded nothing ("In the header it says 'show more' after the
 * description. But there is nothing more to show" — iCreate, 2026-09-22,
 * eb48ad83). Too short a threshold hides real text instead, which is the worse
 * half of the same mistake.
 *
 * The element itself knows: a clamped element's scrollHeight exceeds its
 * clientHeight exactly when text is cut off. Measure that, and re-measure when
 * the box resizes — the same paragraph clamps on a phone and does not on a
 * monitor, and nothing re-renders in between.
 *
 * Usage:
 *   const [ref, isClamped] = useIsClamped(text);
 *   <p ref={ref} className={expanded ? '' : 'line-clamp-2'}>{text}</p>
 *   {isClamped && <button>Show more</button>}
 *
 * Pass `expanded` so the measurement is skipped while the clamp is off — an
 * unclamped element never overflows, and reading it would say "nothing to
 * show" and remove the button the reader needs to collapse it again.
 */
const useIsClamped = (text, expanded = false) => {
  const [node, setNode] = useState(null);
  const [isClamped, setIsClamped] = useState(false);
  const ref = useCallback((el) => setNode(el), []);
  // Read through a ref so the observer callback never needs re-subscribing.
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  useEffect(() => {
    if (!node) return undefined;

    const measure = () => {
      if (expandedRef.current) return;
      setIsClamped(node.scrollHeight > node.clientHeight + 1);
    };
    measure();

    // jsdom and older Safari have no ResizeObserver; the first measurement
    // still stands, which is the common case.
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, text, expanded]);

  return [ref, isClamped];
};

export default useIsClamped;
