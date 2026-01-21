import {MessageType} from '../../src/utils/types';

export const sessionFixtures = [
  {
    id: 'session-1',
    title: 'Session 1',
    date: '2024-10-12',
    messages: [{id: 'msg-1', text: 'Hello!', type: 'text'} as MessageType.Text],
    messagesLoaded: true,
  },
  {
    id: 'session-2',
    title: 'Session 2',
    date: '2024-10-11',
    messages: [
      {id: 'msg-2', text: 'Hey there!', type: 'text'} as MessageType.Text,
    ],
    messagesLoaded: true,
  },
];
