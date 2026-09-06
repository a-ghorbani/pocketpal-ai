import type {TurboModule} from 'react-native';
import {Platform, TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  start(port: number): Promise<boolean>;
  stop(): Promise<boolean>;
  isRunning(): Promise<boolean>;
  sendResponse(
    requestId: string,
    statusCode: number,
    headersJson: string,
    body: string,
  ): Promise<boolean>;
  startSSE(requestId: string): Promise<boolean>;
  sendSSEChunk(requestId: string, payload: string): Promise<boolean>;
  finishSSE(requestId: string): Promise<boolean>;
}

// Only load the module on Android
export default Platform.OS === 'android'
  ? TurboModuleRegistry.getEnforcing<Spec>('ApiServerModule')
  : (null as any as Spec);
