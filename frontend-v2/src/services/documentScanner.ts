/**
 * Document scanner → single multi-page PDF.
 *
 * Uses the OS document scanners (iOS VisionKit / Android ML Kit) via
 * react-native-document-scanner-plugin, which handle edge detection, perspective
 * correction and auto-brighten / shadow removal. We then assemble ONE multi-page
 * PDF with pdf-lib and flow it into the normal capture → signed-upload →
 * `document` evidence-block pipeline.
 *
 * Why pdf-lib and not expo-print/HTML: each scanned image becomes its OWN page
 * sized to that image's exact pixel dimensions, so there is no fixed page box
 * for a tall scan to overflow — one scan == exactly one page. The previous
 * HTML/print approach scaled the image to the page WIDTH and let the height run
 * free, so a portrait scan ran taller than the printable area and spilled its
 * bottom strip onto a blank second page (bug report: "Scan is still putting onto
 * 2 pages… 1 page per scan").
 *
 * Native only (requires the dev/EAS build that includes the native scanner).
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

/**
 * Launch the OS document scanner and return a single PDF of the scanned pages.
 * Returns null if the user cancels or scans nothing. Throws if the scanner
 * native module isn't available (a build predating this feature).
 */
export async function scanDocumentToPdf(): Promise<ScannedDocument | null> {
  if (Platform.OS === 'web') {
    throw new Error('Document scanning is only available in the mobile app.');
  }

  // Lazy-require the native scanner: importing it at module load would crash the
  // whole capture sheet on a build that predates it ("Cannot find native module").
  // pdf-lib is pure JS but lazy-loaded here too so a single try/catch covers the
  // whole "needs a newer build" path. This way only the Scan action fails —
  // gracefully, caught by the caller — until the app is rebuilt/updated.
  let DocumentScanner: any;
  let ResponseType: any;
  let ScanDocumentResponseStatus: any;
  let PDFDocument: any;
  let FileSystem: any;
  try {
    const scanner = require('react-native-document-scanner-plugin');
    DocumentScanner = scanner.default ?? scanner;
    ResponseType = scanner.ResponseType;
    ScanDocumentResponseStatus = scanner.ScanDocumentResponseStatus;
    PDFDocument = require('pdf-lib').PDFDocument;
    // Legacy FS API: the new File/Directory API is preferred app-wide, but the
    // classic base64 write is the most proven path for binary output and the
    // `/legacy` subpath silences the SDK 55 deprecation warning.
    FileSystem = require('expo-file-system/legacy');
  } catch {
    throw new Error('Document scanning needs the latest app version. Please update the app.');
  }
  if (!DocumentScanner?.scanDocument || !PDFDocument?.create || !FileSystem?.writeAsStringAsync) {
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

  const pdf = await PDFDocument.create();
  for (const img of scannedImages) {
    // Strip any data-URI prefix; pdf-lib's embed* takes a bare base64 string.
    // Then strip ALL whitespace: Android's native scanner encodes with
    // `Base64.DEFAULT`, which wraps the output with a newline every 76 chars.
    // pdf-lib's decoder chokes on those embedded newlines and the resulting bytes
    // fail BOTH the JPEG and PNG signature checks — so embedJpg throws "not a
    // valid JPEG", the fallback embedPng throws "The input is not a PNG file!",
    // and the whole scan dies with a messageless error (the on-device "Scan
    // unavailable / Could not start the document scanner" report on build 22).
    // Removing the line breaks gives pdf-lib clean, decodable base64.
    const base64 = (img.includes('base64,') ? img.split('base64,')[1] : img).replace(/\s/g, '');
    // Detect the real format. responseType=Base64 returns RAW base64 with no
    // data-URI prefix, so we can't rely on a "data:image/png" header — the OS
    // scanner (esp. Android ML Kit) often returns PNG, and feeding PNG bytes to
    // embedJpg throws "Input is not a valid JPEG" ("Scan unavailable / invalid
    // jpeg"). Sniff the base64 magic bytes: JPEG -> "/9j/", PNG -> "iVBOR".
    const looksPng = /^data:image\/png/i.test(img) || base64.startsWith('iVBOR');
    let image;
    try {
      image = looksPng ? await pdf.embedPng(base64) : await pdf.embedJpg(base64);
    } catch {
      // Magic-byte guess was wrong (or an odd encoder) — try the other format.
      image = looksPng ? await pdf.embedJpg(base64) : await pdf.embedPng(base64);
    }
    // Page == image size → the image fills the page 1:1, so nothing overflows
    // and each scan is exactly one page regardless of aspect ratio.
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }

  const ts = Date.now();
  const name = `Scan-${ts}.pdf`;
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  const uri = `${dir}${name}`;
  const pdfBase64 = await pdf.saveAsBase64();
  await FileSystem.writeAsStringAsync(uri, pdfBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return { uri, name, pageCount: scannedImages.length };
}
