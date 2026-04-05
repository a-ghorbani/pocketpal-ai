import * as RNFS from '@dr.pogodin/react-native-fs';

// GGUF magic bytes: "GGUF" in ASCII
const GGUF_MAGIC = [0x47, 0x47, 0x55, 0x46];
const GGUF_MAGIC_SIZE = 4;

export async function validateGGUFHeader(
  filePath: string,
): Promise<{valid: boolean; error?: string}> {
  try {
    // Read raw bytes as base64 (explicit encoding required to avoid UTF-8 decoding)
    const base64Data = await RNFS.read(filePath, GGUF_MAGIC_SIZE, 0, 'base64');

    // Decode base64 to bytes
    const binaryString = atob(base64Data);
    if (binaryString.length < GGUF_MAGIC_SIZE) {
      return {valid: false, error: 'File too small for GGUF header'};
    }

    // Check magic bytes
    for (let i = 0; i < GGUF_MAGIC_SIZE; i++) {
      if (binaryString.charCodeAt(i) !== GGUF_MAGIC[i]) {
        return {valid: false, error: 'Invalid GGUF magic bytes'};
      }
    }

    return {valid: true};
  } catch (error) {
    return {
      valid: false,
      error: `Failed to read GGUF header: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
