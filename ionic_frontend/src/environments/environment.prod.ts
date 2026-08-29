export const environment = {
  production: true,
  apiUrl: '/api',
  storageUrl: '/storage',
  reverb: {
    appKey: 'srhlinktodakey',
    host: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
    port: 8080,
    scheme: 'http',
  },
};
