import { useEffect, useRef, useState } from 'react';
import { Display } from '../display/Display';
import type { DisplayModel } from '../display/model';
import { useI18n } from '../i18n';
import { signals } from '../audio/signals';
import { useSignals } from '../audio/useSignals';
import type { RemotePayload } from './protocol';

/**
 * The smartboard's page: shows whatever the tablet sends over server-sent events.
 * It never has the question pack, only the current players' view.
 */
export function DisplayClient() {
  const { t, setLang } = useI18n();
  const [model, setModel] = useState<DisplayModel | null>(null);
  const [connected, setConnected] = useState(false);
  const [started, setStarted] = useState(false);
  const receivedAt = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false); // EventSource reconnects by itself.
    es.onmessage = (e) => {
      try {
        const p = JSON.parse(e.data) as RemotePayload;
        receivedAt.current = Date.now();
        setNow(receivedAt.current);
        setModel(p.model);
        setLang(p.lang);
        setConnected(true);
      } catch {
        /* ignore a malformed message */
      }
    };
    return () => es.close();
  }, [setLang]);

  const running = !!model?.timer.running;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [running]);

  // Count down locally from the last snapshot; the tablet resends on every change.
  const remainingMs = model ? (running ? Math.max(0, model.timer.remainingMs - (now - receivedAt.current)) : model.timer.remainingMs) : 0;

  useSignals({
    enabled: started && !!model?.sound,
    phase: model?.phase ?? 'reading',
    running,
    remainingMs,
    mainSeconds: model?.mainSeconds ?? 60,
    questionKey: model?.questionKey ?? '',
  });

  // Browsers allow sound and full screen only after a tap on this device.
  const start = () => {
    signals.unlock();
    setStarted(true);
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div className="remote-display" onDoubleClick={start}>
      {model ? (
        <Display model={model} remainingMs={remainingMs} playsMedia={started} />
      ) : (
        <div className="display">
          <div className="display-logo">
            <div className="logo-mark">?</div>
            <h1>Що? Де? Коли?</h1>
            <p className="logo-date">{t('remote.waiting')}</p>
          </div>
        </div>
      )}
      {!started && (
        <button className="remote-start" onClick={start}>
          {t('remote.tapToStart')}
        </button>
      )}
      {!connected && <div className="remote-offline">{t('remote.offline')}</div>}
    </div>
  );
}
