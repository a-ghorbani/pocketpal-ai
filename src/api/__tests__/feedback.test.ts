import axios from 'axios';
import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import {submitFeedback, submitContentReport} from '../feedback';
import * as utils from '../../utils';
import {urls} from '../../config';

// Mock dependencies
jest.mock('axios');
jest.mock('react-native-device-info');
jest.mock('../../utils', () => {
  const originalModule = jest.requireActual('../../utils');
  return {
    ...originalModule,
    checkConnectivity: jest.fn(),
    getAppCheckToken: jest.fn(),
    initializeAppCheck: jest.fn(),
    NetworkError: class NetworkError extends Error {
      constructor(message) {
        super(message);
        this.name = 'NetworkError';
      }
    },
    AppCheckError: class AppCheckError extends Error {
      constructor(message) {
        super(message);
        this.name = 'AppCheckError';
      }
    },
    ServerError: class ServerError extends Error {
      constructor(message) {
        super(message);
        this.name = 'ServerError';
      }
    },
  };
});
jest.mock('../../store', () => ({
  feedbackStore: {
    feedbackId: 'mock-feedback-id',
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedUtils = utils as jest.Mocked<typeof utils>;
const mockedDeviceInfo = DeviceInfo as jest.Mocked<typeof DeviceInfo>;

describe('submitFeedback', () => {
  const mockFeedbackData = {
    useCase: 'Test use case',
    featureRequests: 'Test feature request',
    generalFeedback: 'Test feedback',
    usageFrequency: 'daily',
  };

  const mockAppCheckToken = 'mock-app-check-token';
  const mockResponse = {
    data: {
      message: 'Feedback submitted successfully',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks for success case
    Platform.OS = 'ios';
    mockedUtils.checkConnectivity.mockResolvedValue(true);
    mockedUtils.getAppCheckToken.mockResolvedValue(mockAppCheckToken);
    mockedDeviceInfo.getVersion.mockReturnValue('1.0.0');
    mockedDeviceInfo.getBuildNumber.mockReturnValue('100');
    mockedAxios.post.mockResolvedValue(mockResponse);
    mockedAxios.isAxiosError.mockReturnValue(true);
  });

  it('should successfully submit feedback', async () => {
    const result = await submitFeedback(mockFeedbackData);

    // Verify connectivity check
    expect(mockedUtils.checkConnectivity).toHaveBeenCalled();

    // Verify AppCheck initialization and token retrieval
    expect(mockedUtils.initializeAppCheck).toHaveBeenCalled();
    expect(mockedUtils.getAppCheckToken).toHaveBeenCalled();

    // Verify API call
    expect(mockedAxios.post).toHaveBeenCalledWith(
      urls.feedbackSubmit(),
      {
        ...mockFeedbackData,
        appFeedbackId: 'mock-feedback-id',
        appVersion: '1.0.0',
        appBuild: '100',
      },
      {
        headers: {
          'X-Firebase-AppCheck': mockAppCheckToken,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    );

    // Verify response
    expect(result).toEqual({
      message: 'Feedback submitted successfully',
    });
  });

  it('should throw NetworkError when there is no internet connection', async () => {
    mockedUtils.checkConnectivity.mockResolvedValue(false);

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrowError(
      utils.NetworkError,
    );

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('should throw AppCheckError when AppCheck token is not available', async () => {
    mockedUtils.getAppCheckToken.mockResolvedValue('');

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrowError(
      utils.AppCheckError,
    );

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('should throw NetworkError on axios network error', async () => {
    const error = {
      isAxiosError: true,
      response: undefined,
    };
    mockedAxios.post.mockRejectedValue(error);

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrowError(
      utils.NetworkError,
    );
  });

  it('should throw AppCheckError on 401/403 responses', async () => {
    const unauthorizedError = {
      isAxiosError: true,
      response: {
        status: 401,
        data: {},
      },
    };
    mockedAxios.post.mockRejectedValue(unauthorizedError);

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrowError(
      utils.AppCheckError,
    );

    // Test 403 error
    const forbiddenError = {
      isAxiosError: true,
      response: {
        status: 403,
        data: {},
      },
    };
    mockedAxios.post.mockRejectedValue(forbiddenError);

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrowError(
      utils.AppCheckError,
    );
  });

  it('should throw ServerError on 500+ responses', async () => {
    const serverError = {
      isAxiosError: true,
      response: {
        status: 500,
        data: {
          message: 'Internal Server Error',
        },
      },
    };
    mockedAxios.post.mockRejectedValue(serverError);

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrowError(
      utils.ServerError,
    );
  });

  it('should throw ServerError with error message from server if available', async () => {
    const serverError = {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          message: 'Invalid feedback data',
        },
      },
    };
    mockedAxios.post.mockRejectedValue(serverError);

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrowError(
      utils.ServerError,
    );
  });

  it('should handle AppCheck initialization errors', async () => {
    mockedUtils.initializeAppCheck.mockImplementation(() => {
      throw new Error('AppCheck init error');
    });

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrowError(
      utils.AppCheckError,
    );
  });

  it('should propagate unknown errors', async () => {
    const unknownError = new Error('Unknown error');
    mockedAxios.post.mockRejectedValue(unknownError);
    mockedAxios.isAxiosError.mockReturnValue(false);

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrow(
      'App verification failed. Feedback submission is only available for official builds from Apple App Store.',
    );
  });

  it('should handle different platform messages', async () => {
    Platform.OS = 'android';
    mockedUtils.getAppCheckToken.mockResolvedValue('');

    await expect(submitFeedback(mockFeedbackData)).rejects.toThrowError(
      utils.AppCheckError,
    );
  });
});

describe('submitContentReport', () => {
  const mockReportData = {
    category: 'hate',
    description: 'Test report description',
    includeModelInfo: true,
    modelId: 'test-model-id',
    modelOid: 'test-model-oid',
    isContentReport: true as const,
  };

  const mockAppCheckToken = 'mock-app-check-token';
  const mockResponse = {
    data: {
      message: 'Content report submitted successfully',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks for success case
    Platform.OS = 'ios';
    mockedUtils.checkConnectivity.mockResolvedValue(true);
    mockedUtils.initializeAppCheck.mockReturnValue(undefined);
    mockedUtils.getAppCheckToken.mockResolvedValue(mockAppCheckToken);
    mockedDeviceInfo.getVersion.mockReturnValue('1.0.0');
    mockedDeviceInfo.getBuildNumber.mockReturnValue('100');
    mockedAxios.post.mockResolvedValue(mockResponse);
    mockedAxios.isAxiosError.mockReturnValue(true);
  });

  it('should successfully submit content report', async () => {
    const result = await submitContentReport(mockReportData);

    // Verify connectivity check
    expect(mockedUtils.checkConnectivity).toHaveBeenCalled();

    // Verify AppCheck initialization and token retrieval
    expect(mockedUtils.initializeAppCheck).toHaveBeenCalled();
    expect(mockedUtils.getAppCheckToken).toHaveBeenCalled();

    // Verify API call
    expect(mockedAxios.post).toHaveBeenCalledWith(
      urls.feedbackSubmit(),
      {
        ...mockReportData,
        appFeedbackId: 'mock-feedback-id',
        appVersion: '1.0.0',
        appBuild: '100',
      },
      {
        headers: {
          'X-Firebase-AppCheck': mockAppCheckToken,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    );

    // Verify response
    expect(result).toEqual({
      message: 'Content report submitted successfully',
    });
  });

  it('should throw NetworkError when there is no internet connection', async () => {
    mockedUtils.checkConnectivity.mockResolvedValue(false);

    await expect(submitContentReport(mockReportData)).rejects.toThrowError(
      utils.NetworkError,
    );

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('should throw AppCheckError when AppCheck token is not available', async () => {
    mockedUtils.getAppCheckToken.mockResolvedValue('');

    await expect(submitContentReport(mockReportData)).rejects.toThrowError(
      utils.AppCheckError,
    );

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('should handle axios network error', async () => {
    const error = {
      isAxiosError: true,
      response: undefined,
    };
    mockedAxios.post.mockRejectedValue(error);

    await expect(submitContentReport(mockReportData)).rejects.toThrow();
  });

  it('should handle 401/403 responses', async () => {
    const unauthorizedError = {
      isAxiosError: true,
      response: {
        status: 401,
        data: {},
      },
    };
    mockedAxios.post.mockRejectedValue(unauthorizedError);

    await expect(submitContentReport(mockReportData)).rejects.toThrow();
  });

  it('should handle server errors', async () => {
    const serverError = {
      isAxiosError: true,
      response: {
        status: 500,
        data: {
          message: 'Internal Server Error',
        },
      },
    };
    mockedAxios.post.mockRejectedValue(serverError);

    await expect(submitContentReport(mockReportData)).rejects.toThrow();
  });

  it('should handle AppCheck initialization errors', async () => {
    mockedUtils.initializeAppCheck.mockImplementation(() => {
      throw new Error('AppCheck init error');
    });

    await expect(submitContentReport(mockReportData)).rejects.toThrow();
  });

  it('should handle different platform messages for Android', async () => {
    Platform.OS = 'android';
    mockedUtils.getAppCheckToken.mockResolvedValue('');

    await expect(submitContentReport(mockReportData)).rejects.toThrow();
  });
});
