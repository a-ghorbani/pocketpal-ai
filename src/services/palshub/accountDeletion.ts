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

const requestBody = async (): Promise<DeleteRequestBody | null> => {
  if (!isApplePath()) {
    return {};
  }
  const apple = await authService.reauthorizeWithApple();
  if (apple.kind === 'cancelled') {
    return null;
  }
  if (apple.kind === 'code') {
    const subject = authService.appleSubject();
    if (subject === null || subject === apple.appleUser) {
      return {apple_authorization_code: apple.code};
    }
  }
  return {};
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

const clearAccountData = async () => {
  const steps = [
    () => authService.signOut({scope: 'local'}),
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

const requestDeletion = async (): Promise<DeleteAccountOutcome> => {
  if (!supabase) {
    return {kind: 'failed'};
  }
  const body = await requestBody();
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

const runDeletion = async (): Promise<DeleteAccountOutcome> => {
  let outcome: DeleteAccountOutcome;
  try {
    outcome = await requestDeletion();
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

export const deleteAccount = (): Promise<DeleteAccountOutcome> => {
  if (!pending) {
    pending = runDeletion().finally(() => {
      pending = null;
    });
  }
  return pending;
};
