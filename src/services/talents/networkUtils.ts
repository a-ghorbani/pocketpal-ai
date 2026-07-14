import {uiStore} from '../../store';

export function checkNetworkAccess(): boolean {
  if (process.env.NODE_ENV === 'test') {
    return true;
  }
  return uiStore.enableNetworkAccess;
}

export function getNetworkDisabledError(name: string): {
  type: 'error';
  summary: string;
  errorMessage: string;
} {
  return {
    type: 'error',
    summary: `${name}: network access is disabled`,
    errorMessage:
      'Network access is currently disabled. Please enable it in Settings > Network & API to use this feature.',
  };
}
