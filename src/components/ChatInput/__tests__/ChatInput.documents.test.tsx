import * as React from 'react';
import {act, fireEvent, waitFor} from '@testing-library/react-native';
import {runInAction} from 'mobx';
import {pick} from '@react-native-documents/picker';

import {user} from '../../../../jest/fixtures';
import {l10n} from '../../../locales';
import {UserContext} from '../../../utils';
import {render} from '../../../../jest/test-utils';
import {modelStore, uiStore} from '../../../store';
import * as documentStore from '../../../services/documents/store';
import type {
  ComposerDocument,
  DocumentRef,
} from '../../../services/documents/types';

import {ChatInput} from '../ChatInput';

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
}));

const importDocument = jest.spyOn(documentStore, 'importDocument');
const releaseImportHold = jest.spyOn(documentStore, 'releaseImportHold');

const ref = (id: string, extra: Partial<DocumentRef> = {}): DocumentRef => ({
  id,
  name: `${id}.pdf`,
  kind: 'pdf',
  byteSize: 1,
  pageCount: 12,
  charCount: 12400,
  tokenEstimate: 3100,
  ...extra,
});

const picked = (name: string) => ({
  uri: `content://${name}`,
  name,
  size: 10,
  isVirtual: false,
  convertibleToMimeTypes: null,
});

/** Owns the composer documents the way ChatView does. */
const Harness = ({
  initial = [],
  onSendPress = jest.fn(),
  onOpenDocumentRange = jest.fn(),
  isVisionEnabled = false,
  text = '',
  onChange,
  documentModes,
}: {
  onChange?: jest.Mock;
  documentModes?: Record<string, 'full' | 'searched'>;
  initial?: ComposerDocument[];
  onSendPress?: jest.Mock;
  onOpenDocumentRange?: jest.Mock;
  isVisionEnabled?: boolean;
  text?: string;
}) => {
  const [documents, setDocuments] = React.useState(initial);
  const docsRef = React.useRef(initial);
  return (
    <UserContext.Provider value={user}>
      <ChatInput
        onSendPress={onSendPress}
        showImageUpload
        isVisionEnabled={isVisionEnabled}
        sendButtonVisibilityMode="always"
        textInputProps={{value: text}}
        documents={documents}
        documentModes={documentModes}
        onDocumentsChange={update => {
          docsRef.current = update(docsRef.current);
          onChange?.(docsRef.current);
          setDocuments(docsRef.current);
        }}
        onOpenDocumentRange={onOpenDocumentRange}
      />
    </UserContext.Provider>
  );
};

const openMenu = (utils: ReturnType<typeof render>) =>
  fireEvent.press(utils.getByLabelText('Add attachment'));

beforeEach(() => {
  jest.clearAllMocks();
  runInAction(() => {
    modelStore.activeModelId = 'test-model-id';
  });
});

describe('ChatInput documents', () => {
  it('offers Document with Camera and Gallery disabled for a non-vision model', async () => {
    const utils = render(<Harness />);
    openMenu(utils);
    await waitFor(() => utils.getByTestId('attach-document'));
    expect(
      utils.getByTestId('attach-camera').props.accessibilityState?.disabled,
    ).toBe(true);
    expect(
      utils.getByTestId('attach-gallery').props.accessibilityState?.disabled,
    ).toBe(true);
    expect(
      utils.getByTestId('attach-document').props.accessibilityState?.disabled,
    ).toBeFalsy();
  });

  it('imports a picked PDF into a ready chip and releases the import hold', async () => {
    (pick as jest.Mock).mockResolvedValueOnce([picked('report.pdf')]);
    importDocument.mockResolvedValueOnce({status: 'ready', ref: ref('r1')});
    const utils = render(<Harness />);
    openMenu(utils);
    await waitFor(() => utils.getByTestId('attach-document'));

    await act(async () => {
      fireEvent.press(utils.getByTestId('attach-document'));
    });

    await waitFor(() =>
      expect(utils.getByText('12 pages · ~3.1k tokens')).toBeTruthy(),
    );
    expect(modelStore.disableAutoRelease).toHaveBeenCalledWith('document-pick');
    expect(modelStore.enableAutoRelease).toHaveBeenCalledWith('document-pick');
    expect(releaseImportHold).toHaveBeenCalledWith('r1');
  });

  it('ends silently when the picker is cancelled', async () => {
    (pick as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('cancel'), {code: 'OPERATION_CANCELED'}),
    );
    const utils = render(<Harness />);
    openMenu(utils);
    await waitFor(() => utils.getByTestId('attach-document'));

    await act(async () => {
      fireEvent.press(utils.getByTestId('attach-document'));
    });

    expect(uiStore.setChatWarning).not.toHaveBeenCalled();
    expect(importDocument).not.toHaveBeenCalled();
    expect(modelStore.enableAutoRelease).toHaveBeenCalledWith('document-pick');
  });

  it('re-enables auto-release when the picker throws', async () => {
    (pick as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const utils = render(<Harness />);
    openMenu(utils);
    await waitFor(() => utils.getByTestId('attach-document'));
    jest.spyOn(console, 'error').mockImplementationOnce(() => {});

    await act(async () => {
      fireEvent.press(utils.getByTestId('attach-document'));
    });

    expect(modelStore.enableAutoRelease).toHaveBeenCalledWith('document-pick');
  });

  it('warns with the file name and reason on a refusal and adds no chip', async () => {
    (pick as jest.Mock).mockResolvedValueOnce([picked('scan.pdf')]);
    importDocument.mockResolvedValueOnce({
      status: 'refused',
      reason: 'no_text',
    });
    const utils = render(<Harness />);
    openMenu(utils);
    await waitFor(() => utils.getByTestId('attach-document'));

    await act(async () => {
      fireEvent.press(utils.getByTestId('attach-document'));
    });

    expect(uiStore.setChatWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('scan.pdf'),
      }),
    );
    expect(
      (uiStore.setChatWarning as jest.Mock).mock.calls[0][0].message,
    ).toContain(l10n.en.chat.documents.refusals.no_text);
    expect(utils.queryByText('scan.pdf')).toBeNull();
  });

  it('refuses files beyond five per message', async () => {
    const initial: ComposerDocument[] = [1, 2, 3, 4].map(i => ({
      key: `k${i}`,
      status: 'ready',
      name: `d${i}.pdf`,
      ref: ref(`d${i}`),
    }));
    (pick as jest.Mock).mockResolvedValueOnce([
      picked('fifth.pdf'),
      picked('sixth.pdf'),
    ]);
    importDocument.mockResolvedValue({status: 'ready', ref: ref('x')});
    const utils = render(<Harness initial={initial} />);
    openMenu(utils);
    await waitFor(() => utils.getByTestId('attach-document'));

    await act(async () => {
      fireEvent.press(utils.getByTestId('attach-document'));
    });

    expect(importDocument).toHaveBeenCalledTimes(1);
    expect(uiStore.setChatWarning).toHaveBeenCalledWith(
      expect.objectContaining({message: expect.stringContaining('sixth.pdf')}),
    );
    importDocument.mockReset();
  });

  it('opens the range sheet when an import needs a range, and blocks Send', async () => {
    (pick as jest.Mock).mockResolvedValueOnce([picked('big.pdf')]);
    importDocument.mockResolvedValueOnce({
      status: 'needs_range',
      ref: ref('big', {pageCount: 1200}),
      rangeLimit: 'too_many_pages',
    });
    const onSendPress = jest.fn();
    const onOpenDocumentRange = jest.fn();
    const utils = render(
      <Harness
        text="Summarise"
        onSendPress={onSendPress}
        onOpenDocumentRange={onOpenDocumentRange}
      />,
    );
    openMenu(utils);
    await waitFor(() => utils.getByTestId('attach-document'));

    await act(async () => {
      fireEvent.press(utils.getByTestId('attach-document'));
    });

    await waitFor(() =>
      expect(utils.getByText('1200 pages · choose pages')).toBeTruthy(),
    );
    expect(onOpenDocumentRange).toHaveBeenCalledTimes(1);
    fireEvent.press(
      utils.getByLabelText(l10n.en.components.sendButton.accessibilityLabel),
    );
    expect(onSendPress).not.toHaveBeenCalled();
  });

  it('drops an import result whose chip was removed meanwhile', async () => {
    let resolveImport: (value: any) => void = () => {};
    (pick as jest.Mock).mockResolvedValueOnce([picked('late.pdf')]);
    importDocument.mockImplementationOnce(
      () => new Promise(resolve => (resolveImport = resolve)),
    );
    const utils = render(<Harness />);
    openMenu(utils);
    await waitFor(() => utils.getByTestId('attach-document'));
    await act(async () => {
      fireEvent.press(utils.getByTestId('attach-document'));
    });
    await waitFor(() => utils.getByText('late.pdf'));
    const removeButton = utils.getByLabelText('Remove late.pdf');

    fireEvent.press(removeButton);
    await act(async () => {
      resolveImport({status: 'ready', ref: ref('late')});
    });

    expect(utils.queryByText('late.pdf')).toBeNull();
    expect(releaseImportHold).toHaveBeenCalledWith('late');
  });

  it('sends ready documents with the typed text', () => {
    const onSendPress = jest.fn();
    const report = ref('r1');
    const utils = render(
      <Harness
        text="Summarise"
        onSendPress={onSendPress}
        initial={[{key: 'k', status: 'ready', name: 'r1.pdf', ref: report}]}
      />,
    );
    fireEvent.press(
      utils.getByLabelText(l10n.en.components.sendButton.accessibilityLabel),
    );
    expect(onSendPress).toHaveBeenCalledWith(
      expect.objectContaining({text: 'Summarise', documents: [report]}),
    );
  });

  it('pins a full chip through Search instead', () => {
    const onChange = jest.fn();
    const utils = render(
      <Harness
        onChange={onChange}
        documentModes={{k: 'full'}}
        initial={[{key: 'k', status: 'ready', name: 'r1.pdf', ref: ref('r1')}]}
      />,
    );
    expect(utils.getByText('12 pages · in full · ~3.1k tokens')).toBeTruthy();

    fireEvent.press(utils.getByText('Search instead'));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        ref: expect.objectContaining({searchPinned: true}),
      }),
    ]);
  });
});
