/**
 * Mobile Demo Page - Embeds the Optio Mobile Expo web app.
 *
 * Superadmin only. Full-screen iframe pointing to the Expo dev server
 * in development or the deployed mobile web build in production.
 */

import { useEffect, useState } from 'react';

const MOBILE_URL = import.meta.env.DEV
  ? 'http://localhost:8081'
  : '/mobile-app/index.html';

export default function MobileDemoPage() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div style={styles.container}>
      {!loaded && (
        <div style={styles.loading}>
          <p style={styles.loadingText}>Loading mobile preview...</p>
        </div>
      )}
      <iframe
        src={MOBILE_URL}
        style={{
          ...styles.iframe,
          opacity: loaded ? 1 : 0,
        }}
        title="Optio Mobile Preview"
        onLoad={() => setLoaded(true)}
        allow="camera; microphone"
      />
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  iframe: {
    width: '100%',
    height: '100%',
    maxWidth: 430,
    border: 'none',
    borderRadius: 0,
    transition: 'opacity 0.3s',
  },
  loading: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#888',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 14,
  },
};
