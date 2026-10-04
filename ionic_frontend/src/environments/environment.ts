const isHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:';
const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';

export const environment = {
  production: false,
  apiUrl: isHttps ? '/api' : `http://${host}:8000/api`,
  storageUrl: isHttps ? '/storage' : `http://${host}:8000/storage`,
  reverb: {
    appKey: 'srhlinktodakey',
    host: isHttps ? 'srh-link-toda.duckdns.org' : host,
    port: 8080,
    scheme: isHttps ? 'https' : 'http',
  },
};
