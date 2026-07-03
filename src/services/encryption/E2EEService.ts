import { Buffer } from 'buffer';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import {
  IE2EEService,
  EncryptedData,
  KeyPair,
  E2EE_VERSION,
} from './IE2EEService';

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 256;
const IV_LENGTH = 16;
const SALT_LENGTH = 16;
const HASH_ALGORITHM = 'SHA-256';

function getCrypto(): Crypto {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto API not available');
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = Buffer.from(base64, 'base64').toString('binary');
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function uint8ArrayToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export class E2EEService implements IE2EEService {
  private _isReady: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      const crypto = getCrypto();
      this._isReady = !!crypto.subtle;
    } catch {
      this._isReady = false;
    }
  }

  get isReady(): boolean {
    return this._isReady;
  }

  async generateKey(): Promise<string> {
    const crypto = getCrypto();
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: KEY_LENGTH },
      true,
      ['encrypt', 'decrypt']
    );
    const rawKey = await crypto.subtle.exportKey('raw', key);
    return uint8ArrayToBase64(new Uint8Array(rawKey));
  }

  async deriveKeyFromPassword(password: string, salt: string): Promise<string> {
    const crypto = getCrypto();
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      stringToUint8Array(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: stringToUint8Array(salt),
        iterations: PBKDF2_ITERATIONS,
        hash: HASH_ALGORITHM,
      },
      passwordKey,
      { name: 'AES-GCM', length: KEY_LENGTH },
      true,
      ['encrypt', 'decrypt']
    );

    const rawKey = await crypto.subtle.exportKey('raw', derivedKey);
    return uint8ArrayToBase64(new Uint8Array(rawKey));
  }

  generateSalt(): string {
    const crypto = getCrypto();
    const salt = new Uint8Array(SALT_LENGTH);
    crypto.getRandomValues(salt);
    return uint8ArrayToBase64(salt);
  }

  private async importAesKey(keyBase64: string): Promise<CryptoKey> {
    const crypto = getCrypto();
    const keyBytes = base64ToUint8Array(keyBase64);
    return crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encrypt(data: string, keyBase64: string): Promise<EncryptedData> {
    const crypto = getCrypto();
    const key = await this.importAesKey(keyBase64);

    const iv = new Uint8Array(IV_LENGTH);
    crypto.getRandomValues(iv);

    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      stringToUint8Array(data)
    );

    return {
      iv: uint8ArrayToBase64(iv),
      ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertextBuffer)),
      version: E2EE_VERSION,
    };
  }

  async decrypt(encrypted: EncryptedData, keyBase64: string): Promise<string> {
    const crypto = getCrypto();
    const key = await this.importAesKey(keyBase64);

    const iv = base64ToUint8Array(encrypted.iv);
    const ciphertext = base64ToUint8Array(encrypted.ciphertext);

    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return uint8ArrayToString(new Uint8Array(plaintextBuffer));
  }

  async encryptObject<T>(obj: T, keyBase64: string): Promise<EncryptedData> {
    const jsonString = JSON.stringify(obj);
    return this.encrypt(jsonString, keyBase64);
  }

  async decryptObject<T>(encrypted: EncryptedData, keyBase64: string): Promise<T> {
    const jsonString = await this.decrypt(encrypted, keyBase64);
    return JSON.parse(jsonString) as T;
  }

  async generateKeyPair(): Promise<KeyPair> {
    const crypto = getCrypto();
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: HASH_ALGORITHM,
      },
      true,
      ['encrypt', 'decrypt']
    );

    const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

    return {
      publicKey: uint8ArrayToBase64(new Uint8Array(publicKeyBuffer)),
      privateKey: uint8ArrayToBase64(new Uint8Array(privateKeyBuffer)),
    };
  }

  async encryptWithPublicKey(data: string, publicKeyBase64: string): Promise<EncryptedData> {
    const crypto = getCrypto();

    const aesKey = await this.generateKey();
    const encryptedData = await this.encrypt(data, aesKey);

    const publicKeyBuffer = base64ToUint8Array(publicKeyBase64);
    const publicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyBuffer,
      { name: 'RSA-OAEP', hash: HASH_ALGORITHM },
      false,
      ['encrypt']
    );

    const wrappedAesKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      base64ToUint8Array(aesKey)
    );

    return {
      iv: encryptedData.iv,
      ciphertext: JSON.stringify({
        data: encryptedData.ciphertext,
        wrappedKey: uint8ArrayToBase64(new Uint8Array(wrappedAesKey)),
      }),
      version: E2EE_VERSION,
    };
  }

  async decryptWithPrivateKey(
    encrypted: EncryptedData,
    privateKeyBase64: string
  ): Promise<string> {
    const crypto = getCrypto();

    const payload = JSON.parse(encrypted.ciphertext);
    const { data: encryptedData, wrappedKey } = payload;

    const privateKeyBuffer = base64ToUint8Array(privateKeyBase64);
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyBuffer,
      { name: 'RSA-OAEP', hash: HASH_ALGORITHM },
      false,
      ['decrypt']
    );

    const aesKeyBuffer = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      base64ToUint8Array(wrappedKey)
    );

    const aesKey = uint8ArrayToBase64(new Uint8Array(aesKeyBuffer));

    return this.decrypt(
      { iv: encrypted.iv, ciphertext: encryptedData, version: encrypted.version },
      aesKey
    );
  }

  async wrapKey(keyToWrap: string, wrappingKeyBase64: string): Promise<EncryptedData> {
    return this.encrypt(keyToWrap, wrappingKeyBase64);
  }

  async unwrapKey(wrappedKey: EncryptedData, unwrappingKeyBase64: string): Promise<string> {
    return this.decrypt(wrappedKey, unwrappingKeyBase64);
  }

  async hash(data: string): Promise<string> {
    const crypto = getCrypto();
    const digest = await crypto.subtle.digest(HASH_ALGORITHM, stringToUint8Array(data));
    return uint8ArrayToBase64(new Uint8Array(digest));
  }

  async verifyHash(data: string, expectedHash: string): Promise<boolean> {
    const actualHash = await this.hash(data);
    return actualHash === expectedHash;
  }

  generateId(): string {
    return uuidv4();
  }

  secureRandomBytes(length: number): Uint8Array {
    const crypto = getCrypto();
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }
}

let e2eeInstance: E2EEService | null = null;

export function getE2EEService(): E2EEService {
  if (!e2eeInstance) {
    e2eeInstance = new E2EEService();
  }
  return e2eeInstance;
}

export default E2EEService;
