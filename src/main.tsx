import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from './i18n';
import { App } from './App';
import { DisplayClient } from './remote/DisplayClient';
import { isDisplayPath } from './remote/protocol';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      {isDisplayPath(location.pathname) ? <DisplayClient /> : <App />}
    </I18nProvider>
  </StrictMode>,
);
