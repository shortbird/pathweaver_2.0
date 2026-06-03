/**
 * Document scanner → single multi-page PDF.
 *
 * Uses the OS document scanners (iOS VisionKit / Android ML Kit) via
 * react-native-document-scanner-plugin, which handle edge detection, perspective
 * correction and auto-brighten / shadow removal. We take the enhanced page
 * images and assemble ONE multi-page PDF with expo-print, which then flows into
 * the normal capture → signed-upload → `document` evidence-block pipeline.
 *
 * Native only (requires the dev/EAS build that includes the native module).
 */

import { Platform } from 'react-native';
import * as Print from 'expo-print';
import DocumentScanner, { ResponseType, ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';

export interface ScannedDocument {
  /** Local file URI of the generated PDF. */
  uri: string;
  /** Suggested filename. */
  name: string;
  /** Number of scanned pages. */
  pageCount: number;
}

/** Build an HTML doc where each scanned page fills its own PDF page. */
function buildPdfHtml(base64Images: string[]): string {
  const pages = base64Images
    .map((img) => {
      const src = img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
      return `<div class="page"><img src="${src}" /></div>`;
    })
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <style>
      @page { margin: 0; }
      html, body { margin: 0; padding: 0; }
      .page { page-break-after: always; width: 100%; height: 100vh;
              display: flex; align-items: center; justify-content: center; }
      .page:last-child { page-break-after: auto; }
      img { max-width: 100%; max-height: 100%; object-fit: contain; }
    </style></head><body>${pages}</body></html>`;
}

/**
 * Launch the OS document scanner and return a single PDF of the scanned pages.
 * Returns null if the user cancels or scans nothing. Throws if the scanner
 * native module isn't available (a build predating this feature).
 */
export async function scanDocumentToPdf(): Promise<ScannedDocument | null> {
  if (Platform.OS === 'web') {
    throw new Error('Document scanning is only available in the mobile app.');
  }

  const { scannedImages, status } = await DocumentScanner.scanDocument({
    responseType: ResponseType.Base64,
    croppedImageQuality: 90,
  });

  if (status === ScanDocumentResponseStatus.Cancel || !scannedImages || scannedImages.length === 0) {
    return null;
  }

  const html = buildPdfHtml(scannedImages);
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  return {
    uri,
    name: `Scan-${Date.now()}.pdf`,
    pageCount: scannedImages.length,
  };
}
