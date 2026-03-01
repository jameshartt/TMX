/**
 * Tournament actions modal for managing tournament state.
 * Handles upload, claim, and export operations.
 */
import { getLoginState } from 'services/authentication/loginState';
import { tournamentEngine } from 'tods-competition-factory';
import { sendTournament } from 'services/apis/servicesApi';
import { findAncestor } from 'services/dom/parentAndChild';
import { tmxToast } from 'services/notifications/tmxToast';
import { downloadUTRmatches } from 'services/export/UTR';
import { downloadJSON } from 'services/export/download';
import { success } from 'components/notices/success';
import { failure } from 'components/notices/failure';
import { renderForm } from 'courthive-components';
import { openModal } from './baseModal/baseModal';
import { tmx2db } from 'services/storage/tmx2db';
import { context } from 'services/context';
import { t } from 'i18n';

import { ADMIN } from 'constants/tmxConstants';

export function tournamentActions(): void {
  const tournamentRecord = tournamentEngine.getTournament().tournamentRecord;
  const provider = tournamentRecord?.parentOrganisation;
  const providerId = provider?.organisationId;
  const state = getLoginState();
  const canDelete = state?.permissions?.includes('deleteTournament');
  const admin = state?.roles?.includes(ADMIN);

  let inputs: any;
  const takeAction = () => {
    if (inputs.action.value === 'upload' && inputs.replace.checked) {
      const tournamentRecord = tournamentEngine.getTournament().tournamentRecord;
      return tmxToast({
        action: {
          onClick: () => sendTournament({ tournamentRecord }).then(success, failure),
          text: 'Send??',
        },
        message: t('modals.tournamentActions.uploadTournament'),
        intent: 'is-danger',
      });
    }

    if (inputs.action.value === 'claim' && state?.provider) {
      const tournamentRecord = tournamentEngine.getTournament().tournamentRecord;
      if (!tournamentRecord.parentOrganisation) {
        tournamentRecord.parentOrganisation = state.provider;
        tournamentEngine.setState(tournamentRecord);
        const successClaim = () => {
          tmx2db.deleteTournament(tournamentRecord.tournamentId);
          context.router?.navigate(`/tournament/${tournamentRecord.tournamentId}/detail`);
          tmxToast({
            message: t('modals.tournamentActions.tournamentClaimed'),
            intent: 'is-info',
          });
        };
        const failureClaim = (error: any) => {
          tmxToast({
            message: error.message || t('modals.tournamentActions.notClaimed'),
            intent: 'is-danger',
          });
        };
        sendTournament({ tournamentRecord }).then(successClaim, failureClaim);
      }
    }

    if (inputs.action.value === 'utrExport') downloadUTRmatches();
    if (inputs.action.value === 'todsExport') {
      if (tournamentRecord) {
        downloadJSON(`${tournamentRecord.tournamentId}.tods.json`, tournamentRecord);
      } else {
        tmxToast({ message: t('common.error') });
      }
    }
  };

  const relationships = [
    {
      control: 'replace',
      onChange: ({ e }: any) => {
        const button = document.getElementById('go') as HTMLButtonElement;
        if (button) button.disabled = !e.target.checked;
      },
    },
    {
      control: 'action',
      onChange: ({ e }: any) => {
        const replaceTick = document.getElementById('replace');
        const field = findAncestor(replaceTick, 'field');
        if (field) field.style.display = e.target.value === 'upload' ? 'block' : 'none';
        const button = document.getElementById('go') as HTMLButtonElement;
        if (button) button.disabled = inputs.action.value === 'upload';
      },
    },
  ];

  const options = [
    { label: t('modals.tournamentActions.selectAction'), close: true },
    providerId && { label: t('modals.tournamentActions.uploadTournament'), value: 'upload', close: true },
    tournamentRecord && {
      label: t('modals.tournamentActions.deleteTournament'),
      disabled: !canDelete,
      value: 'delete',
      close: true,
    },
    tournamentRecord &&
      !providerId &&
      state?.provider && { label: t('modals.tournamentActions.claimTournament'), value: 'claim', close: true },
    tournamentRecord && admin && { label: t('modals.tournamentActions.exportUtr'), value: 'utrExport' },
    tournamentRecord && admin && { label: t('modals.tournamentActions.exportTods'), value: 'todsExport' },
  ].filter(Boolean);

  if (options.length < 2) return tmxToast({ message: t('modals.tournamentActions.noActions') });

  const content = (elem: HTMLElement) =>
    (inputs = renderForm(
      elem,
      [
        { label: t('act'), field: 'action', options },
        {
          label: t('modals.tournamentActions.replaceTournament'),
          field: 'replace',
          visible: false,
          checkbox: true,
          id: 'replace',
        },
      ],
      relationships,
    ));

  openModal({
    title: t('modals.tournamentActions.title'),
    content,
    buttons: [
      { label: t('common.cancel'), intent: 'none', close: true },
      {
        label: t('modals.tournamentActions.go'),
        id: 'go',
        intent: 'is-danger',
        disabled: true,
        onClick: takeAction,
        close: true,
      },
    ],
  });
}
