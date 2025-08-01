import { type BitstreamWriter } from "@astronautlabs/bitstream";

export function createUint8ArrayStream(targetBuffer: Uint8Array) {
  let offset = 0;

  return {
    write(chunk: Uint8Array) {
      if (chunk instanceof ArrayBuffer) {
        chunk = new Uint8Array(chunk);
      } else if (ArrayBuffer.isView(chunk)) {
        chunk = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      } else {
        throw new TypeError('Chunk must be ArrayBuffer or TypedArray');
      }

      if (offset + chunk.byteLength > targetBuffer.byteLength) {
        throw new Error('Buffer overflow: not enough space in target Uint8Array');
      }

      targetBuffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
  } satisfies ConstructorParameters<typeof BitstreamWriter>[0];
}
