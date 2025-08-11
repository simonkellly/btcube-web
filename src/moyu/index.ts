import { GattOperationQueue } from "@/lib/gatt-queue";
import { MOYU_READ_CHARACTERISTIC, MOYU_SERVICE, MOYU_WRITE_CHARACTERISTIC } from "./constants";
import { createProtocol } from "./protocol";
import { SmartCubeDefinition } from "../smart-cube";
import createProcessor from "./processor";
import { CubeInfoEvent, CubeMoveEvent, CubeStateEvent } from "@/events";
import { ReplaySubject, Subject } from "rxjs";

const NAME_PREFIXES = [
  'WCU_MY32',
];

const SERVICES = [
  MOYU_SERVICE,
]

const CHARACTERISTICS = [
  MOYU_READ_CHARACTERISTIC,
  MOYU_WRITE_CHARACTERISTIC,
]

async function initCube(device: BluetoothDevice, macAddress: string) {
  // OG code resets the cube gyro here
  const server = await device.gatt?.connect();
  if (!server) throw new Error('Failed to connect to device');


  const operationQueue = new GattOperationQueue();

  const service = await server.getPrimaryService(MOYU_SERVICE);
  const readCharacteristic = await service.getCharacteristic(MOYU_READ_CHARACTERISTIC);
  const writeCharacteristic = await service.getCharacteristic(MOYU_WRITE_CHARACTERISTIC);

  const protocol = createProtocol(macAddress);

  const cubeStateEvents = new Subject<CubeStateEvent>();
  const cubeMoveEvents = new Subject<CubeMoveEvent>();
  const cubeInfoEvents = new ReplaySubject<CubeInfoEvent>(5);

  const processor = await createProcessor(cubeStateEvents, cubeMoveEvents, cubeInfoEvents);

  let actualMac = macAddress.length === 17 ? macAddress : null;

  readCharacteristic.addEventListener(
    "characteristicvaluechanged",
    async function (this: BluetoothRemoteGATTCharacteristic) {
      if (!this.value?.buffer) return;
      const packet = new Uint8Array(this.value.buffer);

      if (actualMac === null) {
        const mac = protocol.checkMac(macAddress, packet);
        if (mac) {
          actualMac = mac;
        }
      }

      const data = protocol.handlePacket(packet);
      processor.processPacket(data);
    }
  );

  await operationQueue.enqueue(() => readCharacteristic.startNotifications());

  if (actualMac === null) {
    const packets = protocol.getCubeInfoPacketCheckMac(macAddress);
    await operationQueue.enqueue(() => writeCharacteristic.writeValue(packets[0]));
    await operationQueue.enqueue(() => writeCharacteristic.writeValue(packets[1]));
  } else {
    await operationQueue.enqueue(() => writeCharacteristic.writeValue(protocol.getCubeInfoPacket()));
  }

  while (actualMac === null) {
    await new Promise(resolve => setTimeout(resolve, 15));
  }

  operationQueue.enqueue(() => writeCharacteristic.writeValue(protocol.getCubeStatusPacket()));
  operationQueue.enqueue(() => writeCharacteristic.writeValue(protocol.getCubePowerPacket()));
  operationQueue.enqueue(() => writeCharacteristic.writeValue(protocol.getCubeGyroOperationPacket(false, false)));

  return {  
    device,
    events: {
      state: cubeStateEvents,
      moves: cubeMoveEvents,
      info: cubeInfoEvents,
    },
    commands: {
      sync: async () => {
        await operationQueue.enqueue(() => writeCharacteristic.writeValue(
          protocol.getCubeResetPacket([
            ...Array.from({ length: 8 }, () => 0),
            ...Array.from({ length: 8 }, () => 1),
            ...Array.from({ length: 8 }, () => 2),
            ...Array.from({ length: 8 }, () => 3),
            ...Array.from({ length: 8 }, () => 4),
            ...Array.from({ length: 8 }, () => 5),
          ])
        ));
      },
      disconnect: async () => {
        device.gatt?.disconnect();
      },
      freshState: async () => {
        await operationQueue.enqueue(() => writeCharacteristic.writeValue(protocol.getCubeStatusPacket()));
      }
    }
  }
}

async function getMacAddress(device: BluetoothDevice) {
  const name = device.name;
  if (!name) return null;

  const match = name.match(/^WCU_MY32_([0-9A-Fa-f]{4})$/);
  if (!match) return null;

  return `${match[1].slice(0, 2)}:${match[1].slice(2, 4)}`;
}

export const MOYU = {
  initCube,
  getMacAddress: getMacAddress,
  names: NAME_PREFIXES,
  services: SERVICES,
  characteristics: CHARACTERISTICS,
} satisfies SmartCubeDefinition
