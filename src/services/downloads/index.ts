import { DownloadManager } from './DownloadManager';
import { DownloadQueueManager, getDownloadQueueManager } from './DownloadQueueManager';

export * from './types';
export * from './DownloadManager';
export * from './DownloadQueueManager';

export const downloadManager = new DownloadManager();
export const downloadQueueManager = getDownloadQueueManager();
