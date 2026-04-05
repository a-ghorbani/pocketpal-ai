import {validateGGUFHeader} from '../ggufValidator';
import * as RNFS from '@dr.pogodin/react-native-fs';

const mockRead = RNFS.read as jest.MockedFunction<typeof RNFS.read>;

// Helper: encode bytes to base64
function bytesToBase64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

// Valid GGUF header: magic "GGUF"
const VALID_HEADER = bytesToBase64([0x47, 0x47, 0x55, 0x46]);
const INVALID_MAGIC = bytesToBase64([0x00, 0x00, 0x00, 0x00]);

describe('validateGGUFHeader', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts valid GGUF magic bytes', async () => {
    mockRead.mockResolvedValue(VALID_HEADER);
    const result = await validateGGUFHeader('/path/model.gguf');
    expect(result).toEqual({valid: true});
    expect(mockRead).toHaveBeenCalledWith('/path/model.gguf', 4, 0, 'base64');
  });

  it('rejects invalid magic bytes', async () => {
    mockRead.mockResolvedValue(INVALID_MAGIC);
    const result = await validateGGUFHeader('/path/model.gguf');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('magic');
  });

  it('rejects file too small', async () => {
    mockRead.mockResolvedValue(btoa('ab')); // 2 bytes
    const result = await validateGGUFHeader('/path/model.gguf');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too small');
  });

  it('handles file read error gracefully', async () => {
    mockRead.mockRejectedValue(new Error('ENOENT'));
    const result = await validateGGUFHeader('/path/missing.gguf');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('ENOENT');
  });
});
