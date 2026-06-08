/**
 * scanDocumentToPdf: OS scanner pages → one multi-page PDF via pdf-lib.
 */

import { Platform, PermissionsAndroid } from 'react-native';
import DocumentScanner from 'react-native-document-scanner-plugin';
import * as FileSystem from 'expo-file-system/legacy';
import { scanDocumentToPdf } from '@/src/services/documentScanner';

// Mocked in src/__tests__/setup.tsx; exposes the shared PDFDocument instance.
const { __mockDoc } = require('pdf-lib');

describe('scanDocumentToPdf', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('Android camera-permission pre-flight', () => {
    const originalOS = Platform.OS;
    afterEach(() => { (Platform as any).OS = originalOS; });

    it('requests CAMERA on Android before launching the scanner', async () => {
      (Platform as any).OS = 'android';
      (PermissionsAndroid.request as jest.Mock) = jest.fn().mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
      (DocumentScanner.scanDocument as jest.Mock).mockResolvedValueOnce({ status: 'cancel' });

      await scanDocumentToPdf();

      expect(PermissionsAndroid.request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.CAMERA);
    });

    it('throws (and never launches the scanner) when CAMERA is denied', async () => {
      (Platform as any).OS = 'android';
      (PermissionsAndroid.request as jest.Mock) = jest.fn().mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);

      await expect(scanDocumentToPdf()).rejects.toThrow(/camera access/i);
      expect(DocumentScanner.scanDocument).not.toHaveBeenCalled();
    });
  });

  it('returns null when the user cancels (no PDF written)', async () => {
    (DocumentScanner.scanDocument as jest.Mock).mockResolvedValueOnce({ status: 'cancel' });
    expect(await scanDocumentToPdf()).toBeNull();
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it('returns null when no pages were scanned', async () => {
    (DocumentScanner.scanDocument as jest.Mock).mockResolvedValueOnce({ status: 'success', scannedImages: [] });
    expect(await scanDocumentToPdf()).toBeNull();
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it('builds exactly one PDF page per scanned image (no overflow page)', async () => {
    (DocumentScanner.scanDocument as jest.Mock).mockResolvedValueOnce({
      status: 'success',
      scannedImages: ['AAA', 'BBB', 'CCC'],
    });

    const res = await scanDocumentToPdf();

    // Regression: a portrait scan scaled to page width overflowed onto a blank
    // 2nd page under expo-print. pdf-lib sizes each page to its image, so pages
    // must equal images exactly — never 2x.
    expect(__mockDoc.embedJpg).toHaveBeenCalledTimes(3);
    expect(__mockDoc.addPage).toHaveBeenCalledTimes(3);
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
    expect(res?.pageCount).toBe(3);
    expect(res?.uri).toMatch(/\.pdf$/);
    expect(res?.name).toMatch(/\.pdf$/);
  });

  it('strips a data-URI prefix before embedding (no double-encoding)', async () => {
    (DocumentScanner.scanDocument as jest.Mock).mockResolvedValueOnce({
      status: 'success',
      scannedImages: ['data:image/png;base64,ZZZ'],
    });
    await scanDocumentToPdf();
    expect(__mockDoc.embedPng).toHaveBeenCalledWith('ZZZ');
  });
});
