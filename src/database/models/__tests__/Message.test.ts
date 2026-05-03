import Message from '../Message';
import {AgentStep, MessageType} from '../../../utils/types';

/**
 * WatermelonDB decorators are no-ops under the jest mock, so we can
 * construct Message instances by setting prototype + properties and
 * exercise `toMessageObject()` directly without a real DB.
 */
function makeMessage(raw: Record<string, any> = {}): Message {
  const base: Record<string, any> = {
    id: 'msg-id',
    sessionId: 'session-id',
    author: 'author-id',
    type: 'text',
    text: '',
    createdAt: 1700000000000,
    metadata: '{}',
    position: 0,
    ...raw,
  };
  const instance = Object.create(Message.prototype);
  for (const [k, v] of Object.entries(base)) {
    Object.defineProperty(instance, k, {
      value: v,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  return instance as Message;
}

describe('Message.toMessageObject', () => {
  // ---------- Story Test Requirements (Persistence) #1, #2, #3 ----------

  it('#1 lifts metadata.steps to top-level steps for assistant_turn', () => {
    const steps: AgentStep[] = [
      {content: 'Let me calculate'},
      {
        content: 'The answer is 42',
        toolCalls: [
          {id: 'c0', function: {name: 'calculate', arguments: '{}'}},
        ],
      },
    ];
    const msg = makeMessage({
      type: 'assistant_turn',
      text: '', // empty by design for assistant_turn
      metadata: JSON.stringify({steps, copyable: true}),
    });
    const obj = msg.toMessageObject() as MessageType.AssistantTurn;
    expect(obj.type).toBe('assistant_turn');
    expect(obj.steps).toEqual(steps);
    expect(obj.steps).toHaveLength(2);
    // copyable preserved on top-level metadata
    expect(obj.metadata?.copyable).toBe(true);
  });

  it('#2 text message round-trip is unchanged (regression guard)', () => {
    const msg = makeMessage({
      type: 'text',
      text: 'hello world',
      metadata: JSON.stringify({copyable: true, timings: {}}),
    });
    const obj = msg.toMessageObject() as MessageType.Text;
    expect(obj.type).toBe('text');
    expect(obj.text).toBe('hello world');
    expect(obj.metadata?.copyable).toBe(true);
  });

  it('#3 missing metadata.steps → top-level steps: [] (no crash)', () => {
    const msg = makeMessage({
      type: 'assistant_turn',
      text: '',
      metadata: JSON.stringify({copyable: true}),
    });
    const obj = msg.toMessageObject() as MessageType.AssistantTurn;
    expect(obj.steps).toEqual([]);
    expect(obj.metadata?.copyable).toBe(true);
  });

  // ---------- Lift semantics (story Persistence section) ----------

  it('strips metadata.steps from in-memory metadata (lift semantics, pinned)', () => {
    const steps: AgentStep[] = [{content: 'visible'}];
    const msg = makeMessage({
      type: 'assistant_turn',
      metadata: JSON.stringify({steps, timings: {predicted_per_second: 12}}),
    });
    const obj = msg.toMessageObject() as MessageType.AssistantTurn;
    // Top-level steps populated.
    expect(obj.steps).toEqual(steps);
    // metadata.steps stripped from the in-memory metadata bag — the
    // persistence layer is the sole writer of metadata.steps on disk.
    expect((obj.metadata as any)?.steps).toBeUndefined();
    // Other metadata fields preserved.
    expect(obj.metadata?.timings).toEqual({predicted_per_second: 12});
  });

  it('handles malformed (non-array) metadata.steps gracefully → []', () => {
    const msg = makeMessage({
      type: 'assistant_turn',
      metadata: JSON.stringify({steps: 'not-an-array'}),
    });
    const obj = msg.toMessageObject() as MessageType.AssistantTurn;
    expect(obj.steps).toEqual([]);
  });

  it('falls back to {} metadata when metadata field is empty string', () => {
    const msg = makeMessage({
      type: 'assistant_turn',
      metadata: '',
    });
    const obj = msg.toMessageObject() as MessageType.AssistantTurn;
    expect(obj.steps).toEqual([]);
    expect(obj.metadata).toEqual({});
  });

  it('extracts authorData from metadata for the User shape', () => {
    const msg = makeMessage({
      type: 'assistant_turn',
      author: 'assistant',
      metadata: JSON.stringify({
        steps: [{content: 'hi'}],
        authorData: {firstName: 'PocketPal'},
      }),
    });
    const obj = msg.toMessageObject();
    expect(obj.author.id).toBe('assistant');
    expect(obj.author.firstName).toBe('PocketPal');
  });

  it('text message with imageUris in metadata is preserved on top-level', () => {
    const msg = makeMessage({
      type: 'text',
      text: 'look',
      metadata: JSON.stringify({imageUris: ['file:///a.jpg']}),
    });
    const obj = msg.toMessageObject() as MessageType.Text;
    expect(obj.imageUris).toEqual(['file:///a.jpg']);
  });

  it('non-text/non-assistant_turn types fall through to default branch', () => {
    const msg = makeMessage({type: 'image', metadata: '{}'});
    const obj = msg.toMessageObject();
    expect(obj.type).toBe('image');
  });
});
