export interface EncryptedData {
  iv: string;
  ciphertext: string;
  version: number;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface IE2EEService {
  isReady: boolean;

  generateKey(): Promise<string>;

  deriveKeyFromPassword(password: string, salt: string): Promise<string>;

  generateSalt(): string;

  encrypt(data: string, keyBase64: string): Promise<EncryptedData>;

  decrypt(encrypted: EncryptedData, keyBase64: string): Promise<string>;

  encryptObject<T>(obj: T, keyBase64: string): Promise<EncryptedData>;

  decryptObject<T>(encrypted: EncryptedData, keyBase64: string): Promise<T>;

  generateKeyPair(): Promise<KeyPair>;

  encryptWithPublicKey(data: string, publicKeyBase64: string): Promise<EncryptedData>;

  decryptWithPrivateKey(encrypted: EncryptedData, privateKeyBase64: string): Promise<string>;

  wrapKey(keyToWrap: string, wrappingKeyBase64: string): Promise<EncryptedData>;

  unwrapKey(wrappedKey: EncryptedData, unwrappingKeyBase64: string): Promise<string>;

  hash(data: string): Promise<string>;

  verifyHash(data: string, expectedHash: string): Promise<boolean>;
}

export const E2EE_VERSION = 1;
