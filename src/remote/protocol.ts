/**
 * Protocol between the host page and the screen server built into the Android app
 * (android/app/src/main/java/app/schdk/host/ScreenServer.java). Kept in one place so the two
 * sides stay in step.
 *
 *   GET  /                → the app (host UI), for the tablet's own WebView
 *   GET  /display         → the same app in remote-screen mode, for the smartboard
 *   GET  /api/info        → InfoResponse; only from the tablet itself (loopback)
 *   POST /api/model       → body: RemotePayload; needs the X-Token header
 *   PUT  /api/media       → body: media bytes; needs X-Token; served at GET /api/media
 *   GET  /api/events      → server-sent events, `data:` = latest RemotePayload JSON
 */
import type { DisplayModel } from '../display/model';
import type { Lang } from '../i18n';

export interface InfoResponse {
  /** Secret that authorises POST/PUT; only handed to the tablet itself. */
  token: string;
  port: number;
  /** Links the smartboard can open, one per network interface (Wi-Fi, hotspot…). */
  urls: string[];
  /** Number of screens currently connected to /api/events. */
  displays: number;
}

export interface RemotePayload {
  model: DisplayModel;
  lang: Lang;
}

export const DISPLAY_PATH = '/display';

export const isDisplayPath = (pathname: string) => pathname.replace(/\/+$/, '') === DISPLAY_PATH;
