/** Resolves backend API URLs for both the deployed web app and the bundled Capacitor app. */
const configuredBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!configuredBase) return normalizedPath;
  return `${configuredBase}${normalizedPath}`;
}
