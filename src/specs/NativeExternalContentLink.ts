import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  // Eligibility gate -> fresh external-transaction token -> Play link-out.
  // outcome: 'launched' (open the URL), 'user_canceled', 'ineligible', 'error'.
  prepareExternalLink(checkoutUrl: string): Promise<{
    outcome: string;
    token?: string;
  }>;
  // Best-effort post-ownership report; a logged no-op while US enforcement is off.
  reportExternalContentLink(purchaseId: string, token: string): Promise<void>;
}

// Optional, Android-only: null on iOS and when the module is not registered.
export default TurboModuleRegistry.get<Spec>('ExternalContentLinkModule');
