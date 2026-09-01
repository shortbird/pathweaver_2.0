/**
 * DocumentViewer - Renders PDFs page-by-page with page navigation.
 *
 * Web: pdf.js renders each page to a canvas. Native: the same pdf.js, inside a
 * hidden WebView that hands finished pages back as JPEGs.
 *
 * Pages are rendered ON DEMAND, one at a time. The first version rendered the
 * first ten pages up front and stopped there, so an eleven-page document simply
 * lost its ending while the counter cheerfully said "1 / 47" — reported
 * 2026-08-28 ("PDFs only show 10 pages. Improve page navigation as well").
 * Rendering the whole document up front is not the fix: each page is a base64
 * JPEG held in JS memory, and a long document would be tens of megabytes on a
 * 512MB-class device. So we render what is being looked at, keep a few
 * neighbours warm, and drop the rest.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Platform, Pressable, Image, ScrollView, ActivityIndicator } from 'react-native';
import { safeOpenURL } from '@/src/utils/linking';
import { Ionicons } from '@expo/vector-icons';
import { HStack, UIText, toast } from '../ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

// cdnjs-published SRI hash for pdf.js 3.11.174 pdf.min.js
// (https://api.cdnjs.com/libraries/pdf.js/3.11.174?fields=sri). Update in
// lockstep with the pinned version in the URLs below.
const PDFJS_SRI =
  'sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ==';

/** How many rendered pages to keep in memory at once. The page being read plus
 *  a neighbour either side, with slack for fast paging. Bounded on purpose:
 *  this is the number that used to be "the whole document, up to ten". */
const PAGE_CACHE_LIMIT = 5;

interface DocumentViewerProps {
  uri: string;
  title?: string;
}

/** Whether this document takes the heavy PDF rendering path below (a WebView
 *  plus a handful of rendered pages held as base64 JPEGs). Exported so callers
 *  can decide to defer mounting one, using the SAME test the viewer itself uses. */
export function isPdfUrl(uri?: string | null): boolean {
  return !!uri && uri.toLowerCase().includes('.pdf');
}

/** Drop rendered pages that are far from the one being read, so a long document
 *  costs the same memory as a short one. */
function evict(pages: Record<number, string>, current: number): Record<number, string> {
  const keys = Object.keys(pages).map(Number);
  if (keys.length <= PAGE_CACHE_LIMIT) return pages;
  const keep = keys
    .sort((a, b) => Math.abs(a - current) - Math.abs(b - current))
    .slice(0, PAGE_CACHE_LIMIT);
  const next: Record<number, string> = {};
  for (const k of keep) next[k] = pages[k];
  return next;
}

/**
 * Page navigation: previous / next, a tappable rail of page numbers, and the
 * current position. The rail is what makes a long document usable — arrows
 * alone mean forty taps to reach page forty.
 */
function PageNav({ page, total, onGo }: { page: number; total: number; onGo: (n: number) => void }) {
  const c = useThemeColors();
  const railRef = useRef<ScrollView>(null);

  // Keep the current number in view when paging with the arrows.
  useEffect(() => {
    railRef.current?.scrollTo({ x: Math.max(0, (page - 1) * 40 - 80), animated: true });
  }, [page]);

  if (total <= 1) return null;

  const arrow = (dir: -1 | 1, icon: 'chevron-back' | 'chevron-forward') => {
    const disabled = dir === -1 ? page <= 1 : page >= total;
    return (
      <Pressable
        onPress={() => onGo(page + dir)}
        disabled={disabled}
        testID={dir === -1 ? 'pdf-prev' : 'pdf-next'}
        accessibilityRole="button"
        accessibilityLabel={dir === -1 ? 'Previous page' : 'Next page'}
        className={`w-8 h-8 rounded-full items-center justify-center ${disabled ? 'opacity-30' : 'bg-surface-100 dark:bg-dark-surface-200'}`}
      >
        <Ionicons name={icon} size={18} color={c.icon} />
      </Pressable>
    );
  };

  return (
    <View className="bg-white dark:bg-dark-surface-100 border-t border-surface-200 dark:border-dark-surface-300">
      <HStack className="items-center justify-between px-3 py-2">
        {arrow(-1, 'chevron-back')}
        <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 font-poppins-medium">
          {page} / {total}
        </UIText>
        {arrow(1, 'chevron-forward')}
      </HStack>

      {/* Jump straight to a page. Only worth the row once there are enough
          pages that paging one at a time is a chore. */}
      {total > 3 && (
        <ScrollView
          ref={railRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8, gap: 6 }}
          testID="pdf-page-rail"
        >
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
            <Pressable
              key={n}
              onPress={() => onGo(n)}
              accessibilityRole="button"
              accessibilityLabel={`Page ${n}`}
              className={`min-w-[34px] px-2 py-1 rounded-md items-center ${n === page ? 'bg-optio-purple' : 'bg-surface-100 dark:bg-dark-surface-200'}`}
            >
              <UIText
                size="xs"
                className={n === page ? 'font-poppins-semibold' : 'text-typo-500 dark:text-dark-typo-400'}
                style={n === page ? { color: '#FFFFFF' } : undefined}
              >
                {n}
              </UIText>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** The rendered page (or a spinner while the page it asked for is still being
 *  drawn). Same box either way, so paging doesn't make the card jump. */
function PageFrame({ image, web }: { image?: string; web?: boolean }) {
  const c = useThemeColors();
  return (
    <View className="w-full items-center justify-center bg-white" style={{ aspectRatio: 3 / 4, minHeight: 300 }}>
      {image ? (
        web ? (
          <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        )
      ) : (
        <ActivityIndicator color={c.brand} />
      )}
    </View>
  );
}

/** The "we couldn't render it, here's the file" fallback, shared by both
 *  platforms so a failed render never leaves a blank box. */
function OpenExternally({ uri, title, isPdf }: { uri: string; title?: string; isPdf: boolean }) {
  const c = useThemeColors();
  const open = async () => {
    if (Platform.OS === 'web') { window.open(uri, '_blank'); return; }
    const opened = await safeOpenURL(uri);
    if (!opened) toast.error("Couldn't open this document");
  };
  return (
    <Pressable
      onPress={open}
      testID="document-open-externally"
      className="bg-surface-50 dark:bg-dark-surface-50 p-4 rounded-lg border border-surface-200 dark:border-dark-surface-300"
    >
      <HStack className="items-center gap-3">
        <View className="w-10 h-10 rounded-lg bg-optio-purple/10 items-center justify-center">
          <Ionicons name={isPdf ? 'document-text-outline' : 'document-attach-outline'} size={20} color={c.brand} />
        </View>
        <UIText size="sm" className="text-optio-purple font-poppins-medium flex-1" numberOfLines={1}>
          {title || (isPdf ? 'Open PDF' : 'Open Document')}
        </UIText>
        <Ionicons name="open-outline" size={16} color={c.brand} />
      </HStack>
    </Pressable>
  );
}

function Loading() {
  const c = useThemeColors();
  return (
    <View className="w-full rounded-lg bg-surface-100 dark:bg-dark-surface-200 items-center justify-center" style={{ aspectRatio: 3 / 4, minHeight: 300 }}>
      <Ionicons name="document-text-outline" size={32} color={c.iconMuted} />
      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-2">Loading document...</UIText>
    </View>
  );
}

function WebDocumentViewer({ uri, title }: DocumentViewerProps) {
  const isPdf = isPdfUrl(uri);
  const [pages, setPages] = useState<Record<number, string>>({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const docRef = useRef<any>(null);

  // Render one page to a canvas and keep it as a JPEG. Guarded against
  // re-rendering a page we already hold, so paging back is instant.
  const renderPage = useCallback(async (n: number) => {
    const pdf = docRef.current;
    if (!pdf || n < 1 || n > pdf.numPages) return;
    try {
      const pdfPage = await pdf.getPage(n);
      const viewport = pdfPage.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      const image = canvas.toDataURL('image/jpeg', 0.85);
      setPages((prev) => evict({ ...prev, [n]: image }, n));
    } catch (err) {
      console.error('[DocumentViewer] page render failed:', err);
    }
  }, []);

  useEffect(() => {
    if (!isPdf) { setLoading(false); return undefined; }

    let cancelled = false;

    const loadPdf = async () => {
      try {
        // Load pdf.js via script tag (Metro can't dynamic import CDN URLs)
        const pdfjsLib = await new Promise<any>((resolve, reject) => {
          if ((window as any).pdfjsLib) {
            resolve((window as any).pdfjsLib);
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
          // SRI pin (cdnjs-published hash) — a tampered CDN response fails to
          // load instead of executing. The worker script can't carry SRI (pdf.js
          // loads it into a Worker itself), but it runs in a worker scope with
          // no DOM access.
          script.integrity = PDFJS_SRI;
          script.crossOrigin = 'anonymous';
          script.onload = () => {
            const lib = (window as any).pdfjsLib;
            lib.GlobalWorkerOptions.workerSrc =
              'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            resolve(lib);
          };
          script.onerror = reject;
          document.head.appendChild(script);
        });

        const pdf = await pdfjsLib.getDocument(uri).promise;
        if (cancelled) return;

        docRef.current = pdf;
        setTotalPages(pdf.numPages);
        setPage(1);
        await renderPage(1);
        if (!cancelled) setLoading(false);
      } catch (err) {
        console.error('[DocumentViewer] PDF load failed:', err);
        if (!cancelled) { setFailed(true); setLoading(false); }
      }
    };

    loadPdf();
    return () => { cancelled = true; docRef.current = null; };
  }, [uri, isPdf, renderPage]);

  const go = useCallback((n: number) => {
    if (n < 1 || n > totalPages) return;
    setPage(n);
    setPages((prev) => (prev[n] ? evict(prev, n) : prev));
    if (!pages[n]) renderPage(n);
  }, [totalPages, pages, renderPage]);

  if (!isPdf) return <OpenExternally uri={uri} title={title} isPdf={false} />;
  if (loading) return <Loading />;
  if (failed || totalPages === 0) return <OpenExternally uri={uri} title={title} isPdf />;

  return (
    <View className="rounded-lg overflow-hidden border border-surface-200 dark:border-dark-surface-300 bg-surface-100 dark:bg-dark-surface-200">
      <PageFrame image={pages[page]} web />
      <PageNav page={page} total={totalPages} onGo={go} />
    </View>
  );
}

/**
 * HTML that loads pdf.js and renders pages to canvas ON REQUEST, posting each
 * finished page back to RN. It keeps the parsed document alive and exposes
 * `window.renderPage(n)`, which the native side injects — so a 200-page
 * document costs one parse and one page of memory at a time.
 */
function getPdfRendererHtml(pdfUrl: string) {
  // S6: harden WebView. pdfUrl comes from user-uploaded evidence — reject
  // anything that isn't plain https:// so we can't be tricked into
  // `javascript:` URIs or string-break out of the template. Encode via
  // JSON.stringify so quotes/backslashes inside the URL can't close the JS
  // string and inject code.
  const safeUrl = /^https:\/\//i.test(pdfUrl) ? pdfUrl : '';
  const serialized = JSON.stringify(safeUrl);
  return `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" integrity="${PDFJS_SRI}" crossorigin="anonymous"></script>
<style>body{margin:0;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh}
.loading{color:#9ca3af;font-family:sans-serif;font-size:14px}</style></head>
<body><div class="loading">Loading PDF...</div>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
var doc=null, queued=null, busy=false;
function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));}
async function draw(n){
  if(!doc||busy){queued=n;return;}
  if(n<1||n>doc.numPages)return;
  busy=true;
  try{
    var page=await doc.getPage(n);
    var vp=page.getViewport({scale:1.5});
    var c=document.createElement('canvas');
    c.width=vp.width;c.height=vp.height;
    await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
    post({type:'page',index:n,image:c.toDataURL('image/jpeg',0.85)});
  }catch(e){
    post({type:'error',message:String(e&&e.message||e)});
  }
  busy=false;
  if(queued!==null){var q=queued;queued=null;draw(q);}
}
window.renderPage=function(n){draw(n);};
(async()=>{try{
  doc=await pdfjsLib.getDocument(${serialized}).promise;
  post({type:'meta',total:doc.numPages});
  draw(queued===null?1:queued);
}catch(e){
  post({type:'error',message:String(e&&e.message||e)});
}})();
</script></body></html>`;
}

function NativeDocumentViewer({ uri, title }: DocumentViewerProps) {
  const isPdf = isPdfUrl(uri);
  const [pages, setPages] = useState<Record<number, string>>({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const webRef = useRef<any>(null);

  let WebView: any = null;
  if (isPdf) {
    try {
      WebView = require('react-native-webview').default;
    } catch {
      // not available in this build
    }
  }

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'meta') {
        setTotalPages(data.total);
      } else if (data.type === 'page') {
        setPages((prev) => evict({ ...prev, [data.index]: data.image }, data.index));
        setLoading(false);
      } else if (data.type === 'error') {
        setError(true);
        setLoading(false);
      }
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  const go = useCallback((n: number) => {
    if (n < 1 || n > totalPages) return;
    setPage(n);
    setPages((prev) => (prev[n] ? evict(prev, n) : prev));
    if (!pages[n]) {
      // `true;` at the end: injectJavaScript warns on a non-trivial completion
      // value on iOS.
      webRef.current?.injectJavaScript(`window.renderPage(${n}); true;`);
    }
  }, [totalPages, pages]);

  // PDF with WebView available: render pages via a hidden WebView that STAYS
  // mounted — it holds the parsed document, and unmounting it after the first
  // page (as this did while it only ever rendered ten) would mean re-parsing
  // the file for every page turn.
  if (isPdf && WebView && !error) {
    return (
      <View className="rounded-lg overflow-hidden border border-surface-200 dark:border-dark-surface-300 bg-surface-100 dark:bg-dark-surface-200">
        <View style={{ height: 0, overflow: 'hidden' }}>
          <WebView
            ref={webRef}
            // S6: narrow originWhitelist to the PDF CDN + our uploads host.
            // JS must stay enabled (pdf.js needs it to render pages) but our
            // HTML is fully controlled and the uri is https-only gated above.
            originWhitelist={['https://cdnjs.cloudflare.com', 'https://*.supabase.co']}
            source={{ html: getPdfRendererHtml(uri) }}
            onMessage={handleMessage}
            onError={() => { setError(true); setLoading(false); }}
            style={{ height: 1, width: 1 }}
            javaScriptEnabled
          />
        </View>

        {loading ? (
          <Loading />
        ) : (
          <>
            <PageFrame image={pages[page]} />
            <PageNav page={page} total={totalPages} onGo={go} />
          </>
        )}
      </View>
    );
  }

  return <OpenExternally uri={uri} title={title} isPdf={isPdf} />;
}

export function DocumentViewer(props: DocumentViewerProps) {
  if (Platform.OS === 'web') {
    return <WebDocumentViewer {...props} />;
  }
  return <NativeDocumentViewer {...props} />;
}
