import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { useI18n } from '../i18n';
import type { RemoteScreen } from './useRemoteScreen';

function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

/** How to connect the smartboard: QR code and link for each network the tablet is on. */
export function RemoteLink({ remote, onClose }: { remote: RemoteScreen; onClose: () => void }) {
  const { t } = useI18n();
  const codes = useMemo(() => remote.urls.map((u) => ({ url: u, svg: qrSvg(u) })), [remote.urls]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" role="dialog" aria-label={t('remote.title')} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>{t('remote.title')}</h2>
          <span className={`pill ${remote.displays > 0 ? 'pill-ok' : ''}`} data-testid="remote-count">
            {remote.displays > 0 ? t('remote.connected', { n: remote.displays }) : t('remote.notConnected')}
          </span>
        </div>
        <ol className="remote-steps">
          <li>{t('remote.step1')}</li>
          <li>{t('remote.step2')}</li>
          <li>{t('remote.step3')}</li>
        </ol>
        {codes.length === 0 && <div className="banner warn">{t('remote.noNetwork')}</div>}
        <div className="remote-codes">
          {codes.map((c) => (
            <figure key={c.url}>
              <div className="qr" dangerouslySetInnerHTML={{ __html: c.svg }} />
              <figcaption className="remote-url" data-testid="remote-url">
                {c.url}
              </figcaption>
            </figure>
          ))}
        </div>
        {codes.length > 1 && <p className="hint">{t('remote.manyNetworks')}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="primary" onClick={onClose}>
            {t('board.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
