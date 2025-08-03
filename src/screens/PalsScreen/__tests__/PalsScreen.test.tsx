import React from 'react';
import {fireEvent} from '@testing-library/react-native';
import {render} from '../../../../jest/test-utils';
import {PalsScreen} from '../PalsScreen';
import {PalType} from '../../../components/PalsSheets';
import {palStore} from '../../../store/PalStore';
import {L10nContext} from '../../../utils';
import {l10n} from '../../../utils/l10n';

// Mock the store
jest.mock('../../../store/PalStore', () => ({
  palStore: {
    getPals: jest.fn(),
  },
}));

// Mock the sheets
const mockAssistantSheet = jest.fn();
const mockRoleplaySheet = jest.fn();
const mockVideoPalSheet = jest.fn();

jest.mock('../../../components/PalsSheets', () => ({
  PalType: {
    ASSISTANT: 'ASSISTANT',
    ROLEPLAY: 'ROLEPLAY',
    VIDEO: 'VIDEO',
  },
  AssistantPalSheet: (props: any) => {
    mockAssistantSheet(props);
    return null;
  },
  RoleplayPalSheet: (props: any) => {
    mockRoleplaySheet(props);
    return null;
  },
  VideoPalSheet: (props: any) => {
    mockVideoPalSheet(props);
    return null;
  },
}));

// Mock the icons
jest.mock('../../../assets/icons', () => {
  const {View} = require('react-native');
  return {
    ChevronRightIcon: ({testID = 'chevron-right-icon', ...props}) => (
      <View testID={testID} {...props} />
    ),
    ChevronDownIcon: ({testID = 'chevron-down-icon', ...props}) => (
      <View testID={testID} {...props} />
    ),
    PlusIcon: ({testID = 'plus-icon', ...props}) => (
      <View testID={testID} {...props} />
    ),
    PencilLineIcon: ({testID = 'pencil-icon', ...props}) => (
      <View testID={testID} {...props} />
    ),
    TrashIcon: ({testID = 'trash-icon', ...props}) => (
      <View testID={testID} {...props} />
    ),
    ShareIcon: ({testID = 'share-icon', ...props}) => (
      <View testID={testID} {...props} />
    ),
  };
});

const renderWithL10n = (ui: React.ReactElement, options?: any) => {
  return render(
    <L10nContext.Provider value={l10n.en as any}>{ui}</L10nContext.Provider>,
    options,
  );
};

describe('PalsScreen', () => {
  const mockPals = [
    {
      id: '1',
      name: 'Assistant Pal',
      palType: PalType.ASSISTANT,
      systemPrompt: 'Test system prompt',
    },
    {
      id: '2',
      name: 'Roleplay Pal',
      palType: PalType.ROLEPLAY,
      world: 'Test world',
      toneStyle: 'Test tone',
      aiRole: 'Test AI role',
      userRole: 'Test user role',
      systemPrompt: 'Test system prompt',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (palStore.getPals as jest.Mock).mockReturnValue(mockPals);
  });

  it('renders create buttons', () => {
    const {getByText, getAllByTestId} = renderWithL10n(<PalsScreen />, {
      withSafeArea: true,
    });

    expect(getByText('Assistant')).toBeDefined();
    expect(getByText('Roleplay')).toBeDefined();
    expect(getAllByTestId('plus-icon')).toHaveLength(3); // Updated to 3 for Video
  });

  it('renders list of pals', () => {
    const {getByText, getAllByTestId} = renderWithL10n(<PalsScreen />);

    expect(getByText('Assistant Pal')).toBeDefined();
    expect(getByText('Roleplay Pal')).toBeDefined();
    expect(getAllByTestId('chevron-right-icon')).toHaveLength(2);
  });

  it('shows assistant details when expanded', () => {
    const {getByText, getByTestId} = renderWithL10n(<PalsScreen />);

    fireEvent.press(getByText('Assistant Pal'));

    expect(getByTestId('chevron-down-icon')).toBeDefined();
    expect(getByText('System Prompt')).toBeDefined();
    expect(getByText('Test system prompt')).toBeDefined();
  });

  it('shows roleplay details when expanded', () => {
    const {getByText, getByTestId} = renderWithL10n(<PalsScreen />);

    fireEvent.press(getByText('Roleplay Pal'));

    expect(getByTestId('chevron-down-icon')).toBeDefined();
    expect(getByText('World')).toBeDefined();
    expect(getByText('Test world')).toBeDefined();
    expect(getByText('Tone/Style')).toBeDefined();
    expect(getByText('Test tone')).toBeDefined();
    expect(getByText("AI's Role")).toBeDefined();
    expect(getByText('Test AI role')).toBeDefined();
    expect(getByText('My Role')).toBeDefined();
    expect(getByText('Test user role')).toBeDefined();
    expect(getByText('Prompt')).toBeDefined();
    expect(getByText('Test system prompt')).toBeDefined();
  });

  it('opens AssistantPalSheet when creating new assistant', () => {
    const {getByText} = renderWithL10n(<PalsScreen />);

    fireEvent.press(getByText('Assistant'));

    expect(mockAssistantSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isVisible: true,
        editPal: undefined,
      }),
    );
  });

  it('opens RoleplayPalSheet when creating new roleplay', () => {
    const {getByText} = renderWithL10n(<PalsScreen />);

    fireEvent.press(getByText('Roleplay'));

    expect(mockRoleplaySheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isVisible: true,
        editPal: undefined,
      }),
    );
  });

  it('opens AssistantPalSheet with pal data when editing assistant', () => {
    const {getAllByTestId} = renderWithL10n(<PalsScreen />);

    const pencilIcons = getAllByTestId('pencil-icon');
    fireEvent.press(pencilIcons[0]); // First pencil icon is for assistant pal

    expect(mockAssistantSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isVisible: true,
        editPal: mockPals[0],
      }),
    );
  });

  it('opens RoleplayPalSheet with pal data when editing roleplay', () => {
    const {getAllByTestId} = renderWithL10n(<PalsScreen />);

    const pencilIcons = getAllByTestId('pencil-icon');
    fireEvent.press(pencilIcons[1]); // Second pencil icon is for roleplay pal

    expect(mockRoleplaySheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isVisible: true,
        editPal: mockPals[1],
      }),
    );
  });

  it('closes sheets when onClose is called', () => {
    const {getByText} = renderWithL10n(<PalsScreen />);

    // Open and close assistant sheet
    fireEvent.press(getByText('Assistant'));
    expect(mockAssistantSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isVisible: true,
      }),
    );

    // Get the last call's props and call onClose
    const assistantProps =
      mockAssistantSheet.mock.calls[
        mockAssistantSheet.mock.calls.length - 1
      ][0];
    assistantProps.onClose();

    expect(mockAssistantSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isVisible: false,
      }),
    );

    // Open and close roleplay sheet
    fireEvent.press(getByText('Roleplay'));
    expect(mockRoleplaySheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isVisible: true,
      }),
    );

    // Get the last call's props and call onClose
    const roleplayProps =
      mockRoleplaySheet.mock.calls[mockRoleplaySheet.mock.calls.length - 1][0];
    roleplayProps.onClose();

    expect(mockRoleplaySheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isVisible: false,
      }),
    );
  });
});
