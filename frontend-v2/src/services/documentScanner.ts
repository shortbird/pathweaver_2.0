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

  // Lazy-require the native modules: importing them at module load would crash
  // the whole capture sheet on a build that predates them ("Cannot find native
  // module 'ExpoPrint'"). This way only the Scan action fails — gracefully,
  // caught by the caller — until the app is rebuilt/updated.
  let DocumentScanner: any;
  let ResponseType: any;
  let ScanDocumentResponseStatus: any;
  let Print: any;
  try {
    const scanner = require('react-native-document-scanner-plugin');
    DocumentScanner = scanner.default ?? scanner;
    ResponseType = scanner.ResponseType;
    ScanDocumentResponseStatus = scanner.ScanDocumentResponseStatus;
    Print = require('expo-print');
  } catch {
    throw new Error('Document scanning needs the latest app version. Please update the app.');
  }
  if (!DocumentScanner?.scanDocument || !Print?.printToFileAsync) {
    throw new Error('Document scanning needs the latest app version. Please update the app.');
  }

  const { scannedImages, status } = await DocumentScanner.scanDocument({
    responseType: ResponseType?.Base64 ?? 'base64',
    croppedImageQuality: 90,
  });

  const cancelStatus = ScanDocumentResponseStatus?.Cancel ?? 'cancel';
  if (status === cancelStatus || !scannedImages || scannedImages.length === 0) {
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
