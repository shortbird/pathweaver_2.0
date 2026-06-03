/**
 * LtiShell — the single layout primitive every LTI iframe page renders inside.
 *
 * Why this exists (see docs/LTI_FRONTEND_REDESIGN.md):
 *   Canvas embeds Optio in a narrow, variable-size iframe (worst in
 *   SpeedGrader). The general (app) layout assumes full viewport + sidebar +
 *   marketing chrome and renders badly there. LtiShell is the opposite: no
 *   chrome, a width-constrained single column, consistent loading/error
 *   states, and — critically — it tells Canvas how tall the content is via
 *   the LTI `lti.frameResize` postMessage so the iframe isn't clipped or
 *   left with dead space.
 *
 * Web-only behaviour (frame resize, ResizeObserver, window) is guarded by
 * Platform.OS === 'web'. On native (Canvas mobile app embeds the same code)
 * the resize is a no-op and the OS handles scrolling.
 */

import { ReactNode, useEffect, useRef } from 'react';
import { Platform, View, ScrollView, ActivityIndicator } from 'react-native';
import { VStack, UIText, Heading } from '@/src/components/ui';

/**
 * Post the content height to the Canvas parent frame. Canvas (and the LTI
 * 1.3 spec) listen for `{ subject: 'lti.frameResize', height }` on the
 * parent window. Target origin is '*' deliberately: the tool cannot know
 * the institution's Canvas origin ahead of time and the message carries no
 * sensitive data (just a pixel height). No-op off-web or outside an iframe.
 */
function postFrameHeight(height: number) {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || window.parent === window) return;
  try {
    window.parent.postMessage(
      { subject: 'lti.frameResize', height: Math.ceil(height) },
      '*',
    );
  } catch {
    /* cross-origin/postMessage failures are non-fatal — Canvas falls back
       to its default iframe height + inner scroll. */
  }
}

export interface LtiShellProps {
  children?: ReactNode;
  /** Optional compact header title (quest/context name). */
  title?: string;
  /** Optional subtitle under the title (e.g. student name in teacher view). */
  subtitle?: string;
  /** Show a centered spinner instead of children. */
  loading?: boolean;
  /** Show a centered error message instead of children. */
  error?: string | null;
  /** Override the max content width. Default keeps it readable in wide
   *  embeds while still working at ~320px (SpeedGrader). */
  maxWidthClassName?: string;
}

export function LtiShell({
  children,
  title,
  subtitle,
  loading = false,
  error = null,
  maxWidthClassName = 'max-w-2xl',
}: LtiShellProps) {
  // On web, observe the rendered content and report its height to Canvas
  // whenever it changes (task list grows, evidence added, error shown...).
  const webRootRef = useRef<View | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const el = webRootRef.current as unknown as HTMLElement | null;
    if (!el) return;

    const report = () => postFrameHeight(el.scrollHeight || el.offsetHeight || 0);
    // Initial report after first paint.
    const raf = requestAnimationFrame(report);

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(report);
      observer.observe(el);
    }
    window.addEventListener('resize', report);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener('resize', report);
    };
    // Re-run when the rendered branch changes so height is re-reported.
  }, [loading, error, children]);

  let body: ReactNode;
  if (loading) {
    body = (
      <View className="items-center justify-center py-16" testID="lti-shell-loading">
        <ActivityIndicator size="large" />
      </View>
    );
  } else if (error) {
    body = (
      <View className="items-center justify-center px-2 py-12" testID="lti-shell-error">
        <VStack space="sm" className="items-center">
          <UIText
            size="md"
            className="font-poppins-semibold text-typo-900 text-center"
          >
            Something went wrong
          </UIText>
          <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 text-center">
            {error}
          </UIText>
        </VStack>
      </View>
    );
  } else {
    body = children;
  }

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 20 }}
      testID="lti-shell"
    >
      <View ref={webRootRef} className={`w-full mx-auto ${maxWidthClassName}`}>
        {(title || subtitle) && !loading && !error ? (
          <VStack space="xs" className="mb-4">
            {title ? <Heading size="lg">{title}</Heading> : null}
            {subtitle ? (
              <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
                {subtitle}
              </UIText>
            ) : null}
          </VStack>
        ) : null}
        {body}
      </View>
    </ScrollView>
  );
}

export default LtiShell;
