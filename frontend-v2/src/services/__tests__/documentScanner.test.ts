/**
 * scanDocumentToPdf: OS scanner pages → one multi-page PDF via expo-print.
 */

import DocumentScanner from 'react-native-document-scanner-plugin';
import * as Print from 'expo-print';
import { scanDocumentToPdf } from '@/src/services/documentScanner';

describe('scanDocumentToPdf', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when the user cancels (no PDF generated)', async () => {
    (DocumentScanner.scanDocument as jest.Mock).mockResolvedValueOnce({ status: 'cancel' });
    expect(await scanDocumentToPdf()).toBeNull();
    expect(Print.printToFileAsync).not.toHaveBeenCalled();
  });

  it('returns null when no pages were scanned', async () => {
    (DocumentScanner.scanDocument as jest.Mock).mockResolvedValueOnce({ status: 'success', scannedImages: [] });
    expect(await scanDocumentToPdf()).toBeNull();
  });

  it('assembles a single multi-page PDF from the scanned pages', async () => {
    (DocumentScanner.scanDocument as jest.Mock).mockResolvedValueOnce({
      status: 'success',
      scannedImages: ['AAA', 'BBB', 'CCC'],
    });

    const res = await scanDocumentToPdf();

    expect(Print.printToFileAsync).toHaveBeenCalledTimes(1);
    const html = (Print.printToFileAsync as jest.Mock).mock.calls[0][0].html as string;
    // One page per scanned image, base64-embedded.
    expect(html).toContain('data:image/jpeg;base64,AAA');
    expect(html).toContain('data:image/jpeg;base64,BBB');
    expect(html).toContain('data:image/jpeg;base64,CCC');
    expect((html.match(/class="page"/g) || []).length).toBe(3);

    expect(res?.uri).toBe('file:///tmp/scan.pdf');
    expect(res?.pageCount).toBe(3);
    expect(res?.name).toMatch(/\.pdf$/);
  });

  it('passes through an already-data-URI page without double-prefixing', async () => {
    (DocumentScanner.scanDocument as jest.Mock).mockResolvedValueOnce({
      status: 'success',
      scannedImages: ['data:image/png;base64,ZZZ'],
    });
    await scanDocumentToPdf();
    const html = (Print.printToFileAsync as jest.Mock).mock.calls[0][0].html as string;
    expect(html).toContain('src="data:image/png;base64,ZZZ"');
    expect(html).not.toContain('base64,data:');
  });
});
