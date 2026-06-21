import type {Pal, LegacyPalData} from '../../src/store/PalStore';
import {migrateLegacyPalToNew} from '../../src/utils/pal-migration';

class MockPalStore {
  pals: Pal[] = [];
  isUSRegion: boolean = false;

  // PalsHub discovery state (read by the Explore tab).
  cachedPalsHubPals: any[] = [];
  isLoadingPalsHub: boolean = false;

  constructor() {
    // makeAutoObservable(this);
  }

  addPal = jest.fn((data: LegacyPalData) => {
    const newPal = migrateLegacyPalToNew({
      id: 'mock-uuid-12345' + Math.random(),
      ...data,
    });
    this.pals.push(newPal);
  });

  createPal = jest.fn(
    async (palData: Omit<Pal, 'id' | 'created_at' | 'updated_at'>) => {
      const newPal: Pal = {
        id: 'mock-uuid-' + Math.random(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...palData,
      };
      this.pals.push(newPal);
      return newPal;
    },
  );

  updatePal = jest.fn((id: string, data: Partial<Pal>) => {
    const palIndex = this.pals.findIndex(p => p.id === id);
    if (palIndex !== -1) {
      const currentPal = this.pals[palIndex];
      this.pals[palIndex] = {
        ...currentPal,
        ...data,
        updated_at: new Date().toISOString(),
      } as Pal;
    }
  });

  deletePal = jest.fn((id: string) => {
    const palIndex = this.pals.findIndex(p => p.id === id);
    if (palIndex !== -1) {
      this.pals.splice(palIndex, 1);
    }
  });

  getPals = jest.fn(() => {
    return this.pals;
  });

  getPalById = jest.fn((id: string) => this.pals.find(p => p.id === id));

  getAllPals = jest.fn(() => this.pals);

  // Capability-based methods
  getVideoPals = jest.fn(() =>
    this.pals.filter(p => p.capabilities?.video === true),
  );

  getLocalPals = jest.fn(() =>
    this.pals.filter(p => p.source === 'local' || !p.source),
  );
  getDownloadedPalsHubPals = jest.fn(() =>
    this.pals.filter(p => p.source === 'palshub'),
  );
  searchPalsHubPals = jest.fn(async () => ({
    pals: this.cachedPalsHubPals,
    total_count: this.cachedPalsHubPals.length,
    page: 1,
    limit: 20,
    has_more: false,
  }));
  loadUserLibrary = jest.fn(async () => {});
  loadUserCreatedPals = jest.fn(async () => {});

  // PalsHub-related methods
  isPalsHubPalDownloaded = jest.fn(() => false);
  downloadPalsHubPal = jest.fn(async () => {});
  getCategories = jest.fn(async () => ({categories: []}));
  getTags = jest.fn(async () => ({tags: []}));
}

export const mockPalStore = new MockPalStore();
export const palStore = mockPalStore; // For compatibility
