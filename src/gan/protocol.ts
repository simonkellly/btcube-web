import { ModeOfOperation } from "aes-js";
import { GAN_ENCRYPTION_KEYS, GAN_MAGIC_BYTE } from "./constants";

export enum CubeOperations {
  CubeMove = 0x01,
  CubeState = 0x02,
  CubeMoveHistory = 0x06,
  CubeHardware = 0x07,
  CubeBattery = 0x10,
  CubeDisconnect = 0x11
}

const defaultHandler = (packet: Uint8Array) => ({
  raw: packet,
  opcode: packet[1] as CubeOperations,
  length: packet[2],
});

const opHandlers = {
  [CubeOperations.CubeMove]: (packet: Uint8Array) => {
    const data = defaultHandler(packet);
    const timestamp = ((packet[3] << 24) | (packet[4] << 16) | (packet[5] << 8) | packet[6]);
    const serial = (packet[7] << 8) | packet[8];
    const move = packet[9];
    return {
      ...data,
      timestamp,
      serial,
      move,
    }
  },
  [CubeOperations.CubeState]: (packet: Uint8Array) => {
    const data = defaultHandler(packet);
    const serial = (packet[3] << 8) | packet[4];

    const cp = Array.from({ length: 7 }, (_, i) => readBitsFromBuffer(packet, 40 + (i * 3), 3));
    const co = Array.from({ length: 7 }, (_, i) => readBitsFromBuffer(packet, 61 + (i * 2), 2));

    cp.push(28 - cp.reduce((prev, curr) => prev + curr, 0));
    co.push((3 - (co.reduce((prev, curr) => prev + curr, 0) % 3)) % 3);

    const ep = Array.from({ length: 11 }, (_, i) => readBitsFromBuffer(packet, 77 + (i * 4), 4));
    const eo = Array.from({ length: 11 }, (_, i) => readBitsFromBuffer(packet, 121 + (i * 1), 1));

    ep.push(66 - ep.reduce((prev, curr) => prev + curr, 0));
    eo.push((2 - (eo.reduce((prev, curr) => prev + curr, 0) % 2)) % 2);

    return {
      ...data,
      serial,
      pattern: {
        edges: {
          pieces: ep,
          orientation: eo,
        },
        corners: {
          pieces: cp,
          orientation: co,
        },
      },
    };
  },
  [CubeOperations.CubeMoveHistory]: (packet: Uint8Array) => {
    const data = defaultHandler(packet);
    // @ts-ignore
    const serial = packet[3];
    const moveSetCount = (data.length - 1);
    
    for (let i = 0; i < moveSetCount; i++) {
      const set = packet[4 + i];

      // from set we want: using bitwise operations
      // f1: 3 bits
      // d1: 1 bit
      // f2: 3 bits
      // d2: 1 bit

      const f1 = (set >> 5) & 0x7;
      const d1 = (set >> 4) & 0x1;
      const f2 = (set >> 1) & 0x7;
      const d2 = (set >> 0) & 0x1;
      
      const face1 = "URFDLB"[[1, 5, 3, 0, 4, 2].indexOf(f1)];
      const move1 = face1 + (d1 === 1 ? "'" : "");
      const face2 = "URFDLB"[[1, 5, 3, 0, 4, 2].indexOf(f2)];
      const move2 = face2 + (d2 === 1 ? "'" : "");
      
      console.log(`move ${i}:`, move1, move2);
    }

  },
  [CubeOperations.CubeHardware]: (packet: Uint8Array) => {
    const data = defaultHandler(packet);
    
    return {
      ...data,
    }
  },
  [CubeOperations.CubeBattery]: (packet: Uint8Array) => defaultHandler(packet),
  [CubeOperations.CubeDisconnect]: (packet: Uint8Array) => defaultHandler(packet),
} as const;

export function readBitsFromBuffer(buffer: Uint8Array, startBitPos: number, numBits: number): number {
  let value = 0;
  
  for (let bit = 0; bit < numBits; bit++) {
    const currentBitPos = startBitPos + bit;
    const byteIndex = Math.floor(currentBitPos / 8);
    const bitOffset = currentBitPos % 8;
    
    if (byteIndex < buffer.length) {
      const bitValue = (buffer[byteIndex] >> (7 - bitOffset)) & 1;
      value |= (bitValue << (numBits - 1 - bit));
    }
  }
  
  return value;
}

export type CubeMoveData = ReturnType<typeof opHandlers[CubeOperations.CubeMove]>;
export type CubeStateData = ReturnType<typeof opHandlers[CubeOperations.CubeState]>;
export type CubeMoveHistoryData = ReturnType<typeof opHandlers[CubeOperations.CubeMoveHistory]>;
export type CubeHardwareData = ReturnType<typeof opHandlers[CubeOperations.CubeHardware]>;
export type CubeBatteryData = ReturnType<typeof opHandlers[CubeOperations.CubeBattery]>;
export type CubeDisconnectData = ReturnType<typeof opHandlers[CubeOperations.CubeDisconnect]>;

export type CubeData = CubeMoveData | CubeStateData | CubeMoveHistoryData | CubeHardwareData | CubeBatteryData | CubeDisconnectData;

export function createCrypter(device: BluetoothDevice, macAddress: Uint8Array) {
  const salt = new Uint8Array(macAddress).reverse();

  const encryptionKey = GAN_ENCRYPTION_KEYS[device.name?.startsWith('AiCube') ? 1 : 0];

  const key = new Uint8Array(encryptionKey.key);
  const iv = new Uint8Array(encryptionKey.iv);

  for (let i = 0; i < 6; i++) {
    key[i] = (key[i] + salt[i]) % 0xFF;
    iv[i] = (iv[i] + salt[i]) % 0xFF;
  }

  const decryptChunk = (buffer: Uint8Array, offset: number) => {
    const cipher = new ModeOfOperation.cbc(key, iv);
    const chunk = cipher.decrypt(buffer.subarray(offset, offset + 16));
    buffer.set(chunk, offset);
  }

  const decodePacket = (encryptedPkt: Uint8Array): CubeData => {
    if (encryptedPkt.length < 16) throw Error('Data must be at least 16 bytes long');

    const packet = new Uint8Array(encryptedPkt);
    if (packet.length > 16) decryptChunk(packet, packet.length - 16);
    decryptChunk(packet, 0);
    
    if (packet[0] !== GAN_MAGIC_BYTE) throw Error('Invalid magic byte');

    const opcode = packet[1] as CubeOperations;

    if (!opHandlers[opcode]) {
      console.error('unknown opcode', opcode);
      console.log(packet);
    }

    console.log(Array.from(packet).map(b => b.toString(16).padStart(2, '0')).join(' '));

    return opHandlers[opcode](packet);
  }

  return {
    decodePacket,
  }
}


