import { editTournament } from 'components/drawers/editTournamentDrawer';
import { calendarControls } from 'pages/tournaments/tournamentsControls';
import { mockTournaments, EXAMPLE_TOURNAMENT_CATALOG } from 'pages/tournaments/mockTournaments';
import { renderWelcomeView } from 'pages/tournaments/welcomeView';
import { listPicker } from 'components/modals/listPicker';
import { getLoginState } from 'services/authentication/loginState';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import { getTournamentColumns } from './getTournamentColumn';
import { destroyTipster } from 'components/popovers/tipster';
import { destroyTable } from 'pages/tournament/destroyTable';
import { tmxToast } from 'services/notifications/tmxToast';
import { getCalendar } from 'services/apis/servicesApi';
import { context } from 'services/context';
import { env } from 'settings/env';
import { t } from 'i18n';

// constants
import { TOURNAMENTS_CONTROL, TOURNAMENTS_TABLE } from 'constants/tmxConstants';

export function createTournamentsTable(): { table: any } {
  const dnav = document.getElementById('dnav');
  if (dnav) dnav.style.backgroundColor = '';
  let table: any;

  const columns = getTournamentColumns();

  const renderTable = (tableData: any[]) => {
    destroyTable({ anchorId: TOURNAMENTS_TABLE });
    const calendarAnchor = document.getElementById(TOURNAMENTS_TABLE);
    if (!calendarAnchor) return;

    if (tableData.length === 0) {
      const controlEl = document.getElementById(TOURNAMENTS_CONTROL);
      if (controlEl) controlEl.innerHTML = '';

      renderWelcomeView(calendarAnchor, {
        onGenerate: () => {
          const options = [...EXAMPLE_TOURNAMENT_CATALOG, { label: 'All', value: -1 }];
          listPicker({
            options,
            callback: ({ selection }: any) => {
              const value = selection?.selection?.value;
              const indices = value === -1 ? undefined : [value];
              mockTournaments(undefined, () => createTournamentsTable(), indices);
            },
          });
        },
        onCreate: () => editTournament({ onCreated: () => createTournamentsTable() }),
      });
      return;
    }

    table = new Tabulator(calendarAnchor, {
      height: window.innerHeight * (env.tableHeightMultiplier ?? 0.85),
      placeholder: 'No tournaments',
      layout: 'fitColumns',
      index: 'tournamentId',
      headerVisible: false,
      reactiveData: true,
      data: tableData,
      columns,
    });

    table.on('tableBuilt', () => calendarControls(table));
    table.on('scrollVertical', destroyTipster);
  };

  const renderCalendarTable = ({ tournaments, provider }: { tournaments: any[]; provider: any }) => {
    const sortedTournaments = [...tournaments].sort(
      (a, b) => new Date(b.tournament.startDate).getTime() - new Date(a.tournament.startDate).getTime(),
    );
    const tableData = sortedTournaments.map((t) => {
      const offline = t.tournament.timeItemValues?.TMX?.offline;
      t.tournament.offline = offline;
      const tournamentImageURL = t.tournament.onlineResources?.find(
        ({ name, resourceType }: any) => name === 'tournamentImage' && resourceType === 'URL',
      )?.identifier;
      if (tournamentImageURL) {
        t.tournament.tournamentImageURL = tournamentImageURL;
      }
      return { ...t, provider };
    });
    renderTable(tableData);
  };
  const loginState = getLoginState();
  const provider = loginState?.provider || context?.provider;

  if (provider?.organisationAbbreviation) {
    const showResults = (result: any) => {
      if (result?.data?.calendar) {
        renderCalendarTable(result.data.calendar);
      } else {
        // No calendar data — show welcome view with functional handlers
        destroyTable({ anchorId: TOURNAMENTS_TABLE });
        const calendarAnchor = document.getElementById(TOURNAMENTS_TABLE);
        const controlEl = document.getElementById(TOURNAMENTS_CONTROL);
        if (controlEl) controlEl.innerHTML = '';
        if (calendarAnchor) {
          renderWelcomeView(calendarAnchor, {
            onGenerate: () => {
              const options = [...EXAMPLE_TOURNAMENT_CATALOG, { label: 'All', value: -1 }];
              listPicker({
                options,
                callback: ({ selection }: any) => {
                  const value = selection?.selection?.value;
                  const indices = value === -1 ? undefined : [value];
                  mockTournaments(undefined, () => createTournamentsTable(), indices);
                },
              });
            },
            onCreate: () => editTournament({ onCreated: () => createTournamentsTable() }),
          });
        }
      }
    };
    getCalendar({ providerAbbr: provider.organisationAbbreviation }).then(showResults);
  } else {
    // Not logged in — show welcome view with login prompt
    destroyTable({ anchorId: TOURNAMENTS_TABLE });
    const calendarAnchor = document.getElementById(TOURNAMENTS_TABLE);
    const controlEl = document.getElementById(TOURNAMENTS_CONTROL);
    if (controlEl) controlEl.innerHTML = '';
    if (calendarAnchor) {
      renderWelcomeView(calendarAnchor, {
        onGenerate: () => tmxToast({ message: t('toasts.notLoggedIn'), intent: 'is-warning' }),
        onCreate: () => tmxToast({ message: t('toasts.notLoggedIn'), intent: 'is-warning' }),
      });
    }
  }

  return { table };
}
