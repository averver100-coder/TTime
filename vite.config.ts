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

const readFirebaseConfig = (): { apiKey: string; projectId: string; databaseId: string } | null => {
  try {
    const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (!fs.existsSync(cfgPath)) return null;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    if (cfg?.projectId && cfg?.apiKey) {
      return {
        apiKey: String(cfg.apiKey),
        projectId: String(cfg.projectId),
        databaseId: String(cfg.firestoreDatabaseId || '(default)'),
      };
    }
  } catch {}
  return null;
};

const fetchRemoteVersionCounter = async (): Promise<Partial<VersionFileInfo> | null> => {
  const cfg = readFirebaseConfig();
  if (!cfg) return null;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${encodeURIComponent(cfg.databaseId)}/documents/admin/versionCounter?key=${encodeURIComponent(cfg.apiKey)}`;
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const fields = data?.fields;
    if (!fields) return null;
    return {
      version: fields.version?.stringValue,
      releaseDate: fields.releaseDate?.stringValue,
      patch: fields.patch?.integerValue ? parseInt(fields.patch.integerValue, 10) : undefined,
      buildId: fields.buildId?.stringValue,
      buildTime: fields.buildTime?.stringValue,
      sourceHash: fields.sourceHash?.stringValue,
    };
  } catch {
    return null;
  }
};

const saveRemoteVersionCounter = async (info: VersionFileInfo): Promise<void> => {
  const cfg = readFirebaseConfig();
  if (!cfg) return;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${encodeURIComponent(cfg.databaseId)}/documents/admin/versionCounter?key=${encodeURIComponent(cfg.apiKey)}`;
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(2500),
      body: JSON.stringify({
        fields: {
          version: { stringValue: info.version },
          releaseDate: { stringValue: info.releaseDate },
          patch: { integerValue: String(info.patch) },
          buildId: { stringValue: info.buildId },
          buildTime: { stringValue: info.buildTime },
          sourceHash: { stringValue: info.sourceHash },
        },
      }),
    });
  } catch {}
};

const ensureVersionFile = async (isBuild: boolean): Promise<VersionFileInfo> => {
  const publicDir = path.resolve(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  const versionFilePath = path.resolve(publicDir, 'version.json');
  const dateStr = getKSTDateString();
  const sourceHash = computeSourceHash();

  let localRaw: Partial<VersionFileInfo> | null = null;
  if (fs.existsSync(versionFilePath)) {
    try {
      localRaw = JSON.parse(fs.readFileSync(versionFilePath, 'utf-8'));
    } catch {
      localRaw = null;
    }
  }

  // Also check Firestore remote versionCounter so clean Cloud Build deploys never reset to .01
  const remoteRaw = await fetchRemoteVersionCounter();

  const evaluateCandidate = (raw: Partial<VersionFileInfo> | null): VersionFileInfo | null => {
    if (!raw) return null;
    const parsed = parseVersionMetadata(raw.version, raw.releaseDate, raw.patch);
    if (!parsed || parsed.releaseDate !== dateStr || parsed.patch < 1) return null;
    const padded = String(parsed.patch).padStart(2, '0');
    return {
      version: `V${dateStr}.${padded}`,
      releaseDate: dateStr,
      patch: parsed.patch,
      buildId: String(raw.buildId || `V${dateStr}.${padded}-${sourceHash.slice(0, 8)}`),
      buildTime: String(raw.buildTime || new Date().toISOString()),
      sourceHash: String(raw.sourceHash || ''),
    };
  };

  const todayCandidates = [evaluateCandidate(localRaw), evaluateCandidate(remoteRaw)].filter(
    (c): c is VersionFileInfo => Boolean(c)
  );
  todayCandidates.sort((a, b) => b.patch - a.patch);
  const highestToday = todayCandidates[0] || null;

  // Reuse highest same-day candidate if sourceHash matches identically across Dev & Cloud Build
  if (highestToday && highestToday.sourceHash === sourceHash) {
    try {
      fs.writeFileSync(versionFilePath, JSON.stringify(highestToday, null, 2) + '\n', 'utf-8');
    } catch {}
    if (!remoteRaw || (remoteRaw.version !== highestToday.version || remoteRaw.sourceHash !== sourceHash)) {
      await saveRemoteVersionCounter(highestToday);
    }
    return highestToday;
  }

  // Source code changed OR new KST date:
  // If same KST day -> increment highest patch + 1; if new KST date -> strictly reset to .01
  const nextPatch = highestToday ? highestToday.patch + 1 : 1;
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
  await saveRemoteVersionCounter(info);
  return info;
};

export default defineConfig(async ({ command }) => {
  const versionInfo = await ensureVersionFile(command === 'build');

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
        includeAssets: ['ttime-logo.png'],
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
          lang: 'ko-KR',
          dir: 'ltr',
          prefer_related_applications: false,
          categories: ['education', 'productivity'],
          icons: [
            {
              src: '/ttime-logo.png?v=2',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          cacheId: `ssamtime-${versionInfo.version.toLowerCase()}`,
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,ico,png,svg,webmanifest}'],
          globIgnores: ['**/index.html', '**/version.json'],
          navigateFallback: null,
          navigateFallbackDenylist: [/^\/api\//, /^\/version\.json$/],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
        devOptions: {
          enabled: false,
        },
      }),
      {
        name: 'dedupe-manifest-link',
        enforce: 'post' as const,
        transformIndexHtml: {
          order: 'post' as const,
          handler(html: string) {
            let seen = false;
            return html.replace(/<link\b[^>]*\brel=["']manifest["'][^>]*>\s*/gi, (match) => {
              if (seen) return '';
              seen = true;
              return match;
            });
          },
        },
      } satisfies Plugin,
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
