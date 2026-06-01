import {
  recordApiCall,
  recordRoute,
  recordConsoleError,
  collectDiagnostics,
  getCurrentRoute,
  installConsoleCapture,
  _resetDiagnostics,
} from '../diagnostics';

describe('diagnostics collector', () => {
  beforeEach(() => {
    _resetDiagnostics();
  });

  it('caps the API-call ring buffer and evicts oldest (FIFO)', () => {
    for (let i = 0; i < 25; i++) {
      recordApiCall({ method: 'GET', url: `/api/x/${i}`, status: 200, ms: 1, at: 't' });
    }
    const calls = collectDiagnostics().recent_api_calls;
    expect(calls).toHaveLength(20);
    // Oldest 5 evicted → first kept is /api/x/5, last is /api/x/24.
    expect(calls[0].url).toBe('/api/x/5');
    expect(calls[calls.length - 1].url).toBe('/api/x/24');
  });

  it('de-dupes consecutive identical routes and tracks the current route', () => {
    recordRoute('/home');
    recordRoute('/home'); // duplicate → ignored
    recordRoute('/quests');
    const diag = collectDiagnostics();
    expect(diag.breadcrumbs.map((b) => b.route)).toEqual(['/home', '/quests']);
    expect(getCurrentRoute()).toBe('/quests');
  });

  it('captures console errors as strings, including Error objects', () => {
    recordConsoleError(['boom', new Error('kaboom')]);
    const errs = collectDiagnostics().recent_console_errors;
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('boom');
    expect(errs[0]).toContain('Error: kaboom');
  });

  it('collectDiagnostics returns device/build info from the mocked modules', () => {
    const diag = collectDiagnostics();
    expect(diag.platform).toBeDefined();
    expect(diag.device_model).toBe('iPhone Test');
    expect(diag.os_version).toBe('18.0');
    // build_number comes from Constants.nativeBuildVersion mock.
    expect(diag.build_number).toBe('42');
  });

  it('installConsoleCapture tees into the buffer but preserves the original call', () => {
    const original = console.error;
    const spy = jest.fn();
    console.error = spy;
    try {
      installConsoleCapture();
      console.error('tee-me');
      expect(spy).toHaveBeenCalledWith('tee-me');
      expect(collectDiagnostics().recent_console_errors.some((e) => e.includes('tee-me'))).toBe(true);
    } finally {
      console.error = original;
    }
  });
});
