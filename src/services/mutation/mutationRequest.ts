/**
 * Mutation request handler — server-only execution.
 * All mutations go through the server; local engine execution happens after server acknowledgement.
 */
import { getLoginState, styleLogin } from 'services/authentication/loginState';
import { tmxToast } from 'services/notifications/tmxToast';
import { emitTmx } from 'services/messaging/socketIo';
import * as factory from 'tods-competition-factory';
import { isFunction } from 'functions/typeOf';
import { context } from 'services/context';
import { env } from 'settings/env';
import { t } from 'i18n';
import dayjs from 'dayjs';

// constants
import { SET_TOURNAMENT_DATES } from 'constants/mutationConstants';
import { SUPER_ADMIN, TOURNAMENT_ENGINE } from 'constants/tmxConstants';

interface MutationParams {
  tournamentRecord?: any;
  methods: any[];
  engine?: string;
  callback?: (result: any) => void;
}

export async function mutationRequest(params: MutationParams): Promise<void> {
  const { tournamentRecord, methods, engine = TOURNAMENT_ENGINE, callback } = params;
  const state = getLoginState();

  const completion = (result?: any): void => {
    if (tournamentRecord) factory[engine].reset();
    if (callback && isFunction(callback)) {
      callback(result);
    } else if (result?.error) {
      tmxToast({ message: result.error.message ?? t('common.error'), intent: 'is-danger' });
    }
  };

  if (!Array.isArray(methods)) return completion();
  const factoryEngine = factory[engine];
  if (!factoryEngine) return completion();

  if (tournamentRecord) factoryEngine.setState(tournamentRecord);

  const getProviderId = (tournamentRecord: any) => tournamentRecord?.parentOrganisation?.organisationId;
  const tournamentRecords = factoryEngine.getState()?.tournamentRecords ?? {};

  const tournamentIds = Object.values(tournamentRecords)?.map((record: any) => record.tournamentId);
  let providerIds = factory.tools.unique(Object.values(tournamentRecords)?.map(getProviderId)).filter(Boolean);
  if (providerIds.length > 1) return tmxToast({ message: t('toasts.multipleProviders'), intent: 'is-danger' });

  // Fall back to login state provider when tournament record lacks parentOrganisation
  if (!providerIds.length) {
    const stateProviderId = state?.provider?.organisationId || state?.providerId;
    if (stateProviderId) providerIds = [stateProviderId];
  }

  const isDateChange = methods.some((m: any) => m.method === SET_TOURNAMENT_DATES);
  const now = new Date().getTime();
  const inDateRange =
    isDateChange ||
    Object.values(tournamentRecords).every((record: any) => {
      const endTime = dayjs(record.endDate).endOf('day').valueOf();
      return !!(endTime && endTime >= now);
    });

  const mutate = () => makeMutation({ methods, factoryEngine, tournamentIds, completion });
  if (!inDateRange) {
    queryDateRange({ state, providerIds, mutate });
    return;
  }
  if (providerIds.length) {
    checkPermissions({ state, providerIds, mutate });
    return;
  }

  // No provider and not logged in
  tmxToast({ message: t('toasts.notLoggedIn'), intent: 'is-warning' });
}

function queryDateRange({
  state,
  providerIds,
  mutate,
}: {
  state: any;
  providerIds: string[];
  mutate: () => Promise<void>;
}): void {
  const onClick = () => (providerIds?.length ? checkPermissions({ state, providerIds, mutate }) : mutate());
  return tmxToast({
    action: { onClick, text: 'Modify?' },
    message: t('toasts.notInDateRange'),
    intent: 'is-danger',
    pauseOnHover: true,
    duration: 8000,
  });
}

function checkPermissions({
  state,
  providerIds,
  mutate,
}: {
  state: any;
  providerIds: string[];
  mutate: () => Promise<void>;
}): void {
  if (!state) {
    context.provider = undefined;
    styleLogin(false);
    return tmxToast({ message: t('toasts.notLoggedIn'), intent: 'is-warning' });
  }

  const isProvider = !!(
    state?.providerIds?.includes(providerIds[0]) || state?.provider?.organisationId === providerIds[0]
  );
  const isSuperAdmin = state?.roles?.includes(SUPER_ADMIN);
  const impersonating = context.provider?.organisationId === providerIds[0];

  if (!isProvider && !isSuperAdmin) return tmxToast({ message: t('toasts.notAuthorized'), intent: 'is-danger' });
  if (!isProvider && isSuperAdmin && !impersonating) {
    const impersonateProvider = () => {
      context.provider = { organisationId: providerIds[0] };
      return mutate();
    };

    return tmxToast({
      action: {
        onClick: impersonateProvider,
        text: 'Impersonate?',
      },
      message: t('toasts.superAdmin'),
      intent: 'is-danger',
    });
  }

  mutate();
}

function engineExecution({ factoryEngine, methods }: { factoryEngine: any; methods: any[] }): any {
  if (env.log?.verbose) console.log('%c executing locally', 'color: lightgreen');
  const directives = factory.tools.makeDeepCopy(methods);
  return factoryEngine.executionQueue(directives, true) || {};
}

async function makeMutation({
  methods,
  completion,
  factoryEngine,
  tournamentIds,
}: {
  methods: any[];
  completion: (result?: any) => void;
  factoryEngine: any;
  tournamentIds: string[];
}): Promise<void> {
  const hasProvider =
    factoryEngine.getTournament().tournamentRecord?.parentOrganisation?.organisationId ||
    getLoginState()?.provider?.organisationId;
  if (window['dev']?.params) {
    for (const method of methods) {
      if (window['dev'].params[method.method]) {
        method.params = { ...method.params, ...window['dev'].params[method.method] };
      }
    }
  }

  if (window?.['dev']?.getContext().internal) console.log({ methods });

  if (!hasProvider) {
    tmxToast({ message: t('toasts.notLoggedIn'), intent: 'is-warning' });
    return completion();
  }

  // Server-first: send to server, execute locally on acknowledgement
  let ackReceived = false;
  let timedOut = false;
  const ackCallback = (ack: any) => {
    if (timedOut) return;
    ackReceived = true;
    const missingTournament = ack?.error?.code === 'ERR_MISSING_TOURNAMENT';
    if (ack?.success || missingTournament) {
      const factoryResult = engineExecution({ factoryEngine, methods });
      if (factoryResult.error) return completion(factoryResult);
      return completion(factoryResult);
    } else {
      completion(ack?.error ? ack : { error: { message: 'Server rejected mutation' } });
    }
  };
  if (env.log?.verbose) console.log('%c invoking remote', 'color: lightblue');
  emitTmx({
    data: { type: 'executionQueue', payload: { methods, tournamentIds, rollbackOnError: true } },
    ackCallback,
  });
  setTimeout(() => {
    if (ackReceived) return;
    timedOut = true;
    tmxToast({ message: t('toasts.serverNotResponding'), intent: 'is-danger' });
    completion({ error: { message: 'Server not responding' } });
  }, env.serverTimeout ?? 10000);
}
