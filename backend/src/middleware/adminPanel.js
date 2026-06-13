import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const adminPanelDir = path.join(__dirname, '../../admin-panel');

function getAdminHosts() {
  return (process.env.ADMIN_HOSTS || 'admin.getkekeapp.com')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminPanelHost(hostname) {
  if (!hostname) return false;
  const host = String(hostname).toLowerCase();
  return getAdminHosts().some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );
}

export function adminPanelDirExists() {
  return (
    fs.existsSync(adminPanelDir) &&
    fs.existsSync(path.join(adminPanelDir, 'index.html'))
  );
}

/**
 * Serve admin/ static UI when request Host is admin.getkekeapp.com (or ADMIN_HOSTS).
 * Requires admin-panel/ copied into the image (see repo-root Dockerfile).
 */
export function mountAdminPanel(app) {
  if (!adminPanelDirExists()) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn(
        `Admin panel not found at ${adminPanelDir}. Build from repo root (Dockerfile) so admin UI is bundled.`
      );
    }
    return;
  }

  logger.info(`Serving admin panel from ${adminPanelDir}`);

  const staticAdmin = express.static(adminPanelDir, {
    index: 'index.html',
    setHeaders(res, filePath) {
      if (/\.(jsx|js|css|html)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
      }
    },
  });

  app.use((req, res, next) => {
    if (!isAdminPanelHost(req.hostname)) return next();
    if (req.path.startsWith('/api')) return next();
    return staticAdmin(req, res, next);
  });

  app.use((req, res, next) => {
    if (!isAdminPanelHost(req.hostname)) return next();
    if (req.path.startsWith('/api')) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(adminPanelDir, 'index.html'));
  });
}
