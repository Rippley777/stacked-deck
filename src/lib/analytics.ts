import { houseEdge } from '@house-edge/analytics';

export { houseEdge };

export function startAnalytics() {
  const key = import.meta.env.VITE_HOUSE_EDGE_KEY?.trim();
  const endpoint = import.meta.env.VITE_HOUSE_EDGE_ENDPOINT?.trim();
  const enabled =
    import.meta.env.PROD || import.meta.env.VITE_HOUSE_EDGE_TRACK_DEVELOPMENT === 'true';
  if (!enabled) return;
  if (!key || !endpoint) {
    console.warn(
      'House Edge tracking disabled: configure the public browser key and collector endpoint at build time.',
    );
    return;
  }
  try {
    const url = new URL(endpoint);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
  } catch {
    return;
  }
  houseEdge.init({
    projectKey: import.meta.env.VITE_HOUSE_EDGE_PROJECT || 'stacked-deck',
    key,
    endpoint,
    version: import.meta.env.VITE_APP_VERSION,
    environment: import.meta.env.PROD ? 'production' : 'development',
    respectDoNotTrack: true,
  });
  const status = houseEdge.getStatus();
  if (status.status === 'invalid_browser_key')
    console.warn('House Edge requires a public browser ingestion key.');
}

if (import.meta.hot) import.meta.hot.dispose(() => houseEdge.destroy());
