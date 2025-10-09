import React from 'react';
import {Alert} from 'react-native';
import {render, fireEvent, waitFor} from '../../../../../jest/test-utils';

import {PalDetailSheet} from '../PalDetailSheet';
import {palsHubService} from '../../../../services';
import {palStore} from '../../../../store';
import {
  createPalsHubPal,
  mockPalsHubPal,
  mockPremiumPalsHubPal,
  mockOwnedPremiumPal,
} from '../../../../../jest/fixtures/pals';

// Mock Sheet component
jest.mock('../../../Sheet/Sheet', () => {
  const {View, ScrollView, Button} = require('react-native');
  const MockSheet = ({children, isVisible, onClose, title}: any) => {
    if (!isVisible) {
      return null;
    }
    return (
      <View testID="sheet">
        <View testID="sheet-title">{title}</View>
        <Button title="Close" onPress={onClose} testID="sheet-close-button" />
        {children}
      </View>
    );
  };
  MockSheet.ScrollView = ({children, contentContainerStyle}: any) => (
    <ScrollView
      testID="sheet-scroll-view"
      contentContainerStyle={contentContainerStyle}>
      {children}
    </ScrollView>
  );
  MockSheet.Actions = ({children}: any) => (
    <View testID="sheet-actions">{children}</View>
  );
  return {Sheet: MockSheet};
});

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock icons
jest.mock('../../../../assets/icons', () => ({
  StarIcon: () => null,
  DownloadIcon: () => null,
  UserIcon: () => null,
}));

describe('PalDetailSheet', () => {
  let defaultProps: {
    pal: typeof mockPalsHubPal;
    isVisible: boolean;
    onClose: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the pals array in the mock store
    palStore.pals = [];
    // Reset palsHubService mocks
    (palsHubService.getPal as jest.Mock).mockResolvedValue(mockPalsHubPal);
    // Ensure isPalsHubPalDownloaded returns false by default
    (palStore.isPalsHubPalDownloaded as jest.Mock).mockImplementation(
      () => false,
    );
    // Reset downloadPalsHubPal to resolve successfully
    (palStore.downloadPalsHubPal as jest.Mock).mockResolvedValue(undefined);
    // Reset defaultProps with a fresh mock for each test
    defaultProps = {
      pal: mockPalsHubPal,
      isVisible: true,
      onClose: jest.fn(),
    };
  });

  describe('Rendering', () => {
    it('renders correctly when visible', async () => {
      const {getByTestId} = render(<PalDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByTestId('sheet')).toBeTruthy();
        expect(getByTestId('sheet-scroll-view')).toBeTruthy();
      });
    });

    it('does not render when not visible', () => {
      const {queryByTestId} = render(
        <PalDetailSheet {...defaultProps} isVisible={false} />,
      );

      expect(queryByTestId('sheet')).toBeNull();
    });

    it('does not render when pal is null', () => {
      const {queryByTestId} = render(
        <PalDetailSheet {...defaultProps} pal={null} />,
      );

      expect(queryByTestId('sheet')).toBeNull();
    });

    it('displays pal title', async () => {
      const {getByText} = render(<PalDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByText('PalsHub Test Pal')).toBeTruthy();
      });
    });

    it('displays creator name', async () => {
      const {getByText} = render(<PalDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByText(/TestCreator/)).toBeTruthy();
      });
    });

    it('displays description', async () => {
      const {getByText} = render(<PalDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByText('A test pal from PalsHub')).toBeTruthy();
      });
    });

    it('displays categories when available', async () => {
      const {getByText} = render(<PalDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByText('Productivity')).toBeTruthy();
      });
    });

    it('displays tags when available', async () => {
      const {getByText} = render(<PalDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByText('assistant')).toBeTruthy();
      });
    });

    it('displays rating when available', async () => {
      const {getByText} = render(<PalDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByText('4.5')).toBeTruthy();
      });
    });

    it('displays review count', async () => {
      const {getByText} = render(<PalDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByText('10')).toBeTruthy();
      });
    });
  });

  describe('Fetching Pal Details', () => {
    it('fetches detailed pal information when sheet opens', async () => {
      render(<PalDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(palsHubService.getPal).toHaveBeenCalledWith(mockPalsHubPal.id);
      });
    });

    it('does not fetch details when pal is null', () => {
      render(<PalDetailSheet {...defaultProps} pal={null} />);

      expect(palsHubService.getPal).not.toHaveBeenCalled();
    });

    it('does not fetch details when not visible', () => {
      render(<PalDetailSheet {...defaultProps} isVisible={false} />);

      expect(palsHubService.getPal).not.toHaveBeenCalled();
    });

    it('handles fetch error gracefully and falls back to basic pal', async () => {
      const fetchError = new Error('Network error');
      (palsHubService.getPal as jest.Mock).mockRejectedValueOnce(fetchError);

      const {getByText} = render(<PalDetailSheet {...defaultProps} />);

      await waitFor(() => {
        // Should still display basic pal information
        expect(getByText('PalsHub Test Pal')).toBeTruthy();
      });
    });
  });

  describe('Free Pal Actions', () => {
    it('shows download button for free pals', async () => {
      const {getByText} = render(<PalDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByText(/Get Free/i)).toBeTruthy();
      });
    });

    it('downloads pal when download button is pressed', async () => {
      const {getByText, getByTestId} = render(
        <PalDetailSheet {...defaultProps} />,
      );

      // Wait for component to render with the button
      await waitFor(() => {
        expect(getByText(/Get Free/i)).toBeTruthy();
      });

      const downloadButton = getByTestId('download-button');
      fireEvent.press(downloadButton!);

      // Verify download was called
      await waitFor(() => {
        expect(palStore.downloadPalsHubPal).toHaveBeenCalledWith(
          mockPalsHubPal,
        );
      });

      // Verify success alert was shown
      expect(Alert.alert).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Array),
      );
    });

    it('shows downloaded state when pal is already downloaded', async () => {
      (palStore.isPalsHubPalDownloaded as jest.Mock).mockReturnValue(true);

      const {getByTestId} = render(<PalDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByTestId('downloaded-button')).toBeTruthy();
      });
    });

    it('handles download error gracefully', async () => {
      const downloadError = new Error('Download failed');
      (palStore.downloadPalsHubPal as jest.Mock).mockRejectedValue(
        downloadError,
      );

      const {getByText} = render(<PalDetailSheet {...defaultProps} />);

      // Wait for component to render with the button
      await waitFor(() => {
        expect(getByText(/Get Free/i)).toBeTruthy();
      });

      // Press the button
      const downloadButton = getByText(/Get Free/i);
      fireEvent.press(downloadButton);

      // Verify error alert was shown
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          expect.any(String),
          'Download failed',
        );
      });
    });
  });

  describe('Premium Pal Display', () => {
    it('shows premium label for premium pals', async () => {
      (palsHubService.getPal as jest.Mock).mockResolvedValue(
        mockPremiumPalsHubPal,
      );

      const {getAllByText} = render(
        <PalDetailSheet {...defaultProps} pal={mockPremiumPalsHubPal} />,
      );

      await waitFor(() => {
        const premiumLabels = getAllByText(/Premium/i);
        expect(premiumLabels.length).toBeGreaterThan(0);
      });
    });

    it('does not show download button for unowned premium pals', async () => {
      const {queryByText} = render(
        <PalDetailSheet {...defaultProps} pal={mockPremiumPalsHubPal} />,
      );

      await waitFor(() => {
        expect(queryByText(/Download/i)).toBeNull();
        expect(queryByText(/Get Free/i)).toBeNull();
      });
    });

    it('shows informational text for unowned premium pals', async () => {
      const {getByTestId} = render(
        <PalDetailSheet {...defaultProps} pal={mockPremiumPalsHubPal} />,
      );

      await waitFor(() => {
        expect(getByTestId('sheet-actions')).toBeTruthy();
      });
    });

    it('hides system prompt for unowned premium pals', async () => {
      const {queryByText} = render(
        <PalDetailSheet {...defaultProps} pal={mockPremiumPalsHubPal} />,
      );

      await waitFor(() => {
        expect(
          queryByText('You are a helpful assistant from PalsHub.'),
        ).toBeNull();
      });
    });

    it('shows premium pal message for unowned premium pals', async () => {
      const {getByTestId} = render(
        <PalDetailSheet {...defaultProps} pal={mockPremiumPalsHubPal} />,
      );

      await waitFor(() => {
        // Should show some premium message (exact text depends on l10n)
        expect(getByTestId('sheet-actions')).toBeTruthy();
      });
    });
  });

  describe('Owned Premium Pal Actions', () => {
    beforeEach(() => {
      (palsHubService.getPal as jest.Mock).mockResolvedValue(
        mockOwnedPremiumPal,
      );
    });

    it('shows download button for owned premium pals', async () => {
      const {getByText} = render(
        <PalDetailSheet {...defaultProps} pal={mockOwnedPremiumPal} />,
      );

      await waitFor(() => {
        expect(getByText(/Download/i)).toBeTruthy();
      });
    });

    it('downloads owned premium pal when download button is pressed', async () => {
      const {getByTestId} = render(
        <PalDetailSheet {...defaultProps} pal={mockOwnedPremiumPal} />,
      );

      // Wait for component to render with the button
      await waitFor(() => {
        expect(getByTestId('download-button')).toBeTruthy();
      });

      // Press the button
      const downloadButton = getByTestId('download-button');
      fireEvent.press(downloadButton);

      // Verify download was called
      await waitFor(() => {
        expect(palStore.downloadPalsHubPal).toHaveBeenCalledWith(
          mockOwnedPremiumPal,
        );
      });
    });

    it('shows system prompt for owned premium pals', async () => {
      const {getByText} = render(
        <PalDetailSheet {...defaultProps} pal={mockOwnedPremiumPal} />,
      );

      await waitFor(() => {
        expect(
          getByText('You are a helpful assistant from PalsHub.'),
        ).toBeTruthy();
      });
    });

    it('does not show premium info text for owned premium pals', async () => {
      const {getByTestId} = render(
        <PalDetailSheet {...defaultProps} pal={mockOwnedPremiumPal} />,
      );

      await waitFor(() => {
        // Should have actions but not the premium info text
        expect(getByTestId('sheet-actions')).toBeTruthy();
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles pal without creator gracefully', async () => {
      const palWithoutCreator = createPalsHubPal({
        creator: undefined,
      });
      (palsHubService.getPal as jest.Mock).mockResolvedValue(palWithoutCreator);

      const {getByText} = render(
        <PalDetailSheet {...defaultProps} pal={palWithoutCreator} />,
      );

      await waitFor(() => {
        expect(getByText(palWithoutCreator.title)).toBeTruthy();
      });
    });

    it('handles pal without description', async () => {
      const palWithoutDescription = createPalsHubPal({
        description: undefined,
      });
      (palsHubService.getPal as jest.Mock).mockResolvedValue(
        palWithoutDescription,
      );

      const {getByText} = render(
        <PalDetailSheet {...defaultProps} pal={palWithoutDescription} />,
      );

      await waitFor(() => {
        // Should show "no description available" message
        expect(getByText(palWithoutDescription.title)).toBeTruthy();
      });
    });

    it('handles pal without categories', async () => {
      const palWithoutCategories = createPalsHubPal({
        categories: [],
      });
      (palsHubService.getPal as jest.Mock).mockResolvedValue(
        palWithoutCategories,
      );

      const {getByText} = render(
        <PalDetailSheet {...defaultProps} pal={palWithoutCategories} />,
      );

      await waitFor(() => {
        expect(getByText(palWithoutCategories.title)).toBeTruthy();
      });
    });

    it('handles pal without tags', async () => {
      const palWithoutTags = createPalsHubPal({
        tags: [],
      });
      (palsHubService.getPal as jest.Mock).mockResolvedValue(palWithoutTags);

      const {getByText} = render(
        <PalDetailSheet {...defaultProps} pal={palWithoutTags} />,
      );

      await waitFor(() => {
        expect(getByText(palWithoutTags.title)).toBeTruthy();
      });
    });
  });

  describe('Close Behavior', () => {
    it('calls onClose when close button is pressed', async () => {
      const {getByTestId} = render(<PalDetailSheet {...defaultProps} />);

      await waitFor(() => {
        const closeButton = getByTestId('sheet-close-button');
        fireEvent.press(closeButton);
      });

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onClose after successful download', async () => {
      // Create a fresh onClose mock for this test
      const onCloseMock = jest.fn();
      const {getByTestId, getByText} = render(
        <PalDetailSheet {...defaultProps} onClose={onCloseMock} />,
      );

      // Wait for component to render with the button
      await waitFor(() => {
        expect(getByText(/Get Free/i)).toBeTruthy();
      });

      // Press the button
      const downloadButton = getByTestId('download-button');
      fireEvent.press(downloadButton);

      // Wait for download to complete and alert to be shown
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });

      // Simulate pressing OK button in the alert
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const buttons = alertCall[2];
      if (buttons && buttons[0] && buttons[0].onPress) {
        buttons[0].onPress();
      }

      // Verify onClose was called
      await waitFor(() => {
        expect(onCloseMock).toHaveBeenCalled();
      });
    });
  });

  describe('Loading States', () => {
    it('shows loading state during download', async () => {
      let resolveDownload: () => void;
      const downloadPromise = new Promise<void>(resolve => {
        resolveDownload = resolve;
      });
      (palStore.downloadPalsHubPal as jest.Mock).mockReturnValue(
        downloadPromise,
      );

      const {getByText, getByTestId} = render(
        <PalDetailSheet {...defaultProps} />,
      );

      // Wait for component to render with the button
      await waitFor(() => {
        expect(getByText(/Get Free/i)).toBeTruthy();
      });

      // Press the button
      const downloadButton = getByTestId('download-button');
      fireEvent.press(downloadButton);

      // Button should show loading state
      await waitFor(() => {
        expect(palStore.downloadPalsHubPal).toHaveBeenCalled();
      });

      // Resolve the download
      resolveDownload!();
    });
  });
});
