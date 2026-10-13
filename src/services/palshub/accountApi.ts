import {clientHeaders, getApiBase} from './apiBase';

export const DELETE_TIMEOUT_MS = 15000;

export type DeleteAccountOutcome =
  | {kind: 'deleted'}
  | {kind: 'cancelled'}
  | {kind: 'sign_in_again'}
  | {kind: 'creator'; contact: string}
  | {kind: 'failed'};

export type DeleteAttempt = Exclude<DeleteAccountOutcome, {kind: 'cancelled'}>;

export type DeleteRequestBody = {apple_authorization_code?: string};

const mapConflict = (body: unknown): DeleteAttempt => {
  const {error, contact} = (body ?? {}) as {error?: unknown; contact?: unknown};
  return error === 'creator_contact_support' &&
    typeof contact === 'string' &&
    contact.trim() !== ''
    ? {kind: 'creator', contact}
    : {kind: 'failed'};
};

export const mapDeleteResponse = (
  status: number,
  body: unknown,
): DeleteAttempt => {
  if (status === 200 || status === 410) {
    return {kind: 'deleted'};
  }
  if (status === 401) {
    return {kind: 'sign_in_again'};
  }
  return status === 409 ? mapConflict(body) : {kind: 'failed'};
};

export const postAccountDelete = async (
  body: DeleteRequestBody,
  authorization: string,
): Promise<DeleteAttempt> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELETE_TIMEOUT_MS);
  try {
    const response = await fetch(`${getApiBase()}/api/mobile/account/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...clientHeaders(),
        Authorization: authorization,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json =
      response.status === 409 ? await response.json().catch(() => null) : null;
    const attempt = mapDeleteResponse(response.status, json);
    if (attempt.kind !== 'deleted') {
      console.warn('Account deletion responded with status', response.status);
    }
    return attempt;
  } catch (error) {
    console.warn('Account deletion request failed:', (error as Error)?.name);
    return {kind: 'failed'};
  } finally {
    clearTimeout(timer);
  }
};
