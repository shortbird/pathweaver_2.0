/**
 * DocumentViewer - Renders PDFs page-by-page with swipe navigation.
 *
 * Web: Uses pdf.js to render each page as a canvas, left/right arrows to navigate.
 * Native: Uses Google Docs viewer as fallback.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Platform, Pressable, Image, Dimensions, GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HStack, UIText } from '../ui';

interface DocumentViewerProps {
  uri: string;
  title?: string;
}

function WebDocumentViewer({ uri, title }: DocumentViewerProps) {
  const isPdf = uri.toLowerCase().includes('.pdf');
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isPdf) { setLoading(false); return; }

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

        setTotalPages(pdf.numPages);
        const images: string[] = [];

        const pagesToRender = Math.min(pdf.numPages, 10);
        for (let i = 1; i <= pagesToRender; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          images.push(canvas.toDataURL('image/jpeg', 0.85));
        }

        if (!cancelled) {
          setPageImages(images);
          setLoading(false);
        }
      } catch (err) {
        console.error('[DocumentViewer] PDF load failed:', err);
        if (!cancelled) setLoading(false);
      }
    };

    loadPdf();
    return () => { cancelled = true; };
  }, [uri, isPdf]);

  if (!isPdf) {
    return (
      <Pressable
        onPress={() => window.open(uri, '_blank')}
        className="bg-surface-50 p-4 rounded-lg border border-surface-200"
      >
        <HStack className="items-center gap-3">
          <View className="w-10 h-10 rounded-lg bg-optio-purple/10 items-center justify-center">
            <Ionicons name="document-attach-outline" size={20} color="#6D469B" />
          </View>
          <UIText size="sm" className="text-optio-purple font-poppins-medium flex-1">
            {title || 'Open Document'}
          </UIText>
          <Ionicons name="open-outline" size={16} color="#6D469B" />
        </HStack>
      </Pressable>
    );
  }

  if (loading) {
    return (
      <View className="w-full rounded-lg bg-surface-100 items-center justify-center" style={{ aspectRatio: 3 / 4, minHeight: 300 }}>
        <Ionicons name="document-text-outline" size={32} color="#9CA3AF" />
        <UIText size="xs" className="text-typo-400 mt-2">Loading document...</UIText>
      </View>
    );
  }

  if (pageImages.length === 0) {
    return (
      <Pressable
        onPress={() => window.open(uri, '_blank')}
        className="bg-surface-50 p-4 rounded-lg border border-surface-200"
      >
        <HStack className="items-center gap-3">
          <Ionicons name="document-text-outline" size={20} color="#6D469B" />
          <UIText size="sm" className="text-optio-purple font-poppins-medium flex-1">
            {title || 'Open PDF'}
          </UIText>
          <Ionicons name="open-outline" size={16} color="#6D469B" />
        </HStack>
      </Pressable>
    );
  }

  return (
    <View className="rounded-lg overflow-hidden border border-surface-200 bg-surface-100">
      {/* Page display - same size as photos */}
      <View className="w-full items-center justify-center bg-white" style={{ aspectRatio: 3 / 4, minHeight: 300 }}>
        <img
          src={pageImages[currentPage]}
          alt={`Page ${currentPage + 1}`}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </View>

      {/* Navigation bar */}
      {totalPages > 1 && (
        <HStack className="items-center justify-between px-3 py-2 bg-white border-t border-surface-200">
          <Pressable
            onPress={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className={`w-8 h-8 rounded-full items-center justify-center ${currentPage === 0 ? 'opacity-30' : 'bg-surface-100'}`}
          >
            <Ionicons name="chevron-back" size={18} color="#6B7280" />
          </Pressable>

          <UIText size="xs" className="text-typo-500 font-poppins-medium">
            {currentPage + 1} / {totalPages}
          </UIText>

          <Pressable
            onPress={() => setCurrentPage((p) => Math.min(pageImages.length - 1, p + 1))}
            disabled={currentPage >= pageImages.length - 1}
            className={`w-8 h-8 rounded-full items-center justify-center ${currentPage >= pageImages.length - 1 ? 'opacity-30' : 'bg-surface-100'}`}
          >
            <Ionicons name="chevron-forward" size={18} color="#6B7280" />
          </Pressable>
        </HStack>
      )}
    </View>
  );
}

function NativeDocumentViewer({ uri, title }: DocumentViewerProps) {
  const isPdf = uri.toLowerCase().includes('.pdf');

  return (
    <Pressable className="bg-surface-50 p-4 rounded-lg border border-surface-200">
      <HStack className="items-center gap-3">
        <View className="w-10 h-10 rounded-lg bg-optio-purple/10 items-center justify-center">
          <Ionicons name={isPdf ? 'document-text-outline' : 'document-attach-outline'} size={20} color="#6D469B" />
        </View>
        <UIText size="sm" className="text-optio-purple font-poppins-medium flex-1" numberOfLines={1}>
          {title || (isPdf ? 'View PDF' : 'Open Document')}
        </UIText>
        <Ionicons name="open-outline" size={16} color="#6D469B" />
      </HStack>
    </Pressable>
  );
}

export function DocumentViewer(props: DocumentViewerProps) {
  if (Platform.OS === 'web') {
    return <WebDocumentViewer {...props} />;
  }
  return <NativeDocumentViewer {...props} />;
}
