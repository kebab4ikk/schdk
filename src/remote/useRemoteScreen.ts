import { useCallback, useEffect, useRef, useState } from 'react';
import type { DisplayModel } from '../display/model';
import type { Lang } from '../i18n';
import type { InfoResponse, RemotePayload } from './protocol';

export interface RemoteScreen {
  /** True when this page runs inside the Android app, next to its screen server. */
  available: boolean;
  urls: string[];
  displays: number;
}

const POLL_MS = 3000;

/**
 * When the host page is served by the Android app's screen server, keeps the smartboard in sync:
 * pushes the players' view on every change (and as a heartbeat), and uploads the current
 * question's media so the board can load it. Does nothing when opened from a file.
 *
 * `getModel` must build the model at call time: it carries a timer snapshot, and the board
 * counts down from the moment it receives it.
 */
export function useRemoteScreen(getModel: () => DisplayModel, lang: Lang, changeKey: unknown): RemoteScreen {
  const [info, setInfo] = useState<InfoResponse | null>(null);
  const token = info?.token;
  /** Upload state per slot: 'q' = question media, 'a' = answer media. */
  const media = useRef<Record<Slot, { src: string | null; remote: string | null; seq: number }>>({
    q: { src: null, remote: null, seq: 0 },
    a: { src: null, remote: null, seq: 0 },
  });
  const getModelRef = useRef(getModel);
  getModelRef.current = getModel;
  const langRef = useRef(lang);
  langRef.current = lang;

  const send = useCallback(async () => {
    if (!token) return;
    const model = getModelRef.current();
    const q = model.question;
    // For each slot: a new local file (blob:/data:) is uploaded first; until it is up, the board
    // gets no media for that slot. http(s) links are passed through as they are.
    const remoteSrc = (slot: Slot, src: string | undefined): string | undefined => {
      const m = media.current[slot];
      const s = src ?? null;
      if (s !== m.src) {
        m.src = s;
        m.remote = null;
        const seq = ++m.seq;
        if (s && /^(blob:|data:)/.test(s)) {
          void uploadMedia(s, slot, token).then((ok) => {
            const cur = media.current[slot];
            if (ok && cur.seq === seq) {
              cur.remote = `/api/media?slot=${slot}&v=${seq}`;
              void send();
            }
          });
        } else if (s) m.remote = s;
      }
      return m.remote ?? undefined;
    };
    const withSrc = <T extends { src: string }>(m: T | undefined, slot: Slot): T | undefined => {
      const src = remoteSrc(slot, m?.src);
      return m && src ? { ...m, src } : undefined;
    };
    const remoteModel: DisplayModel = q
      ? {
          ...model,
          question: {
            ...q,
            media: withSrc(q.media, 'q'),
            reveal: q.reveal && { ...q.reveal, media: withSrc(q.reveal.media, 'a') },
          },
        }
      : model;
    const payload: RemotePayload = { model: remoteModel, lang: langRef.current };
    try {
      await fetch('/api/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Token': token },
        body: JSON.stringify(payload),
      });
    } catch {
      /* server gone (app in background); the heartbeat retries */
    }
  }, [token]);

  // Discover the server, and keep the link list and screen count fresh.
  useEffect(() => {
    if (!/^https?:$/.test(location.protocol)) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/info', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as InfoResponse;
        if (!stop) setInfo((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      } catch {
        if (!stop) setInfo(null);
      }
    };
    void poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  // Push on every change of what the players see…
  useEffect(() => {
    void send();
  }, [send, changeKey, lang]);
  // …and as a heartbeat, so a board that reconnects or a restarted server catches up.
  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(() => void send(), POLL_MS);
    return () => window.clearInterval(id);
  }, [send, token]);

  return { available: !!info, urls: info?.urls ?? [], displays: info?.displays ?? 0 };
}

type Slot = 'q' | 'a';

async function uploadMedia(src: string, slot: Slot, token: string): Promise<boolean> {
  try {
    const blob = await (await fetch(src)).blob();
    const res = await fetch(`/api/media?slot=${slot}`, {
      method: 'PUT',
      headers: { 'Content-Type': blob.type || 'application/octet-stream', 'X-Token': token },
      body: blob,
    });
    return res.ok;
  } catch {
    return false;
  }
}
