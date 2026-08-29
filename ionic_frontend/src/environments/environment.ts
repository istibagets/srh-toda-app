const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';

export const environment = {
  production: false,
  apiUrl: `http://${host}:8000/api`,
  storageUrl: `http://${host}:8000/storage`,
  reverb: {
    appKey: 'srhlinktodakey',
    host: host,
    port: 8080,
    scheme: 'http',
  },
};
