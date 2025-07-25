import crc16modbus from "@/lib/crc";
import { ModeOfOperation } from "aes-js";

export const QYSC_AES_KEY = new Uint8Array([87, 177, 249, 171, 205, 90, 232, 167, 156, 185, 140, 231, 87, 140, 81, 8]);
export const QYSC_MAGIC_BYTE = 0xfe;

const crypter = new ModeOfOperation.ecb(QYSC_AES_KEY);

export function getPacket(message: Uint8Array) {
  // packetLength = magic (1) + len (1) + message (n) + checksum (2)
  const packetLength = 1 + 1 + message.length + 2;
  const padding = 16 - (packetLength % 16);

  const packet = new Uint8Array(packetLength + padding);
  packet.set([QYSC_MAGIC_BYTE, packetLength], 0);
  packet.set(message, 2);
  const checksum = crc16modbus(packet.slice(0, packetLength - 2));
  packet.set([checksum & 0xff, (checksum >> 8) & 0xff], packetLength - 2);

  return crypter.encrypt(packet);
}

export function helloPacket(mac: Uint8Array) {
  const message = new Uint8Array(11 + mac.length);
  message.set(mac.reverse(), 11);
  return getPacket(message);
}

export function ackPacket(originalMessage: Uint8Array) {
  const ackPart = originalMessage.slice(2, 7);
  return getPacket(ackPart);
}

export function syncPacket(state: Uint8Array) {
  const message = new Uint8Array(state.length + 7);
  message.set([0x04, 0x17, 0x88, 0x8b, 0x31d]);
  message.set(state, 5);
  message.set([0x00, 0x00], state.length + 5);
  return getPacket(message);
}

export function freshStatePacket() {
  const message = new Uint8Array([5, 5, 5, 5, 5]);
  return getPacket(message);
}

export enum CubeOperations {
  CubeHello = 0x2,
  CubeState = 0x3,
  CubeSync = 0x4,
  CubeFreshState = 0x5,
}

const defaultHandler = (packet: Uint8Array) => ({
  raw: packet,
  length: packet[1],
  opcode: packet[2] as CubeOperations,
  timestamp: ((packet[3] << 24) | (packet[4] << 16) | (packet[5] << 8) | packet[6]),
  battery: packet[35],
  wholeData: packet.slice(7, packet.length - 2),
});

const opHandlers = {
  [CubeOperations.CubeHello]: (packet: Uint8Array) => {
    const data = defaultHandler(packet);
    return {
      ...data,
      needsAck: true,
      initialState: packet.slice(7, 34),
      battery: packet[35],
    }
  },
  [CubeOperations.CubeState]: (packet: Uint8Array) => {
    const data = defaultHandler(packet);
    return {
      ...data,
      needsAck: packet[91] === 1,
      cubeState: packet.slice(7, 34),
      move: packet[34],
      battery: packet[35],
      previousMoves: packet.slice(36, 91),
    }
  },
  [CubeOperations.CubeSync]: (packet: Uint8Array) => {
    const data = defaultHandler(packet);
    return {
      ...data,
      needsAck: false,
      cubeState: packet.slice(7, 34),
      battery: packet[35],
    }
  },
  [CubeOperations.CubeFreshState]: (packet: Uint8Array) => {
    const data = defaultHandler(packet);
    return {
      ...data,
      needsAck: false,
      cubeState: packet.slice(7, 34),
      battery: packet[35],
    }
  }
} as const;

export type CubeHelloData = ReturnType<typeof opHandlers[CubeOperations.CubeHello]>;
export type CubeStateData = ReturnType<typeof opHandlers[CubeOperations.CubeState]>;
export type CubeSyncData = ReturnType<typeof opHandlers[CubeOperations.CubeSync]>;
export type CubeFreshStateData = ReturnType<typeof opHandlers[CubeOperations.CubeFreshState]>;
export type CubeData = CubeHelloData | CubeStateData | CubeSyncData | CubeFreshStateData;

export function decodePacket(encryptedPkt: Uint8Array): CubeData {
  const packet = crypter.decrypt(encryptedPkt);

  if (packet[0] !== QYSC_MAGIC_BYTE) {
    throw new Error("Invalid magic byte");
  }

  const opcode = packet[2] as CubeOperations;

  if (!opHandlers[opcode]) {
    console.error('unknown opcode', opcode);
    console.log(packet);
  }

  return (opHandlers[opcode] ?? defaultHandler)(packet);
}
