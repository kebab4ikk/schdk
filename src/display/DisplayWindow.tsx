import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Opens a second browser window (to drag onto the projector) and lets React render into it with a
 * portal, so both windows share one state with no messaging. An about:blank popup has the opener's
 * origin, so this works from a file:// page too.
 */
export function useDisplayWindow(onKeyDown: (e: KeyboardEvent) => void, title: string) {
  const [win, setWin] = useState<Window | null>(null);
  const [blocked, setBlocked] = useState(false);
  const keyRef = useRef(onKeyDown);
  keyRef.current = onKeyDown;

  const open = useCallback(() => {
    if (win && !win.closed) {
      win.focus();
      return;
    }
    const w = window.open('', 'schdk-display', 'popup,width=1280,height=720');
    if (!w) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    w.document.open();
    w.document.write('<!doctype html><html><head><meta charset="utf-8"></head><body class="display-body"><div id="display-root"></div></body></html>');
    w.document.close();
    // Copy the app's styles: inline <style> in the single-file build, <style>/<link> in dev.
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      w.document.head.appendChild(w.document.importNode(node, true));
    });
    setWin(w);
  }, [win]);

  const close = useCallback(() => {
    win?.close();
    setWin(null);
  }, [win]);

  useEffect(() => {
    if (!win) return;
    win.document.title = title;
  }, [win, title]);

  useEffect(() => {
    if (!win) return;
    const onUnload = () => setWin(null);
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    const onDbl = () => {
      const d = win.document;
      if (d.fullscreenElement) void d.exitFullscreen();
      else void d.documentElement.requestFullscreen?.().catch(() => undefined);
    };
    win.addEventListener('pagehide', onUnload);
    win.addEventListener('keydown', onKey);
    win.addEventListener('dblclick', onDbl);
    // Closing the host window takes the display with it.
    const closeChild = () => win.close();
    window.addEventListener('pagehide', closeChild);
    // Some browsers don't fire pagehide on popups reliably; poll as a fallback.
    const poll = window.setInterval(() => win.closed && setWin(null), 1000);
    return () => {
      win.removeEventListener('pagehide', onUnload);
      win.removeEventListener('keydown', onKey);
      win.removeEventListener('dblclick', onDbl);
      window.removeEventListener('pagehide', closeChild);
      window.clearInterval(poll);
    };
  }, [win]);

  const container = win && !win.closed ? win.document.getElementById('display-root') : null;
  return { isOpen: !!container, open, close, blocked, container, win };
}

export function DisplayPortal({ container, children }: { container: Element | null; children: ReactNode }) {
  return container ? createPortal(children, container) : null;
}
