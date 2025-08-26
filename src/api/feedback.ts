import {Platform} from 'react-native';

import axios from 'axios';
import DeviceInfo from 'react-native-device-info';

import {urls} from '../config';
import {feedbackStore} from '../store';
import {
  getAppCheckToken,
  checkConnectivity,
  NetworkError,
  AppCheckError,
  ServerError,
  initializeAppCheck,
} from '../utils';

type FeedbackData = {
  useCase: string;
  featureRequests: string;
  generalFeedback: string;
  usageFrequency: string;
  appFeedbackId: string;
};

export type ContentReportData = {
  category: string;
  description: string;
  includeModelInfo: boolean;
  modelId?: string;
  modelOid?: string;
  appFeedbackId: string;
  isContentReport: true;
};

/**
 * Submits content report data to the server with App Check verification
 */
export async function submitContentReport(
  reportData: Omit<ContentReportData, 'appFeedbackId'>,
): Promise<{message: string}> {
  try {
    console.log('reportData: ', reportData);

    // Check network connectivity first
    const isConnected = await checkConnectivity();
    if (!isConnected) {
      throw new NetworkError(
        'No internet connection. Please connect to the internet and try again.',
      );
    }

    const storeName =
      Platform.OS === 'android' ? 'Google Play Store' : 'Apple App Store';
    let errMessage = `App verification failed. Content reporting is only available for official builds from ${storeName}.`;

    // Get App Check token
    let appCheckToken: string | null = null;
    try {
      initializeAppCheck();
      appCheckToken = await getAppCheckToken();
    } catch (error) {
      console.error('App Check error:', error);
      throw new AppCheckError(errMessage);
    }

    if (!appCheckToken) {
      throw new AppCheckError(errMessage);
    }

    try {
      const response = await axios.post(
        urls.feedbackSubmit(),
        {
          ...reportData,
          appFeedbackId: feedbackStore.feedbackId,
          appVersion: DeviceInfo.getVersion(),
          appBuild: DeviceInfo.getBuildNumber(),
        },
        {
          headers: {
            'X-Firebase-AppCheck': appCheckToken,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (!error.response) {
          throw new NetworkError(
            'Network error. Please check your internet connection and try again.',
          );
        }

        const status = error.response.status;
        if (status === 401 || status === 403) {
          throw new AppCheckError(
            'App verification failed. This could be due to an unofficial app installation.',
          );
        } else if (status >= 500) {
          throw new ServerError(
            'Our servers are experiencing issues. Please try again later.',
          );
        } else {
          throw new ServerError(
            `Server error: ${error.response.data?.message || 'Unknown error'}`,
          );
        }
      }
      throw error;
    }
  } catch (error) {
    console.error('Content report submission error:', error);
    throw error;
  }
}

/**
 * Submits feedback data to the server with App Check verification
 */
export async function submitFeedback(
  feedbackData: Omit<FeedbackData, 'appFeedbackId'>,
): Promise<{message: string}> {
  try {
    // Check network connectivity first
    const isConnected = await checkConnectivity();
    if (!isConnected) {
      throw new NetworkError(
        'No internet connection. Please connect to the internet and try again.',
      );
    }

    const storeName =
      Platform.OS === 'android' ? 'Google Play Store' : 'Apple App Store';
    let errMessage = `App verification failed. Feedback submission is only available for official builds from ${storeName}.`;

    // Get App Check token
    let appCheckToken: string | null = null;
    try {
      initializeAppCheck();
      appCheckToken = await getAppCheckToken();
    } catch (error) {
      console.error('App Check error:', error);
      throw new AppCheckError(errMessage);
    }

    if (!appCheckToken) {
      throw new AppCheckError(errMessage);
    }

    try {
      const response = await axios.post(
        urls.feedbackSubmit(),
        {
          ...feedbackData,
          appFeedbackId: feedbackStore.feedbackId,
          appVersion: DeviceInfo.getVersion(),
          appBuild: DeviceInfo.getBuildNumber(),
        },
        {
          headers: {
            'X-Firebase-AppCheck': appCheckToken,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (!error.response) {
          throw new NetworkError(
            'Network error. Please check your internet connection and try again.',
          );
        }

        const status = error.response.status;
        if (status === 401 || status === 403) {
          throw new AppCheckError(
            'App verification failed. This could be due to an unofficial app installation.',
          );
        } else if (status >= 500) {
          throw new ServerError(
            'Our servers are experiencing issues. Please try again later.',
          );
        } else {
          throw new ServerError(
            `Server error: ${error.response.data?.message || 'Unknown error'}`,
          );
        }
      }
      throw error;
    }
  } catch (error) {
    console.error('Error submitting feedback:', error);

    if (
      error instanceof NetworkError ||
      error instanceof AppCheckError ||
      error instanceof ServerError
    ) {
      throw error;
    }

    throw new Error(
      error instanceof Error
        ? `Failed to submit feedback: ${error.message}`
        : 'An unexpected error occurred',
    );
  }
}
