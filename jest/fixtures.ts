import {MessageType, Size, User} from '../src/utils/types';

export const defaultDerivedMessageProps = {
  nextMessageInGroup: false,
  offset: 12,
  showName: false,
  showStatus: true,
};

export const fileMessage: MessageType.File = {
  author: {
    id: 'userId',
  },
  createdAt: 2000000,
  id: 'file-uuidv4',
  mimeType: 'application/pdf',
  name: 'flyer.pdf',
  size: 15000,
  status: 'seen',
  type: 'file',
  uri: 'file:///Users/admin/flyer.pdf',
};

export const derivedFileMessage: MessageType.DerivedFile = {
  ...fileMessage,
  ...defaultDerivedMessageProps,
};

export const imageMessage: MessageType.Image = {
  author: {
    id: 'image-userId',
  },
  createdAt: 0,
  height: 100,
  id: 'image-uuidv4',
  name: 'name',
  size: 15000,
  status: 'sending',
  type: 'image',
  uri: 'https://avatars1.githubusercontent.com/u/59206044',
  width: 100,
};

export const derivedImageMessage: MessageType.DerivedImage = {
  ...imageMessage,
  ...defaultDerivedMessageProps,
};

export const size: Size = {
  height: 896,
  width: 414,
};

export const textMessage: MessageType.Text = {
  author: {
    id: 'userId',
  },
  createdAt: 0,
  id: 'uuidv4',
  text: 'text',
  type: 'text',
};

export const derivedTextMessage: MessageType.DerivedText = {
  ...textMessage,
  ...defaultDerivedMessageProps,
};

export const user: User = {
  id: 'userId',
};

// Re-export pal fixtures
export * from './fixtures/pals';
