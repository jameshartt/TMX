/**
 * Import tournament records from file via dropzone modal.
 * Parses TODS JSON and adds tournaments to calendar table with conflict handling.
 * Requires authentication — imported tournaments are sent to the server.
 */
import { mapTournamentRecord } from 'pages/tournaments/mapTournamentRecord';
import { getLoginState } from 'services/authentication/loginState';
import { sendTournament } from 'services/apis/servicesApi';
import { addOrUpdateTournament } from './addOrUpdateTournament';
import { dropzoneModal } from 'components/modals/dropzoneModal';
import { tournamentEngine } from 'tods-competition-factory';
import { tmxToast } from 'services/notifications/tmxToast';
import * as safeJSON from 'utilities/safeJSON';
import { isFunction } from 'functions/typeOf';
import { t } from 'i18n';

export function importTournaments({ table }: { table: any }): void {
  if (!getLoginState()) {
    tmxToast({ message: t('toasts.notLoggedIn'), intent: 'is-warning' });
    return;
  }

  const tournamentIds = table.getData().map((t: any) => t.tournamentId);

  (dropzoneModal as any)({
    callback: (data: string) => {
      const tournament = safeJSON.parse({ data });
      if (tournament) {
        let result, tournamentRecord;
        if (tournament.tournamentId && tournament.startDate) {
          tournamentRecord = tournament;
        } else if (tournament.tuid && tournament.start) {
          tmxToast({ message: t('toasts.tmxClassicNotConverted') });
        }

        result = tournamentEngine.setState(tournamentRecord);

        if (result.success) {
          sendTournament({ tournamentRecord }).then(
            (response) => {
              if (response?.data?.error) return;
              addTournament({ tournamentRecord, tournamentIds, table });
            },
            () => {
              tmxToast({ message: t('common.error'), intent: 'is-danger' });
            },
          );
        } else {
          console.log(result);
        }
      }
    },
  });
}

export function addTournament({
  tournamentRecord,
  tournamentIds,
  table,
  callback,
}: {
  tournamentRecord: any;
  tournamentIds?: string[];
  table?: any;
  callback?: () => void;
}): void {
  const rowData = mapTournamentRecord(tournamentRecord);
  const existsInCalendar = tournamentIds?.includes(tournamentRecord.tournamentId);
  if (existsInCalendar) {
    table?.updateOrAddData([rowData], true);
  } else {
    table?.addData([rowData], true);
  }
  addOrUpdateTournament({ tournamentRecord });
  isFunction(callback) && callback?.();
}
