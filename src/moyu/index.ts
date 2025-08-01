import { GattOperationQueue } from "@/lib/gatt-queue";
import { MOYU_READ_CHARACTERISTIC, MOYU_SERVICE, MOYU_WRITE_CHARACTERISTIC } from "./constants";
import { createProtocol } from "./protocol";
import { SmartCubeDefinition } from "../smart-cube";
import createProcessor from "./processor";
import { CubeInfoEvent, CubeMoveEvent, CubeStateEvent } from "@/events";
import { Subject } from "rxjs";

const NAME_PREFIXES = [
  'WCU_MY',
  'AiCube',
]

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
  const cubeInfoEvents = new Subject<CubeInfoEvent>();

  const processor = await createProcessor(cubeStateEvents, cubeMoveEvents, cubeInfoEvents);

  readCharacteristic.addEventListener(
    "characteristicvaluechanged",
    async function (this: BluetoothRemoteGATTCharacteristic) {
      if (!this.value?.buffer) return;
      const packet = new Uint8Array(this.value.buffer);
      const data = protocol.handlePacket(packet);
      processor.processPacket(data);
    }
  );

  operationQueue.enqueue(() => readCharacteristic.startNotifications());

  operationQueue.enqueue(() => writeCharacteristic.writeValue(protocol.getCubeInfoPacket()));
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
    }
  }
}

export const MOYU = {
  initCube,
  getMacAddress: async (_: BluetoothDevice) => null,
  names: NAME_PREFIXES,
  services: SERVICES,
  characteristics: CHARACTERISTICS,
} satisfies SmartCubeDefinition
