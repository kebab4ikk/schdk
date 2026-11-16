import type { Action, GameState } from '../game/state';
import { scoredQuestions, standings, toCsv } from '../game/scoring';
import { useI18n } from '../i18n';

interface Props {
  state: GameState;
  dispatch: (a: Action) => void;
  packTitle: string;
}

export function Results({ state, dispatch, packTitle }: Props) {
  const { t } = useI18n();
  const rows = standings(state);
  const played = scoredQuestions(state);

  const exportCsv = () => {
    const csv = toCsv(state, {
      place: t('results.place'),
      team: t('results.team'),
      total: t('results.total'),
      rating: t('results.rating'),
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(packTitle || 'schdk').replace(/[\\/:*?"<>|]+/g, '_')} — results.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main className="page results">
      <section className="card">
        <div className="row between">
          <h2>{t('results.title')}</h2>
          <div className="row">
            <button onClick={() => dispatch({ type: 'displayView', view: 'results' })}>🖥 {t('results.showOnDisplay')}</button>
            <button className="primary" onClick={exportCsv} disabled={rows.length === 0}>
              ⬇ {t('results.export')}
            </button>
          </div>
        </div>
        {played.length === 0 && <p className="muted">{t('results.empty')}</p>}
        <div className="table-scroll">
          <table className="results-table">
            <thead>
              <tr>
                <th>{t('results.place')}</th>
                <th className="team">{t('results.team')}</th>
                {Array.from({ length: state.questionCount }, (_, i) => (
                  <th key={i} className={`qcol ${state.removed.includes(i) ? 'removed' : ''}`}>
                    <button className="link" onClick={() => dispatch({ type: 'goto', index: i })} onDoubleClick={() => dispatch({ type: 'screen', screen: 'game' })}>
                      {i + 1}
                    </button>
                  </th>
                ))}
                <th>{t('results.total')}</th>
                <th>{t('results.rating')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.team.id}>
                  <td>{r.place}</td>
                  <td className="team">{r.team.name}</td>
                  {r.marks.map((m, i) => (
                    <td key={i} className={`qcol mark ${m === true ? 'ok' : m === false ? 'no' : ''}`}>
                      {m === true ? '1' : m === false ? '·' : ''}
                    </td>
                  ))}
                  <td className="total">{r.total}</td>
                  <td>{r.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">{t('results.ratingHelp')}</p>
      </section>
    </main>
  );
}
