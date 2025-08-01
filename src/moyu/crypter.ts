import { ModeOfOperation } from 'aes-js';

export interface MoyuCrypter {
  reset: (key: Uint8Array, ivKey: Uint8Array, salt: number[]) => void;
  setKey: (key: Uint8Array, ivKey: Uint8Array) => void;
  setSalt: (salt?: number[]) => void;
  encrypt: (rawBytes: Uint8Array) => void;
  decrypt: (cipherBytes: Uint8Array) => void;
}

export function createCrypter() {
  let rawKey: Uint8Array | null = null;
  let rawIvKey: Uint8Array | null = null;
  let key: Uint8Array = new Uint8Array(16);
  let ivKey: Uint8Array = new Uint8Array(16);
  let salt: number[] | null = null;

  function updateKey(): void {
    if (rawKey === null || rawIvKey === null) return;

    key = new Uint8Array(rawKey);
    ivKey = new Uint8Array(rawIvKey);
    
    if (salt !== null) {
      for (let i = 0; i < 6; i++) {
        const saltValue = salt[5 - i];
        key[i] = (key[i] + saltValue) % 255;
        ivKey[i] = (ivKey[i] + saltValue) % 255;
      }
    }
  }

  function processBlock(data: Uint8Array, offset: number, encrypt: boolean): void {
    const block = data.slice(offset, offset + 16);
    const cipher = new ModeOfOperation.cbc(key, ivKey);
    const processed = encrypt ? cipher.encrypt(block) : cipher.decrypt(block);
    data.set(processed, offset);
  }

  function encrypt(data: Uint8Array): Uint8Array {
    processBlock(data, 0, true);
    
    if (data.length > 16) {
      const offset = data.length - 16;
      processBlock(data, offset, true);
    }
    
    return data;
  }

  function decrypt(data: Uint8Array): Uint8Array {
    if (data.length > 16) {
      const offset = data.length - 16;
      processBlock(data, offset, false);
    }
    
    processBlock(data, 0, false);
    
    return data;
  }

  return {
    reset(key: Uint8Array, ivKey: Uint8Array, newSalt: number[]): void {
      salt = newSalt;
      this.setKey(key, ivKey);
    },

    setKey(key: Uint8Array, ivKey: Uint8Array): void {
      rawKey = key;
      rawIvKey = ivKey;
      updateKey();
    },

    setSalt(newSalt?: number[]): void {
      salt = newSalt ?? null;
      updateKey();
    },

    encrypt(rawBytes: Uint8Array): void {
      const result = encrypt(rawBytes);
      rawBytes.set(result);
    },

    decrypt(cipherBytes: Uint8Array): void {
      if (cipherBytes === null) return;
      const result = decrypt(cipherBytes);
      cipherBytes.set(result);
    }
  } satisfies MoyuCrypter;
}
