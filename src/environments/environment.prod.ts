declare var process: any;

export const environment = {
  production: true,

  // Securely loads from Vercel's Environment Variables during build
  apiUrl: process.env['NG_APP_API_URL'] || '',

  appName: 'Milk Transfer',

  autoUploadInterval: 60000
};