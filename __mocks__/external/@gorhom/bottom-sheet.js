// __mocks__/@gorhom/bottom-sheet.js
const React = require('react');
const {View} = require('react-native');

// Create a mock ref with the methods that BottomSheet components use
const createMockRef = () => ({
  present: jest.fn(),
  dismiss: jest.fn(),
  close: jest.fn(),
  collapse: jest.fn(),
  expand: jest.fn(),
  snapToIndex: jest.fn(),
  snapToPosition: jest.fn(),
  forceClose: jest.fn(),
});

const BottomSheetBase = React.forwardRef((props, ref) => {
  // Set up the ref with mock methods
  React.useImperativeHandle(ref, createMockRef, []);
  return React.createElement(View, {...props}, props.children);
});

// Mock FlatList that actually renders items
const BottomSheetFlatList = React.forwardRef((props, ref) => {
  React.useImperativeHandle(ref, createMockRef, []);
  const {data, renderItem, keyExtractor, ...restProps} = props;

  return React.createElement(
    View,
    {...restProps},
    data?.map((item, index) =>
      React.createElement(
        View,
        {key: keyExtractor ? keyExtractor(item) : index},
        renderItem ? renderItem({item, index}) : null,
      ),
    ),
  );
});

// Provide aliases for all components that may be imported
const BottomSheet = BottomSheetBase;
const BottomSheetModal = BottomSheetBase;
const BottomSheetModalProvider = ({children}) =>
  React.createElement(View, null, children);
const BottomSheetBackdrop = BottomSheetBase;
const BottomSheetScrollView = BottomSheetBase;
const BottomSheetSectionList = BottomSheetBase;
const BottomSheetView = BottomSheetBase;

// Add TextInput component for BottomSheet
const BottomSheetTextInput = React.forwardRef((props, ref) => {
  const {TextInput} = require('react-native');
  return React.createElement(TextInput, {...props, ref});
});

const SCROLLABLE_TYPE = {
  SCROLLVIEW: 'SCROLLVIEW',
  FLATLIST: 'FLATLIST',
  SECTIONLIST: 'SECTIONLIST',
  VIEW: 'VIEW',
};

const createBottomSheetScrollableComponent = () => BottomSheetBase;

module.exports = {
  __esModule: true,
  default: BottomSheet,
  BottomSheet,
  BottomSheetModal,
  BottomSheetModalProvider,
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetFlatList,
  BottomSheetSectionList,
  BottomSheetView,
  BottomSheetTextInput,
  TextInput: BottomSheetTextInput,
  SCROLLABLE_TYPE,
  createBottomSheetScrollableComponent,
  useBottomSheetModal: () => ({}),
  useBottomSheet: () => ({}),
};
