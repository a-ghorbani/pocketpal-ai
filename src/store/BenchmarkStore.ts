import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {BenchmarkResult} from '../utils/types';
import {
  migrateBenchmarkResults,
  migrateBenchmarkResult,
} from '../utils/benchmarkMigration';

export class BenchmarkStore {
  results: BenchmarkResult[] = [];

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'BenchmarkStore',
      properties: ['results'],
      storage: AsyncStorage,
    }).then(() => {
      // Migrate benchmark results after loading from storage
      runInAction(() => {
        this.results = migrateBenchmarkResults(this.results);
      });
    });
  }

  addResult(result: BenchmarkResult) {
    runInAction(() => {
      // Migrate the result in case it still has legacy format
      const migratedResult = migrateBenchmarkResult(result);
      this.results.unshift(migratedResult); // Add new result at the beginning
    });
  }

  removeResult(timestamp: string) {
    runInAction(() => {
      this.results = this.results.filter(
        result => result.timestamp !== timestamp,
      );
    });
  }

  clearResults() {
    runInAction(() => {
      this.results = [];
    });
  }

  getResultsByModel(modelId: string): BenchmarkResult[] {
    return this.results.filter(result => result.modelId === modelId);
  }

  get latestResult(): BenchmarkResult | undefined {
    return this.results[0];
  }

  markAsSubmitted(uuid: string) {
    runInAction(() => {
      const result = this.results.find(r => r.uuid === uuid);
      if (result) {
        result.submitted = true;
      }
    });
  }
}

export const benchmarkStore = new BenchmarkStore();
