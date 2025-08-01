import { createUint8ArrayStream } from '@/lib/stream';
import { BitstreamReader, BitstreamWriter } from '@astronautlabs/bitstream';
import { KPattern } from 'cubing/kpuzzle';
import { createCrypter } from './crypter';
import { IV, KEY, MoyuOps } from './constants';

function padTo20Bytes(packet: Uint8Array): Uint8Array {
  if (packet.length >= 20) {
    return packet;
  }
  
  const padded = new Uint8Array(20);
  padded.set(packet);
  for (let i = packet.length; i < 20; i++) padded[i] = 0;
  return padded;
}

function createEncryptedPacket(packet: Uint8Array, crypter: any): Uint8Array {
  const padded = padTo20Bytes(packet);
  const encrypted = new Uint8Array(padded);
  crypter.encrypt(encrypted);
  return encrypted;
}

function readPlainSignedSync(streamRdr: BitstreamReader, bitLength: number) {
  const sign = streamRdr.readSync(1) === 1 ? -1 : 1;
  const value = streamRdr.readSync(bitLength - 1);
  return sign * value;
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
      name: reader.readStringSync(6),
      hardwareVersion: reader.readSync(8) + "." + reader.readSync(8),
      softwareVersion: reader.readSync(8) + "." + reader.readSync(8),
      isOutage: reader.readSync(1) === 1,
      isGyroEnabled: reader.readSync(1) === 1,
      isGyroCorrect: reader.readSync(1) === 1,
      isMagneticSensorWorking: reader.readSync(1) === 1,
      isMagneticSensorCalibrated: reader.readSync(1) === 1,
    }
  },
  [MoyuOps.CubeReset]: (reader: BitstreamReader) => {
    // TODO: No known data, check packet size and see whats up
    return {
      opCode: reader.readSync(8),
    }
  },
  [MoyuOps.CubeStatus]: (reader: BitstreamReader) => {
    return {
      opCode: reader.readSync(8),
      batt: reader.readSync(8),
      battStart: reader.readSync(8),
      step: reader.readSync(8),
      EP: Array.from({ length: 12 }, () => reader.readSync(4)),
      EO: Array.from({ length: 12 }, () => reader.readSync(1)),
      CO: Array.from({ length: 8 }, () => reader.readSync(2)),
      CP: Array.from({ length: 8 }, () => reader.readSync(8)),
      isCalibration: reader.readSync(1) === 1,
      CFN: reader.readSync(5),
      angle: reader.readSync(9),
      relAngle: reader.readSync(9),
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
      expressionIntervalubes: Array.from({ length: 6 }, () => reader.readSync(16)),
      step: reader.readSync(8),
      expressionIds: Array.from({ length: 6 }, () => reader.readSync(5)),
    }
  },
  [MoyuOps.CubeMoveGyro]: (reader: BitstreamReader) => {
    return {
      opCode: reader.readSync(8),
      expressionIntervalubes: Array.from({ length: 6 }, () => reader.readSync(16)),
      step: reader.readSync(8),
      expressionIds: Array.from({ length: 6 }, () => reader.readSync(5)),
      angle: reader.readSync(9),
      relativeAngle: reader.readSync(9),
    }
  },
  [MoyuOps.CubeMoveExtend]: (reader: BitstreamReader) => {
    // TODO: check packet size to finish this off, not sure if ever used...
    return {
      opCode: reader.readSync(8),
      expressionIntervalubes: Array.from({ length: 5 }, () => reader.readSync(16)),
      step: reader.readSync(8),
      expressionIds: Array.from({ length: 5 }, () => reader.readSync(5)),
      timeintervallist: null,
    }
  },
  [MoyuOps.CubeMoveHistory]: (reader: BitstreamReader) => {
    const opCode = reader.readSync(8);
    const count = reader.readSync(8);
    return {
      opCode,
      count,
      step: reader.readSync(8),
      expressionIntervalubes: Array.from({ length: count }, () => reader.readSync(5)),
    }
  },
  [MoyuOps.CubeMoveTime]: (reader: BitstreamReader) => {
    const opCode = reader.readSync(8);
    const count = reader.readSync(8);
    return {
      opCode,
      count,
      step: reader.readSync(8),
      expressionIntervalubes: Array.from({ length: count }, () => reader.readSync(16)),
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
    // TODO: There is an extra short in the protocol?
    return {
      opCode: reader.readSync(8),
      angularVelocity1: Array.from({ length: 3 }, () => readPlainSignedSync(reader, 4)),
      angularVelocity2: Array.from({ length: 3 }, () => readPlainSignedSync(reader, 4)),
      rawQuaternion1: Array.from({ length: 4 }, () => readPlainSignedSync(reader, 16)),
      rawQuaternion2: Array.from({ length: 4 }, () => readPlainSignedSync(reader, 16)),
    }
  }
}

function defaultHandler(reader: BitstreamReader) {
  return {
    opCode: reader.readSync(8),
  }
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
    getCubeResetPacket: (pattern: KPattern) => {
      const buffer = new Uint8Array(14);
      const writer = new BitstreamWriter(createUint8ArrayStream(buffer));

      writer.write(8, MoyuOps.CubeReset);
      const data = pattern.patternData;

      data['EDGES'].pieces.forEach(p => writer.write(4, p));
      data['EDGES'].orientation.forEach(p => writer.write(1, p));
      data['CORNERS'].orientation.forEach(p => writer.write(2, p));
      data['CORNERS'].pieces.forEach(p => writer.write(3, p));
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
    getCubeMoveHistoryPacket: (count: number, step: number) => {
      const packet = new Uint8Array([MoyuOps.CubeMoveHistory, count, step]);
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
    }
  };
}