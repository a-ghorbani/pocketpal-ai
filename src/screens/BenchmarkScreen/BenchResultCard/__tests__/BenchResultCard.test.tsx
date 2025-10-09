import React from 'react';
import {Linking, Alert} from 'react-native';
import {fireEvent, render, act, waitFor} from '../../../../../jest/test-utils';
import {BenchResultCard} from '../BenchResultCard';
import {BenchmarkResult, CacheType} from '../../../../utils/types';
import {
  NetworkError,
  AppCheckError,
  ServerError,
} from '../../../../utils/errors';

// Mock Linking
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: jest.fn().mockImplementation(() => Promise.resolve()),
}));

// Mock Alert
jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

describe('BenchResultCard', () => {
  const mockResult: BenchmarkResult = {
    config: {
      pp: 1,
      tg: 1,
      pl: 512,
      nr: 3,
      label: 'Default',
    },
    modelDesc: 'Test Model',
    modelSize: 1000 * 1000 * 500, // 500 MB
    modelNParams: 7000000000, // 7B
    ppAvg: 20.5,
    ppStd: 1.2,
    tgAvg: 30.5,
    tgStd: 2.1,
    timestamp: new Date().toISOString(),
    modelId: 'test-model-id',
    modelName: 'Test Model',
    filename: 'test-model.gguf',
    uuid: 'test-uuid',
    oid: 'model-oid', // This is needed for sharing
    initSettings: {
      n_ctx: 2048,
      n_batch: 512,
      n_ubatch: 128,
      n_threads: 4,
      n_gpu_layers: 20,
      flash_attn: true,
      cache_type_k: CacheType.F16,
      cache_type_v: CacheType.F16,
    },
    wallTimeMs: 5000, // 5 seconds
    peakMemoryUsage: {
      total: 8 * 1000 * 1000 * 1000, // 8 GB
      used: 4 * 1000 * 1000 * 1000, // 4 GB
      percentage: 50,
    },
  };

  const mockSubmittedResult = {
    ...mockResult,
    submitted: true,
  };

  const mockLocalModelResult = {
    ...mockResult,
    oid: undefined, // Local models don't have an OID
  };

  const mockOnDelete = jest.fn();
  const mockOnShare = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnShare.mockResolvedValue(undefined);
  });

  it('renders benchmark result data correctly', () => {
    const {getByText} = render(
      <BenchResultCard
        result={mockResult}
        onDelete={mockOnDelete}
        onShare={mockOnShare}
      />,
    );

    // Model info
    expect(getByText('Test Model')).toBeTruthy();
    expect(getByText(/500 MB/)).toBeTruthy();
    expect(getByText(/7B params/)).toBeTruthy();

    // Benchmark results
    expect(getByText('20.50 t/s')).toBeTruthy();
    expect(getByText('30.50 t/s')).toBeTruthy();

    // Configuration
    expect(getByText(/PP: 1 • TG: 1 • PL: 512 • Rep: 3/)).toBeTruthy();

    // Memory & time
    expect(getByText('5s')).toBeTruthy();
    expect(getByText('50.0%')).toBeTruthy();
    expect(getByText(/4 GB \/ 8 GB/)).toBeTruthy();
  });

  it('formats different durations correctly', () => {
    // Test with milliseconds
    const shortResult = {...mockResult, wallTimeMs: 500};
    const {getByText, rerender} = render(
      <BenchResultCard
        result={shortResult}
        onDelete={mockOnDelete}
        onShare={mockOnShare}
      />,
    );
    expect(getByText('500ms')).toBeTruthy();

    // Test with seconds
    const secondsResult = {...mockResult, wallTimeMs: 3500};
    rerender(
      <BenchResultCard
        result={secondsResult}
        onDelete={mockOnDelete}
        onShare={mockOnShare}
      />,
    );
    expect(getByText('3s')).toBeTruthy();

    // Test with minutes and seconds
    const minutesResult = {...mockResult, wallTimeMs: 125000}; // 2m 5s
    rerender(
      <BenchResultCard
        result={minutesResult}
        onDelete={mockOnDelete}
        onShare={mockOnShare}
      />,
    );
    expect(getByText('2m 5s')).toBeTruthy();
  });

  it('handles delete button press', () => {
    const {getByTestId} = render(
      <BenchResultCard
        result={mockResult}
        onDelete={mockOnDelete}
        onShare={mockOnShare}
      />,
    );

    const deleteButton = getByTestId('delete-result-button');
    fireEvent.press(deleteButton);

    expect(mockOnDelete).toHaveBeenCalledWith(mockResult.timestamp);
  });

  it('shows submitted state correctly', () => {
    const {getByText} = render(
      <BenchResultCard
        result={mockSubmittedResult}
        onDelete={mockOnDelete}
        onShare={mockOnShare}
      />,
    );

    expect(getByText(/✓ Shared to/)).toBeTruthy();
    expect(getByText(/AI Phone Leaderboard ↗/)).toBeTruthy();
  });

  it('disables sharing for local models', () => {
    const {getByText} = render(
      <BenchResultCard
        result={mockLocalModelResult}
        onDelete={mockOnDelete}
        onShare={mockOnShare}
      />,
    );

    expect(getByText('Cannot share')).toBeTruthy();
  });

  it('opens leaderboard when link is clicked', () => {
    const {getByText} = render(
      <BenchResultCard
        result={mockResult}
        onDelete={mockOnDelete}
        onShare={mockOnShare}
      />,
    );

    const leaderboardLink = getByText('View leaderboard ↗');
    fireEvent.press(leaderboardLink);

    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://huggingface.co/spaces/a-ghorbani/ai-phone-leaderboard',
    );
  });

  it('submits benchmark data when submit button is pressed', async () => {
    const {getByTestId} = render(
      <BenchResultCard
        result={mockResult}
        onDelete={mockOnDelete}
        onShare={mockOnShare}
      />,
    );

    const submitButton = getByTestId('submit-benchmark-button');
    await act(async () => {
      fireEvent.press(submitButton);
    });

    expect(mockOnShare).toHaveBeenCalledWith(mockResult);
  });

  it('handles network errors', async () => {
    mockOnShare.mockRejectedValueOnce(
      new NetworkError('No internet connection. Please connect and try again.'),
    );

    const {getByTestId, getByText} = render(
      <BenchResultCard
        result={mockResult}
        onDelete={mockOnDelete}
        onShare={mockOnShare}
      />,
    );

    const submitButton = getByTestId('submit-benchmark-button');
    await act(async () => {
      fireEvent.press(submitButton);
    });

    await waitFor(() => {
      expect(getByText(/📶.*No internet connection/)).toBeTruthy();
      expect(getByText('Check connection & retry')).toBeTruthy();
    });
  });

  it('handles app check errors', async () => {
    mockOnShare.mockRejectedValueOnce(
      new AppCheckError('App verification failed.'),
    );

    const {getByTestId, getByText} = render(
      <BenchResultCard
        result={mockResult}
        onDelete={mockOnDelete}
        onShare={mockOnShare}
      />,
    );

    const submitButton = getByTestId('submit-benchmark-button');
    await act(async () => {
      fireEvent.press(submitButton);
    });

    await waitFor(() => {
      expect(getByText(/🔒.*App verification failed/)).toBeTruthy();
      expect(getByText('Retry submission')).toBeTruthy();
    });
  });

  it('handles server errors', async () => {
    mockOnShare.mockRejectedValueOnce(
      new ServerError('Our servers are experiencing issues.'),
    );

    const {getByTestId, getByText} = render(
      <BenchResultCard
        result={mockResult}
        onDelete={mockOnDelete}
        onShare={mockOnShare}
      />,
    );

    const submitButton = getByTestId('submit-benchmark-button');
    await act(async () => {
      fireEvent.press(submitButton);
    });

    await waitFor(() => {
      expect(getByText(/🖥️.*Our servers are experiencing issues/)).toBeTruthy();
      expect(getByText('Try again later')).toBeTruthy();
    });
  });

  it('handles unknown errors', async () => {
    mockOnShare.mockRejectedValueOnce(new Error('Unknown error occurred'));

    const {getByTestId, getByText} = render(
      <BenchResultCard
        result={mockResult}
        onDelete={mockOnDelete}
        onShare={mockOnShare}
      />,
    );

    const submitButton = getByTestId('submit-benchmark-button');
    await act(async () => {
      fireEvent.press(submitButton);
    });

    await waitFor(() => {
      expect(getByText(/❌.*Unknown error occurred/)).toBeTruthy();
      expect(getByText('Retry')).toBeTruthy();
    });
  });

  it('allows retrying after a network error', async () => {
    mockOnShare.mockRejectedValueOnce(new NetworkError('Network error'));

    const {getByTestId, getByText} = render(
      <BenchResultCard
        result={mockResult}
        onDelete={mockOnDelete}
        onShare={mockOnShare}
      />,
    );

    // First attempt - triggers error
    const submitButton = getByTestId('submit-benchmark-button');
    await act(async () => {
      fireEvent.press(submitButton);
    });

    // Clear the mock so the retry will succeed
    mockOnShare.mockClear();
    mockOnShare.mockResolvedValueOnce(undefined);

    // Retry
    await waitFor(() => {
      const retryButton = getByText('Check connection & retry');
      fireEvent.press(retryButton);
    });

    expect(mockOnShare).toHaveBeenCalledWith(mockResult);
  });

  it('opens leaderboard when link is clicked on submitted results', () => {
    const {getByText} = render(
      <BenchResultCard
        result={mockSubmittedResult}
        onDelete={mockOnDelete}
        onShare={mockOnShare}
      />,
    );

    const leaderboardText = getByText(/AI Phone Leaderboard ↗/);
    fireEvent.press(leaderboardText);

    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://huggingface.co/spaces/a-ghorbani/ai-phone-leaderboard',
    );
  });

  it('renders without initSettings or peakMemoryUsage', () => {
    const minimalResult = {
      ...mockResult,
      initSettings: undefined,
      peakMemoryUsage: undefined,
      wallTimeMs: undefined,
    };

    const {queryByText} = render(
      <BenchResultCard
        result={minimalResult}
        onDelete={mockOnDelete}
        onShare={mockOnShare}
      />,
    );

    // These should not be in the DOM
    expect(queryByText('Model Settings')).toBeNull();
    expect(queryByText('Peak Memory')).toBeNull();
    expect(queryByText('Total Time')).toBeNull();
  });
});
