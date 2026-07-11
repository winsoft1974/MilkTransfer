// src/environments/environment.prod.ts (or environment.development.ts)
export const environment = {
  production: true,

  // Change this to '/api'. The vercel.json proxy will handle the redirect
  apiUrl: '/api',

  accessApiUrl: 'https://localhost:7267/api/access',
  appName: 'Milk Transfer',
  autoUploadInterval: 60000
};