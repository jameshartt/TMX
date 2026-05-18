/**
 * Import tournament records from file via dropzone modal or native dialog.
 * Parses TODS JSON and adds tournaments to calendar table with conflict handling.
 * Requires authentication — imported tournaments are sent to the server.
 */
import { mapTournamentRecord } from 'pages/tournaments/mapTournamentRecord';
import { getLoginState } from 'services/authentication/loginState';
import { sendTournament } from 'services/apis/servicesApi';
import { addOrUpdateTournament } from './addOrUpdateTournament';
import { dropzoneModal } from 'components/modals/dropzoneModal';
import { tournamentEngine } from 'services/factory/engine';
import { tmxToast } from 'services/notifications/tmxToast';
import * as safeJSON from 'utilities/safeJSON';
import { platform } from 'platform';
import { t } from 'i18n';

function processImportData(data: string, tournamentIds: string[], table: any): void {
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
      // Server-first import: only persist locally after the server accepts.
      // sendTournament errors are surfaced via toast (preserves the
      // jim-tennis-deploy 50b60c51 behaviour: no IndexedDB-only ghosts).
      sendTournament({ tournamentRecord }).then(
        () => addTournament({ tournamentRecord, tournamentIds, table }),
        () => {
          tmxToast({ message: t('common.error'), intent: 'is-danger' });
        },
      );
    } else {
      console.log(result);
    }
  }
}

export function importTournaments({ table }: { table: any }): void {
  if (!getLoginState()) {
    tmxToast({ message: t('toasts.notLoggedIn'), intent: 'is-warning' });
    return;
  }

  const tournamentIds = table.getData().map((t: any) => t.tournamentId);

  if (platform.canAccessFileSystem() && platform.showOpenDialog && platform.readFile) {
    platform
      .showOpenDialog({
        title: 'Import Tournament',
        filters: [{ name: 'TODS JSON', extensions: ['json'] }],
        multiple: true,
      })
      .then(async (filePaths) => {
        if (!filePaths) return;
        for (const filePath of filePaths) {
          const bytes = await platform.readFile!(filePath);
          const data = new TextDecoder().decode(bytes);
          processImportData(data, tournamentIds, table);
        }
      });
    return;
  }

  dropzoneModal({
    callback: (data: string) => processImportData(data, tournamentIds, table),
    extensions: ['json'],
    accept: 'application/json',
  });
}

export async function addTournament({
  tournamentRecord,
  tournamentIds,
  table,
  callback,
}: {
  tournamentRecord: any;
  tournamentIds?: string[];
  table?: any;
  callback?: () => void;
}): Promise<void> {
  const rowData = mapTournamentRecord(tournamentRecord);
  const existsInCalendar = tournamentIds?.includes(tournamentRecord.tournamentId);
  if (existsInCalendar) {
    table?.updateOrAddData([rowData], true);
  } else {
    table?.addData([rowData], true);
  }
  await addOrUpdateTournament({ tournamentRecord });
  callback?.();
}
