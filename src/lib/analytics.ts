import { houseEdge } from '@house-edge/analytics';

export { houseEdge };

export function startAnalytics() {
  const key = import.meta.env.VITE_HOUSE_EDGE_KEY?.trim();
  const endpoint = import.meta.env.VITE_HOUSE_EDGE_ENDPOINT?.trim();
  const enabled =
    import.meta.env.PROD || import.meta.env.VITE_HOUSE_EDGE_TRACK_DEVELOPMENT === 'true';
  if (!enabled || !key || !endpoint) return;
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
    respectDoNotTrack: true,
  });
}

if (import.meta.hot) import.meta.hot.dispose(() => houseEdge.destroy());
