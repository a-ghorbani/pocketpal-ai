import type {Availability, PlusFlow} from '../../store/PurchaseStore';

export type PlusScreenPhase =
  | 'purchased'
  | 'paying'
  | 'pending'
  | 'unavailable'
  | 'loading'
  | 'idle';

export interface PlusScreenInputs {
  plusUnlocked: boolean;
  plusFlow: PlusFlow;
  plusPending: boolean;
  availability: Availability;
  plusChecked: boolean;
  plusProductsLoading: boolean;
  ramBytes: number | null;
  productCount: number;
  lastBuyFailed: boolean;
  showsLicenseNotice: boolean;
  anyFeatureRunnable: boolean;
}

export interface PlusScreenState {
  phase: PlusScreenPhase;
  error: boolean;
  licence: boolean;
  unsupported: boolean;
}

const phaseOf = (inputs: PlusScreenInputs): PlusScreenPhase => {
  if (inputs.plusUnlocked) {
    return 'purchased';
  }
  if (inputs.plusFlow === 'paying') {
    return 'paying';
  }
  if (inputs.plusPending) {
    return 'pending';
  }
  if (inputs.availability === 'unavailable') {
    return 'unavailable';
  }
  if (
    inputs.availability === 'initializing' ||
    !inputs.plusChecked ||
    (inputs.plusProductsLoading && inputs.productCount === 0) ||
    inputs.ramBytes === null
  ) {
    return 'loading';
  }
  if (inputs.productCount === 0) {
    return 'unavailable';
  }
  return 'idle';
};

export const plusScreenState = (inputs: PlusScreenInputs): PlusScreenState => {
  const phase = phaseOf(inputs);
  const buying = phase === 'idle' || phase === 'paying';
  return {
    phase,
    error: phase === 'idle' && inputs.lastBuyFailed,
    licence: buying && inputs.showsLicenseNotice,
    unsupported: buying && !inputs.anyFeatureRunnable,
  };
};
