import {authService} from '../palshub/AuthService';
import {iapApi} from './iapApi';
import type {Binding} from './iapWire';

export const BINDING_TIMEOUT_MS = 2000;

const getBinding = async (): Promise<Binding | null> => {
  if (!authService.isAuthenticated) {
    return null;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), BINDING_TIMEOUT_MS);
  });
  try {
    return await Promise.race([iapApi.binding().catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
};

export const bindingSource = {getBinding};
export type BindingSource = typeof bindingSource;
