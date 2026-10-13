import {fetchModelsWithHeaders} from '../openai';
import {
  directTextModelsBody,
  routerModelsBody,
} from '../../../jest/fixtures/remoteModelList';

const respondWith = (body: unknown) => {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    headers: {forEach: () => {}},
    json: () => Promise.resolve(body),
  });
};

describe('fetchModelsWithHeaders models key', () => {
  it('marks a single-model server body, which carries a models key', async () => {
    respondWith(directTextModelsBody);

    const result = await fetchModelsWithHeaders('http://localhost:8080');

    expect(result.hasModelsKey).toBe(true);
  });

  it('leaves a router body unmarked', async () => {
    respondWith(routerModelsBody);

    const result = await fetchModelsWithHeaders('http://localhost:8080');

    expect(result.hasModelsKey).toBeUndefined();
  });

  it('answers for an empty list by the key alone', async () => {
    respondWith({object: 'list', data: [], models: []});
    expect((await fetchModelsWithHeaders('http://h')).hasModelsKey).toBe(true);

    respondWith({object: 'list', data: []});
    expect(
      (await fetchModelsWithHeaders('http://h')).hasModelsKey,
    ).toBeUndefined();
  });
});
