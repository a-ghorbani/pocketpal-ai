import AsyncStorage from '@react-native-async-storage/async-storage';
import { getE2EEService, E2EEService } from './E2EEService';
import { EncryptedData } from './IE2EEService';

const KEY_STORAGE_KEY = '@pocketpal_e2ee_key';
const SALT_STORAGE_KEY = '@pocketpal_e2ee_salt';
const KEY_PAIR_STORAGE_KEY = '@pocketpal_e2ee_keypair';

export class EncryptionManager {
  private e2ee: E2EEService;
  private masterKey: string | null = null;
  private isInitialized: boolean = false;

  constructor() {
    this.e2ee = getE2EEService();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const storedKey = await AsyncStorage.getItem(KEY_STORAGE_KEY);
      if (storedKey) {
        this.masterKey = storedKey;
      } else {
          this.masterKey = await this.e2ee.generateKey();
          await AsyncStorage.setItem(KEY_STORAGE_KEY, this.masterKey);
        }
      this.isInitialized = true;
    } catch (error) {
      console.error('[EncryptionManager] Init failed:', error);
      throw error;
    }
  }

  async initializeWithPassword(password: string): Promise<void> {
    try {
      let salt = await AsyncStorage.getItem(SALT_STORAGE_KEY);
      if (!salt) {
        salt = this.e2ee.generateSalt();
        await AsyncStorage.setItem(SALT_STORAGE_KEY, salt);
      }

      this.masterKey = await this.e2ee.deriveKeyFromPassword(password, salt);
      this.isInitialized = true;
    } catch (error) {
      console.error('[EncryptionManager] Password init failed:', error);
      throw error;
    }
  }

  getMasterKey(): string | null {
    return this.masterKey;
  }

  async encryptData(data: string): Promise<EncryptedData> {
    if (!this.masterKey) {
      throw new Error('Encryption not initialized');
    }
    return this.e2ee.encrypt(data, this.masterKey);
  }

  async decryptData(encrypted: EncryptedData): Promise<string> {
    if (!this.masterKey) {
      throw new Error('Encryption not initialized');
    }
    return this.e2ee.decrypt(encrypted, this.masterKey);
  }

  async encryptObject<T>(obj: T): Promise<EncryptedData> {
    if (!this.masterKey) {
      throw new Error('Encryption not initialized');
    }
    return this.e2ee.encryptObject(obj, this.masterKey);
  }

  async decryptObject<T>(encrypted: EncryptedData): Promise<T> {
    if (!this.masterKey) {
      throw new Error('Encryption not initialized');
    }
    return this.e2ee.decryptObject<T>(encrypted, this.masterKey);
  }

  async rotateKey(): Promise<boolean> {
    try {
      const newKey = await this.e2ee.generateKey();
      this.masterKey = newKey;
      await AsyncStorage.setItem(KEY_STORAGE_KEY, newKey);
      return true;
    } catch (error) {
      console.error('[EncryptionManager] Key rotation failed:', error);
      return false;
    }
  }

  async reset(): Promise<void> {
    this.masterKey = null;
    this.isInitialized = false;
    await AsyncStorage.multiRemove([KEY_STORAGE_KEY, SALT_STORAGE_KEY, KEY_PAIR_STORAGE_KEY]);
  }

  isReady(): boolean {
    return this.isInitialized && this.masterKey !== null;
  }
}

let encryptionManagerInstance: EncryptionManager | null = null;

export function getEncryptionManager(): EncryptionManager {
  if (!encryptionManagerInstance) {
    encryptionManagerInstance = new EncryptionManager();
  }
  return encryptionManagerInstance;
}

export default EncryptionManager;
