import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

import {VitePWA} from 'vite-plugin-pwa';

// LINT.IfChange(aistudio_media_plugin)
function aistudioMediaPlugin(): Plugin {
  return {
    name: 'vite-plugin-aistudio-media',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/assets/aistudio/')) {
          const rawPath = req.url.split('?')[0].split('#')[0];
          try {
            const decodedPath = decodeURIComponent(rawPath);
            const relativePath = decodedPath.replace(/^\//, '');
            const aistudioDir = path.resolve(
              __dirname,
              'public',
              'assets',
              'aistudio',
            );
            const filePath = path.resolve(__dirname, 'public', relativePath);
            if (
              filePath.startsWith(aistudioDir + path.sep) &&
              fs.existsSync(filePath) &&
              fs.statSync(filePath).isFile()
            ) {
              const ext = path.extname(filePath).toLowerCase();
              const mimeMap: Record<string, string> = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.svg': 'image/svg+xml',
                '.bmp': 'image/bmp',
                '.ico': 'image/x-icon',
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
                '.ogv': 'video/ogg',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.ogg': 'audio/ogg',
                '.pdf': 'application/pdf',
              };
              res.setHeader(
                'Content-Type',
                mimeMap[ext] || 'application/octet-stream',
              );
              res.setHeader('Cache-Control', 'no-cache');
              fs.createReadStream(filePath).pipe(res);
              return;
            }
          } catch {
            // Fall through if URI decoding or file access fails
          }
        }
        next();
      });
    },
  };
}
// LINT.ThenChange(//depot/google3/java/com/google/alkali/boq/makersuite/applet_dev_service/templates/initializers/react_theme/vite.config.ts:aistudio_media_plugin)

// Calculate current KST (UTC+9) date string (YYYY.MM.DD) at build/compile time
const getKSTDateString = (): string => {
  if (process.env.VITE_APP_BUILD_DATE && /^\d{4}\.\d{2}\.\d{2}$/.test(process.env.VITE_APP_BUILD_DATE)) {
    return process.env.VITE_APP_BUILD_DATE;
  }
  const now = new Date();
  const kstFormatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = kstFormatter.formatToParts(now);
  let year = '2026', month = '11', day = '14';
  for (const p of parts) {
    if (p.type === 'year') year = p.value;
    if (p.type === 'month') month = p.value;
    if (p.type === 'day') day = p.value;
  }
  return `${year}.${month}.${day}`;
};

interface VersionFileInfo {
  version: string;
  releaseDate: string;
  patch: number;
  buildId: string;
  buildTime: string;
  sourceHash: string;
}

const parseVersionMetadata = (
  rawVersion?: string,
  rawReleaseDate?: string,
  rawPatch?: number
): { releaseDate: string; patch: number } | null => {
  if (rawVersion) {
    const match = String(rawVersion).trim().match(/^V?(\d{4}\.\d{2}\.\d{2})(?:\.(\d+))?$/i);
    if (match) {
      const releaseDate = match[1];
      const patch = match[2] ? parseInt(match[2], 10) : typeof rawPatch === 'number' ? rawPatch : 0;
      return { releaseDate, patch: Number.isFinite(patch) && patch >= 0 ? patch : 0 };
    }
  }
  if (rawReleaseDate && /^\d{4}\.\d{2}\.\d{2}$/.test(rawReleaseDate)) {
    return {
      releaseDate: rawReleaseDate,
      patch: typeof rawPatch === 'number' && Number.isFinite(rawPatch) ? rawPatch : 0,
    };
  }
  return null;
};

// Deterministic SHA-256 hash across source tree so even single-file edits are tracked precisely
const computeSourceHash = (): string => {
  const hash = crypto.createHash('sha256');
  const walkAndHash = (targetPath: string) => {
    if (!fs.existsSync(targetPath)) return;
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      const baseName = path.basename(targetPath);
      if (baseName === 'node_modules' || baseName === 'dist' || baseName === '.git' || baseName === 'assets' || baseName === 'backups') {
        return;
      }
      const entries = fs.readdirSync(targetPath).sort();
      for (const entry of entries) {
        walkAndHash(path.join(targetPath, entry));
      }
    } else if (stat.isFile()) {
      const rel = path.relative(__dirname, targetPath).replace(/\\/g, '/');
      if (rel === 'public/version.json' || rel.endsWith('.map')) return;
      hash.update(rel);
      hash.update(fs.readFileSync(targetPath));
    }
  };

  walkAndHash(path.resolve(__dirname, 'src'));
  walkAndHash(path.resolve(__dirname, 'server.ts'));
  walkAndHash(path.resolve(__dirname, 'server'));
  walkAndHash(path.resolve(__dirname, 'index.html'));
  walkAndHash(path.resolve(__dirname, 'package.json'));
  walkAndHash(path.resolve(__dirname, 'vite.config.ts'));

  return hash.digest('hex').slice(0, 16);
};

const ensureVersionFile = (isBuild: boolean): VersionFileInfo => {
  const publicDir = path.resolve(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  const versionFilePath = path.resolve(publicDir, 'version.json');
  const dateStr = getKSTDateString();
  const sourceHash = computeSourceHash();

  let existingRaw: Partial<VersionFileInfo> | null = null;
  if (fs.existsSync(versionFilePath)) {
    try {
      existingRaw = JSON.parse(fs.readFileSync(versionFilePath, 'utf-8'));
    } catch {
      existingRaw = null;
    }
  }

  const parsedExisting = existingRaw
    ? parseVersionMetadata(existingRaw.version, existingRaw.releaseDate, existingRaw.patch)
    : null;
  const isSameDay = Boolean(parsedExisting && parsedExisting.releaseDate === dateStr);
  const hasProperPatchFormat = Boolean(
    existingRaw?.version && /^V\d{4}\.\d{2}\.\d{2}\.\d{2,}$/.test(existingRaw.version)
  );

  // In dev/serve mode, reuse existing version.json ONLY if date is today, format has patch, and sourceHash is unchanged
  if (
    !isBuild &&
    existingRaw &&
    isSameDay &&
    hasProperPatchFormat &&
    existingRaw.sourceHash === sourceHash &&
    existingRaw.buildId
  ) {
    return {
      version: existingRaw.version!,
      releaseDate: dateStr,
      patch: parsedExisting!.patch,
      buildId: existingRaw.buildId!,
      buildTime: existingRaw.buildTime || new Date().toISOString(),
      sourceHash,
    };
  }

  // Date rollover protection: ONLY increment patch when existing releaseDate matches today's KST date.
  // When a new KST day starts, patch always resets to 1 (VYYYY.MM.DD.01).
  let nextPatch = 1;
  if (isSameDay && parsedExisting) {
    nextPatch = parsedExisting.patch > 0 ? parsedExisting.patch + 1 : 1;
  }

  const paddedPatch = String(nextPatch).padStart(2, '0');
  const releaseVersion = `V${dateStr}.${paddedPatch}`;
  const buildId = `${releaseVersion}-${sourceHash.slice(0, 8)}`;
  const buildTime = new Date().toISOString();

  const info: VersionFileInfo = {
    version: releaseVersion,
    releaseDate: dateStr,
    patch: nextPatch,
    buildId,
    buildTime,
    sourceHash,
  };

  try {
    fs.writeFileSync(versionFilePath, JSON.stringify(info, null, 2) + '\n', 'utf-8');
  } catch (err) {
    console.debug('[Vite] Could not write public/version.json:', err);
  }
  return info;
};

export default defineConfig(({ command }) => {
  const versionInfo = ensureVersionFile(command === 'build');

  return {
    define: {
      'import.meta.env.VITE_APP_BUILD_DATE': JSON.stringify(versionInfo.releaseDate),
      'import.meta.env.VITE_APP_RELEASE_VERSION': JSON.stringify(versionInfo.version),
      __APP_BUILD_DATE__: JSON.stringify(versionInfo.releaseDate),
      __APP_RELEASE_VERSION__: JSON.stringify(versionInfo.version),
      __APP_BUILD_ID__: JSON.stringify(versionInfo.buildId),
      __APP_BUILD_TIME_KST__: JSON.stringify(versionInfo.buildTime),
      __APP_PATCH_NUMBER__: JSON.stringify(versionInfo.patch),
    },
    plugins: [
      react(), 
      tailwindcss(), 
      aistudioMediaPlugin(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'logo.svg', 'logo.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
        manifest: {
          id: '/',
          name: '쌤타임 - 실시간 수업시간표 조회 시스템',
          short_name: '쌤타임',
          description: '상일미디어고등학교 실시간 수업시간표 조회 시스템',
          theme_color: '#0f2347',
          background_color: '#0f2347',
          display: 'standalone',
          display_override: ['fullscreen', 'standalone', 'window-controls-overlay'],
          orientation: 'any',
          start_url: '/',
          scope: '/',
          prefer_related_applications: false,
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/apple-touch-icon.png',
              sizes: '180x180',
              type: 'image/png',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
          navigateFallbackDenylist: [/^\/api\//, /^\/version\.json$/],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
        devOptions: {
          enabled: false,
        },
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
