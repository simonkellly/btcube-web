import { readBitsFromBuffer } from "@/gan/protocol";
import { expect, test, describe } from "bun:test";

describe("readBitsFromBuffer", () => {
  test("reads single bit from start of byte", () => {
    const buffer = new Uint8Array([0b10000000]); // 128
    const result = readBitsFromBuffer(buffer, 0, 1);
    expect(result).toBe(1);
  });

  test("reads single bit from middle of byte", () => {
    const buffer = new Uint8Array([0b00100000]); // 32
    const result = readBitsFromBuffer(buffer, 2, 1);
    expect(result).toBe(1);
  });

  test("reads single bit from end of byte", () => {
    const buffer = new Uint8Array([0b00000001]); // 1
    const result = readBitsFromBuffer(buffer, 7, 1);
    expect(result).toBe(1);
  });

  test("reads multiple bits within single byte", () => {
    const buffer = new Uint8Array([0b11010000]); // 208
    const result = readBitsFromBuffer(buffer, 0, 3);
    expect(result).toBe(0b110); // 6
  });

  test("reads 3 bits starting at different positions", () => {
    const buffer = new Uint8Array([0b11010100]); // 212
    
    // Read bits 0-2: 110 = 6
    expect(readBitsFromBuffer(buffer, 0, 3)).toBe(6);
    
    // Read bits 2-4: 010 = 2
    expect(readBitsFromBuffer(buffer, 2, 3)).toBe(2);
    
    // Read bits 4-6: 010 = 2
    expect(readBitsFromBuffer(buffer, 4, 3)).toBe(2);
  });

  test("reads bits across byte boundary", () => {
    const buffer = new Uint8Array([0b00000011, 0b11000000]); // [3, 192]
    // Last 2 bits of first byte + first 2 bits of second byte = 1111 = 15
    const result = readBitsFromBuffer(buffer, 6, 4);
    expect(result).toBe(15);
  });

  test("reads bits spanning three bytes", () => {
    const buffer = new Uint8Array([0b00000001, 0b11111111, 0b10000000]); // [1, 255, 128]
    // Last bit of first + all of second + first bit of third = 111111111 = 511
    const result = readBitsFromBuffer(buffer, 7, 9);
    expect(result).toBe(511);
  });

  test("reads zero bits returns zero", () => {
    const buffer = new Uint8Array([0b11111111]);
    const result = readBitsFromBuffer(buffer, 0, 0);
    expect(result).toBe(0);
  });

  test("reads full byte", () => {
    const buffer = new Uint8Array([0b10110101]); // 181
    const result = readBitsFromBuffer(buffer, 0, 8);
    expect(result).toBe(181);
  });

  test("reads beyond buffer length returns partial result", () => {
    const buffer = new Uint8Array([0b11110000]); // 240
    // Try to read 4 bits starting at bit 6 (only 2 bits available)
    const result = readBitsFromBuffer(buffer, 6, 4);
    expect(result).toBe(0b0000); // Only gets the 2 available bits: 00, padded with zeros
  });

  test("reads completely beyond buffer returns zero", () => {
    const buffer = new Uint8Array([0b11111111]);
    const result = readBitsFromBuffer(buffer, 8, 4);
    expect(result).toBe(0);
  });

  test("real-world example: extracting uint3 values", () => {
    // Create a buffer with known bit pattern
    const buffer = new Uint8Array(12);
    
    // Set up a pattern where we can extract known 3-bit values
    // At bit position 61, we'll have the pattern: 101 011 111 000 110 001 010 100
    // Which should give us: [5, 3, 7, 0, 6, 1, 2, 4]
    
    // Bit 61 is in byte 7, bit 5
    // 101011111000110001010100 = 24 bits starting at bit 61
    const bitPattern = 0b101011111000110001010100;
    
    // Write the pattern starting at byte 7, bit 5
    for (let i = 0; i < 24; i++) {
      const bitPos = 61 + i;
      const byteIndex = Math.floor(bitPos / 8);
      const bitOffset = bitPos % 8;
      const bitValue = (bitPattern >> (23 - i)) & 1;
      
      if (byteIndex < buffer.length) {
        if (bitValue) {
          buffer[byteIndex] |= (1 << (7 - bitOffset));
        }
      }
    }
    
    // Extract 8 uint3 values starting at bit 61
    const results = [];
    for (let i = 0; i < 8; i++) {
      const bitPos = 61 + (i * 3);
      const value = readBitsFromBuffer(buffer, bitPos, 3);
      results.push(value);
    }
    
    expect(results).toEqual([5, 3, 7, 0, 6, 1, 2, 4]);
  });

  test("edge case: empty buffer", () => {
    const buffer = new Uint8Array([]);
    const result = readBitsFromBuffer(buffer, 0, 1);
    expect(result).toBe(0);
  });
});