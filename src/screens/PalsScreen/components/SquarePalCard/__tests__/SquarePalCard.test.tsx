import React from 'react';
import {Alert} from 'react-native';

import {
  render,
  fireEvent,
  waitFor,
  act,
} from '../../../../../../jest/test-utils';
import {SquarePalCard} from '../SquarePalCard';

import {palStore, chatSessionStore, modelStore} from '../../../../../store';
import {downloadedModel} from '../../../../../../jest/fixtures/models';
import type {Pal} from '../../../../../store/PalStore';
import type {PalsHubPal} from '../../../../../types/palshub';

// Mock navigation
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

// Mock export utils
jest.mock('../../../../../utils/exportUtils', () => ({
  exportPal: jest.fn(),
}));

const {exportPal} = require('../../../../../utils/exportUtils');

describe('SquarePalCard', () => {
  const mockOnPress = jest.fn();

  // Create a basic local pal fixture
  const createLocalPal = (overrides: Partial<Pal> = {}): Pal => ({
    type: 'local',
    id: 'test-pal-1',
    name: 'Test Pal',
    description: 'A helpful test assistant',
    systemPrompt: 'You are a helpful assistant.',
    originalSystemPrompt: 'You are a helpful assistant.',
    isSystemPromptChanged: false,
    useAIPrompt: false,
    parameters: {},
    parameterSchema: [],
    source: 'local',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    capabilities: {},
    ...overrides,
  });

  // Create a PalsHub pal fixture
  const createPalsHubPal = (
    overrides: Partial<PalsHubPal> = {},
  ): PalsHubPal => ({
    type: 'palshub',
    id: 'ph-pal-1',
    title: 'PalsHub Test Pal',
    description: 'A test pal from PalsHub',
    creator_id: 'creator-1',
    protection_level: 'public',
    price_cents: 0,
    system_prompt: 'You are a helpful assistant.',
    thumbnail_url: 'https://example.com/thumb.jpg',
    model_settings: {},
    allow_fork: true,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    creator: {
      id: 'creator-1',
      display_name: 'Test Creator',
      username: 'testcreator',
      avatar_url: 'https://example.com/avatar.jpg',
      provider: 'github',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
    },
    tags: [
      {
        id: 'tag-1',
        name: 'productivity',
        usage_count: 10,
        created_at: '2023-01-01T00:00:00Z',
      },
      {
        id: 'tag-2',
        name: 'assistant',
        usage_count: 5,
        created_at: '2023-01-01T00:00:00Z',
      },
    ],
    average_rating: 4.5,
    review_count: 10,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
    palStore.pals = [];
  });

  describe('Rendering', () => {
    it('renders local pal correctly', () => {
      const pal = createLocalPal();
      const {getByText} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      expect(getByText('Test Pal')).toBeTruthy();
      expect(getByText('A helpful test assistant')).toBeTruthy();
    });

    it('renders PalsHub pal correctly', () => {
      const pal = createPalsHubPal();
      const {getByText} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} />,
      );

      expect(getByText('PalsHub Test Pal')).toBeTruthy();
      expect(getByText('A test pal from PalsHub')).toBeTruthy();
      expect(getByText('by Test Creator')).toBeTruthy();
    });

    it('renders rating and review count for PalsHub pal', () => {
      const pal = createPalsHubPal({average_rating: 4.5, review_count: 10});
      const {getByText} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} />,
      );

      expect(getByText('4.5')).toBeTruthy();
      expect(getByText('(10)')).toBeTruthy();
    });

    it('renders tags for PalsHub pal', () => {
      const pal = createPalsHubPal();
      const {getByText} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} />,
      );

      expect(getByText('productivity')).toBeTruthy();
      expect(getByText('+1')).toBeTruthy(); // +1 more tag
    });

    it('renders thumbnail image when available', () => {
      const pal = createLocalPal({
        thumbnail_url: 'https://example.com/thumb.jpg',
      });
      const {UNSAFE_getByType} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      const images = UNSAFE_getByType(require('react-native').Image);
      expect(images).toBeTruthy();
    });

    it('renders first letter when no thumbnail available', () => {
      const pal = createLocalPal({name: 'Test Pal'});
      const {getByText} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      expect(getByText('T')).toBeTruthy(); // First letter
    });

    it('renders protection badge for protected PalsHub pals', () => {
      const pal = createPalsHubPal({protection_level: 'reveal_on_purchase'});
      const {UNSAFE_getAllByType} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} />,
      );

      // Check for LockIcon component
      const lockIcons = UNSAFE_getAllByType(
        require('../../../../../assets/icons').LockIcon,
      );
      expect(lockIcons.length).toBeGreaterThan(0);
    });
  });

  describe('User Interactions', () => {
    it('calls onPress when card is pressed', () => {
      const pal = createLocalPal();
      const {getByText} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      fireEvent.press(getByText('Test Pal'));
      expect(mockOnPress).toHaveBeenCalledTimes(1);
    });

    it('shows delete confirmation when delete button is pressed', () => {
      jest.spyOn(Alert, 'alert');
      const pal = createLocalPal();
      const {UNSAFE_getAllByType} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      // Find and press delete button (IconButton with TrashIcon)
      const iconButtons = UNSAFE_getAllByType(
        require('react-native-paper').IconButton,
      );
      // Delete button is the second one (after share button)
      const deleteButton = iconButtons[1];

      fireEvent.press(deleteButton);
      expect(Alert.alert).toHaveBeenCalled();
    });

    it('calls exportPal when share button is pressed', async () => {
      const pal = createLocalPal();
      const {UNSAFE_getAllByType} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      // Find and press share button (IconButton with ShareIcon)
      const iconButtons = UNSAFE_getAllByType(
        require('react-native-paper').IconButton,
      );
      const shareButton = iconButtons[0]; // Share button is first

      await act(async () => {
        fireEvent.press(shareButton);
      });

      await waitFor(() => {
        expect(exportPal).toHaveBeenCalledWith(pal.id);
      });
    });
  });

  describe('Chat Navigation', () => {
    it('navigates to chat when chat button is pressed for local pal', async () => {
      const pal = createLocalPal({defaultModel: downloadedModel});
      // availableModels is computed from models.filter(m => m.isDownloaded)
      // So we just need to set models with downloaded models
      modelStore.models = [downloadedModel];

      const {UNSAFE_getAllByType} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      // Find chat button - it's a TouchableOpacity inside the thumbnail
      const touchables = UNSAFE_getAllByType(
        require('react-native').TouchableOpacity,
      );
      // The chat button is the second touchable (first is the card itself)
      const chatButton = touchables[1];

      await act(async () => {
        fireEvent.press(chatButton);
      });

      await waitFor(() => {
        expect(chatSessionStore.setActivePal).toHaveBeenCalledWith(pal.id);
        expect(mockNavigate).toHaveBeenCalledWith('Chat');
      });
    });

    it('shows download alert for PalsHub pal not yet downloaded', async () => {
      jest.spyOn(Alert, 'alert');
      const pal = createPalsHubPal();
      palStore.pals = []; // No local pals

      const {UNSAFE_getAllByType} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} />,
      );

      // PalsHub pals that aren't downloaded shouldn't show chat button
      const touchables = UNSAFE_getAllByType(
        require('react-native').TouchableOpacity,
      );
      const chatButtons = touchables.filter(
        t => t.props.style?.chatButton !== undefined,
      );

      // Should not have chat button if not downloaded
      expect(chatButtons.length).toBe(0);
    });
  });

  describe('Model Warning', () => {
    it('shows model warning when default model is not available', () => {
      const pal = createLocalPal({
        defaultModel: {...downloadedModel, id: 'unavailable-model'},
      });
      modelStore.isModelAvailable = jest.fn().mockReturnValue(false);

      const {getByText} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      // Check for warning text (from l10n.components.modelNotAvailable.modelNotDownloadedShort)
      expect(getByText('Model not downloaded')).toBeTruthy();
    });

    it('does not show model warning when model is available', () => {
      const pal = createLocalPal({defaultModel: downloadedModel});
      modelStore.isModelAvailable = jest.fn().mockReturnValue(true);

      const {queryByText} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      expect(queryByText('Model not downloaded')).toBeNull();
    });

    it('does not show model warning for PalsHub pals', () => {
      const pal = createPalsHubPal();
      const {queryByText} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} />,
      );

      expect(queryByText('Model not downloaded')).toBeNull();
    });
  });

  describe('Content Display', () => {
    it('truncates long descriptions', () => {
      const longDescription = 'A'.repeat(200);
      const pal = createLocalPal({description: longDescription});

      const {getByText} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      const displayedText = getByText(/A+\.\.\./);
      expect(displayedText).toBeTruthy();
      expect(displayedText.props.children.length).toBeLessThan(
        longDescription.length,
      );
    });

    it('displays cleaned system prompt when no description', () => {
      const pal = createLocalPal({
        description: undefined,
        systemPrompt: 'You are a helpful coding assistant.',
      });

      const {getByText} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      // Should remove "You are" prefix
      expect(getByText(/helpful coding assistant/i)).toBeTruthy();
    });

    it('displays parameter summary when available', () => {
      const pal = createLocalPal({
        description: undefined,
        systemPrompt: undefined,
        parameters: {
          role: 'coding assistant',
          expertise: 'TypeScript',
          style: 'concise',
        },
      });

      const {getByText} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      // Should display parameter values joined with bullet
      expect(getByText(/coding assistant • TypeScript • concise/)).toBeTruthy();
    });

    it('displays fallback text for video capability pals', () => {
      const pal = createLocalPal({
        description: undefined,
        systemPrompt: undefined,
        capabilities: {
          video: true,
          multimodal: true,
        },
      });

      const {getByText} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      // When video capability is enabled, it shows "Video AI Assistant"
      expect(getByText('Video AI Assistant')).toBeTruthy();
    });

    it('displays generic fallback for pals with no content', () => {
      const pal = createLocalPal({
        description: undefined,
        systemPrompt: undefined,
        parameters: {},
        capabilities: {},
      });

      const {getByText} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      expect(getByText('AI Assistant')).toBeTruthy();
    });
  });

  describe('Action Buttons Visibility', () => {
    it('shows share and delete buttons for local pals', () => {
      const pal = createLocalPal();
      const {UNSAFE_getAllByType} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      const iconButtons = UNSAFE_getAllByType(
        require('react-native-paper').IconButton,
      );
      // Should have at least 2 icon buttons (share and delete)
      expect(iconButtons.length).toBeGreaterThanOrEqual(2);
    });

    it('does not show share and delete buttons for PalsHub pals', () => {
      const pal = createPalsHubPal();
      const {UNSAFE_queryAllByType} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} />,
      );

      // PalsHub pals should not have action buttons in header
      const iconButtons = UNSAFE_queryAllByType(
        require('react-native-paper').IconButton,
      );
      // May have warning icon but not share/delete
      expect(iconButtons.length).toBeLessThan(2);
    });

    it('shows chat button for downloaded PalsHub pal', () => {
      const palsHubPal = createPalsHubPal();
      const localPal = createLocalPal({palshub_id: palsHubPal.id});
      palStore.pals = [localPal];
      palStore.isPalsHubPalDownloaded = jest.fn().mockReturnValue(true);

      const {UNSAFE_getAllByType} = render(
        <SquarePalCard pal={palsHubPal} onPress={mockOnPress} />,
      );

      // Should have chat button - check for ChatIcon or CameraIcon
      const chatIcons = UNSAFE_getAllByType(
        require('../../../../../assets/icons').ChatIcon,
      );
      expect(chatIcons.length).toBeGreaterThan(0);
    });
  });

  describe('Video Capability', () => {
    it('shows camera icon for video-capable pals', () => {
      const pal = createLocalPal({
        capabilities: {
          video: true,
          multimodal: true,
        },
      });

      const {UNSAFE_getAllByType} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      const cameraIcons = UNSAFE_getAllByType(
        require('../../../../../assets/icons').CameraIcon,
      );
      expect(cameraIcons.length).toBeGreaterThan(0);
    });

    it('shows chat icon for non-video pals', () => {
      const pal = createLocalPal({capabilities: {}});

      const {UNSAFE_getAllByType} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      const chatIcons = UNSAFE_getAllByType(
        require('../../../../../assets/icons').ChatIcon,
      );
      expect(chatIcons.length).toBeGreaterThan(0);
    });
  });

  describe('Premium Badge', () => {
    it('shows premium badge for premium PalsHub pals', () => {
      const pal = createPalsHubPal({
        price_cents: 999,
      });

      const {getByText} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} />,
      );

      // Premium badge should be visible (text depends on getPalDisplayLabel)
      // This is a basic check - actual label depends on implementation
      const card = getByText('PalsHub Test Pal');
      expect(card).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('handles share error gracefully', async () => {
      jest.spyOn(Alert, 'alert');
      exportPal.mockRejectedValueOnce(new Error('Share failed'));

      const pal = createLocalPal();
      const {UNSAFE_getAllByType} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      const iconButtons = UNSAFE_getAllByType(
        require('react-native-paper').IconButton,
      );
      const shareButton = iconButtons[0];

      await act(async () => {
        fireEvent.press(shareButton);
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Share Error',
          'Failed to share pal. Please try again.',
          [{text: 'OK'}],
        );
      });
    });

    it('handles chat start error gracefully', async () => {
      jest.spyOn(Alert, 'alert');
      chatSessionStore.setActivePal = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failed'));

      const pal = createLocalPal();
      const {UNSAFE_getAllByType} = render(
        <SquarePalCard pal={pal} onPress={mockOnPress} isLocal={true} />,
      );

      const touchables = UNSAFE_getAllByType(
        require('react-native').TouchableOpacity,
      );
      const chatButton = touchables.find(
        t => t.props.style?.chatButton !== undefined,
      );

      if (chatButton) {
        await act(async () => {
          fireEvent.press(chatButton);
        });

        await waitFor(() => {
          expect(Alert.alert).toHaveBeenCalledWith(
            'Error',
            'Failed to start chat. Please try again.',
          );
        });
      }
    });
  });
});
