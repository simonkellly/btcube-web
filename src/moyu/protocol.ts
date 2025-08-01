import { createUint8ArrayStream } from '@/lib/stream';
import { BitstreamReader, BitstreamWriter } from '@astronautlabs/bitstream';
import { createCrypter } from './crypter';
import { IV, KEY, MoyuOps } from './constants';

function readComplexSignedSync(streamRdr: BitstreamReader, bitLength: number) {
  const sign = streamRdr.readSync(1) === 1 ? -1 : 1;
  const value = streamRdr.readSync(bitLength - 1);

  if (bitLength % 8 !== 0) return 0;

  let tValue = 0;
  for (let l = 0; l < bitLength / 8; l++) {
    const mesh = 255 << (l * 8);
    const t = (value & mesh) >> (l * 8);
    tValue = (tValue << 8) + t;
  }
  return sign * tValue;
}

const handlers = {
  [MoyuOps.CubeDisconnect]: (reader: BitstreamReader) => {
    return {
      opCode: reader.readSync(8),
    }
  },
  [MoyuOps.CubeInfo]: (reader: BitstreamReader) => {
    return {
      opCode: reader.readSync(8),
      name: reader.readStringSync(8),
      hardwareVersion: reader.readSync(8) + "." + reader.readSync(8),
      softwareVersion: reader.readSync(8) + "." + reader.readSync(8),
      isOutage: reader.readSync(1) === 1,
      isGyroEnabled: reader.readSync(1) === 1,
      isGyroCorrect: reader.readSync(1) === 1,
      isMagneticSensorWorking: reader.readSync(1) === 1,
      isMagneticSensorCalibrated: reader.readSync(1) === 1,
      step: reader.readSync(8),
      formula: reader.readSync(5),
      angle: reader.readSync(9),
      relativeAngle: reader.readSync(9),
    }
  },
  [MoyuOps.CubeReset]: (reader: BitstreamReader) => {
    // TODO: Likely just opcode/state (48*3)
    return {
      opCode: reader.readSync(8),
    }
  },
  [MoyuOps.CubeStatus]: (reader: BitstreamReader) => {
    return {
      opCode: reader.readSync(8),
      state: Array.from({ length: 48 }, () => reader.readSync(3)),
      step: reader.readSync(8),
    }
  },
  [MoyuOps.CubePower]: (reader: BitstreamReader) => {
    return {
      opCode: reader.readSync(8),
      batt: reader.readSync(8),
      battStart: reader.readSync(8),
    }
  },
  [MoyuOps.CubeMove]: (reader: BitstreamReader) => {
    return {
      opCode: reader.readSync(8),
      expressionIntervalubes: Array.from({ length: 5 }, () => reader.readSync(16)),
      step: reader.readSync(8),
      expressionIds: Array.from({ length: 5 }, () => reader.readSync(5)),
      adjacentChange: reader.readSync(6),
      angle: reader.readSync(9),
      relativeAngle: reader.readSync(9),
    }
  },
  [MoyuOps.CubeMoveHistory]: (reader: BitstreamReader) => {
    return {
      opCode: reader.readSync(8),
      expressionIntervalubes: Array.from({ length: 6 }, () => reader.readSync(16)),
      step: reader.readSync(8),
      expressionIds: Array.from({ length: 6 }, () => reader.readSync(5)),
    }
  },
  [MoyuOps.CubeBindAccount]: (reader: BitstreamReader) => {
    return {
      opCode: reader.readSync(8),
      accountId: reader.readSync(32),
    }
  },
  [MoyuOps.CubeGyroUpdate]: (reader: BitstreamReader) => {
    // TODO: Make sure quaternions used in correct order as not linear
    return {
      opCode: reader.readSync(8),
      rawQuaternion: Array.from({ length: 4 }, () => readComplexSignedSync(reader, 32)),
    }
  },
  [MoyuOps.CubeGyroOperation]: (reader: BitstreamReader) => {
    return {
      opCode: reader.readSync(8),
      correctioned: reader.readSync(8) === 1,
      isOpen: reader.readSync(8) === 1,
    }
  },
  [MoyuOps.CubeChangeName]: (reader: BitstreamReader) => {
    // TODO: Analyse this packet more, as protocol doesnt make sense
    return {
      opCode: reader.readSync(8),
    }
  },
  [MoyuOps.CubeSolving]: (reader: BitstreamReader) => {
    return {
      opCode: reader.readSync(8),
      state: Array.from({ length: 48 }, () => reader.readSync(3)),
      flag: reader.readSync(1) === 1,
    }
  },
} as const

export type MoyuData = ReturnType<typeof handlers[keyof typeof handlers]>;
export type MoyuStatusData = ReturnType<typeof handlers[MoyuOps.CubeStatus]>;
export type MoyuMoveData = ReturnType<typeof handlers[MoyuOps.CubeMove]>;
export type MoyuInfoData = ReturnType<typeof handlers[MoyuOps.CubeInfo]>;
export type MoyuPowerData = ReturnType<typeof handlers[MoyuOps.CubePower]>;

function defaultHandler(reader: BitstreamReader) {
  return {
    opCode: reader.readSync(8),
  }
}

// Helper function to pad packet to 20 bytes
function padTo20Bytes(packet: Uint8Array): Uint8Array {
  if (packet.length >= 20) {
    return packet;
  }
  
  const padded = new Uint8Array(20);
  padded.set(packet);
  // Fill remaining bytes with zeros
  for (let i = packet.length; i < 20; i++) {
    padded[i] = 0;
  }
  return padded;
}

// Helper function to create and encrypt a packet
function createEncryptedPacket(packet: Uint8Array, crypter: any): Uint8Array {
  const padded = padTo20Bytes(packet);
  const encrypted = new Uint8Array(padded);
  crypter.encrypt(encrypted);
  return encrypted;
}

export function createProtocol(mac: string) {
  const reader = new BitstreamReader();

  const crypter = createCrypter();
  crypter.reset(KEY, IV, mac.split(':').map(b => parseInt(b, 16)));

  return {
    handlePacket: (packet: Uint8Array) => {
      const decrypted = new Uint8Array(packet);
      crypter.decrypt(decrypted);
      reader.reset();
      reader.addBuffer(decrypted);
      
      const opCode = decrypted[0];
      const handler = handlers[opCode as keyof typeof handlers] ?? defaultHandler;
  
      if (!handler) {
        console.log(packet);
        console.log(decrypted);
        throw new Error(`[Moyu4] Unknown OP: ${opCode}`);
      }

      return handler(reader);
    },
    getCubeInfoPacket: () => {
      const packet = new Uint8Array([MoyuOps.CubeInfo]);
      return createEncryptedPacket(packet, crypter);
    },
    getCubeResetPacket: (facelets: number[]) => {
      const buffer = new Uint8Array(19);
      const writer = new BitstreamWriter(createUint8ArrayStream(buffer));

      writer.write(8, MoyuOps.CubeReset);
      facelets.forEach(p => writer.write(3, p));
      writer.end();

      return createEncryptedPacket(buffer, crypter);
    },
    getCubeStatusPacket: () => {
      const packet = new Uint8Array([MoyuOps.CubeStatus]);
      return createEncryptedPacket(packet, crypter);
    },
    getCubePowerPacket: () => {
      const packet = new Uint8Array([MoyuOps.CubePower]);
      return createEncryptedPacket(packet, crypter);
    },
    getCubeMoveHistoryPacket: (step: number) => {
      const packet = new Uint8Array([MoyuOps.CubeMoveHistory, step]);
      return createEncryptedPacket(packet, crypter);
    },
    getCubeMoveTimePacket: (count: number, step: number) => {
      const packet = new Uint8Array([MoyuOps.CubeMoveTime, count, step]);
      return createEncryptedPacket(packet, crypter);
    },
    getCubeBindAccountPacket: (accountId: number) => {
      const buffer = new Uint8Array(40);
      const writer = new BitstreamWriter(createUint8ArrayStream(buffer));

      writer.write(8, MoyuOps.CubeBindAccount);
      writer.write(32, accountId);
      writer.end();

      return createEncryptedPacket(buffer, crypter);
    },
    getCubeGyroOperationPacket: (isResetCorrection: boolean, isOpen: boolean) => {
      const packet = new Uint8Array([MoyuOps.CubeGyroOperation, isResetCorrection ? 1 : 0, isOpen ? 1 : 0]);
      return createEncryptedPacket(packet, crypter);
    },
    getCubeChangeNamePacket: (name: string) => {
      const packet = new Uint8Array([MoyuOps.CubeChangeName, ...new TextEncoder().encode(name)]);
      return createEncryptedPacket(packet, crypter);
    },
    getCubeSolvingPacket: (length: number, batch: number, formula: number[]) => {
      const packetLength = Math.ceil((8 + 8 + 4 + formula.length * 8) / 8);
      const buffer = new Uint8Array(packetLength);
      const writer = new BitstreamWriter(createUint8ArrayStream(buffer));

      writer.write(8, MoyuOps.CubeSolving);
      writer.write(8, length);
      writer.write(4, batch);
      formula.forEach(p => writer.write(8, p));
      writer.end();

      return createEncryptedPacket(buffer, crypter);
    }
  };
}