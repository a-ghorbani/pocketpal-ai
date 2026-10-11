import {Platform} from 'react-native';
import {appleAuth} from '@invertase/react-native-apple-authentication';
import {isAuthRetryableFetchError} from '@supabase/supabase-js';

import {palStore} from '../../store';
import {authService} from './AuthService';
import {getAuthHeaders, supabase} from './supabase';
import {syncService} from './SyncService';
import {postAccountDelete} from './accountApi';
import type {DeleteAccountOutcome, DeleteRequestBody} from './accountApi';

const errorName = (error: unknown) => (error as Error)?.name;

const isApplePath = () =>
  Platform.OS === 'ios' &&
  appleAuth.isSupported &&
  authService.hasAppleIdentity();

type DeleteAccountOptions = {confirmWithoutApple?: () => Promise<boolean>};

const confirmedWithoutApple = async (
  confirm: DeleteAccountOptions['confirmWithoutApple'],
): Promise<boolean> => {
  try {
    return (await confirm?.()) === true;
  } catch (error) {
    console.warn('Account deletion prompt failed:', errorName(error));
    return false;
  }
};

const requestBody = async ({
  confirmWithoutApple,
}: DeleteAccountOptions): Promise<DeleteRequestBody | null> => {
  if (!isApplePath()) {
    return {};
  }
  const apple = await authService.reauthorizeWithApple();
  if (apple.kind === 'cancelled') {
    return null;
  }
  if (apple.kind === 'unavailable') {
    return (await confirmedWithoutApple(confirmWithoutApple)) ? {} : null;
  }
  const subject = authService.appleSubject();
  return subject === null || subject === apple.appleUser
    ? {apple_authorization_code: apple.code}
    : {};
};

const refreshAfterUnauthorized = async (): Promise<
  {authorization: string} | {outcome: DeleteAccountOutcome}
> => {
  const {data, error} = await supabase!.auth.refreshSession();
  if (isAuthRetryableFetchError(error)) {
    return {outcome: {kind: 'failed'}};
  }
  return error || !data.session
    ? {outcome: {kind: 'sign_in_again'}}
    : {authorization: `Bearer ${data.session.access_token}`};
};

const signOutLocally = () =>
  authService.signOut({scope: 'local'}).catch(() => false);

const endLocalSession = async () => {
  if (!(await signOutLocally()) && !(await signOutLocally())) {
    authService.resetLocalSession();
  }
};

const clearAccountData = async () => {
  const steps = [
    endLocalSession,
    () => palStore.clearAccountPals(),
    () => syncService.clearCache(),
  ];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      console.warn('Account clean-up step failed:', errorName(error));
    }
  }
};

const requestDeletion = async (
  options: DeleteAccountOptions,
): Promise<DeleteAccountOutcome> => {
  if (!supabase) {
    return {kind: 'failed'};
  }
  const body = await requestBody(options);
  if (!body) {
    return {kind: 'cancelled'};
  }
  const {Authorization} = (await getAuthHeaders()) as {Authorization?: string};
  if (!Authorization) {
    return {kind: 'sign_in_again'};
  }
  let attempt = await postAccountDelete(body, Authorization);
  if (attempt.kind === 'unauthorized') {
    const refreshed = await refreshAfterUnauthorized();
    if ('outcome' in refreshed) {
      return refreshed.outcome;
    }
    attempt = await postAccountDelete(body, refreshed.authorization);
  }
  return attempt.kind === 'unauthorized' ? {kind: 'sign_in_again'} : attempt;
};

const runDeletion = async (
  options: DeleteAccountOptions,
): Promise<DeleteAccountOutcome> => {
  let outcome: DeleteAccountOutcome;
  try {
    outcome = await requestDeletion(options);
  } catch (error) {
    console.warn('Account deletion failed:', errorName(error));
    return {kind: 'failed'};
  }
  if (outcome.kind === 'deleted') {
    await clearAccountData();
  }
  return outcome;
};

let pending: Promise<DeleteAccountOutcome> | null = null;

export const deleteAccount = (
  options: DeleteAccountOptions = {},
): Promise<DeleteAccountOutcome> => {
  if (!pending) {
    pending = runDeletion(options).finally(() => {
      pending = null;
    });
  }
  return pending;
};
