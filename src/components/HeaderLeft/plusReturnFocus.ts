import type {HostInstance} from 'react-native';

let target: HostInstance | null = null;

export const claimPlusReturnFocus = (node: HostInstance | null): void => {
  target = node;
};

export const releasePlusReturnFocus = (node: HostInstance | null): void => {
  if (target === node) {
    target = null;
  }
};

export const plusReturnFocusTarget = (): HostInstance | null => target;
