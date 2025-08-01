import { GattOperationQueue } from "@/lib/gatt-queue";
import { SmartCube, SmartCubeDefinition } from "../smart-cube";
import { ackPacket, decodePacket, freshStatePacket, helloPacket, syncPacket } from "./protocol";
import { Subject } from "rxjs";
import { CubeInfoEvent, CubeMoveEvent, CubeStateEvent } from "@/events";
import createProcessor from "./processor";
import { solvedState } from "@/lib/cube-state";

const QYSC_NAME_PREFIX = 'QY-QYSC';
export const QYSC_SERVICE = 0xfff0;
export const QYSC_CHARACTERISTIC = 0xfff6;
export const QYSC_MAC_PREFIX = "CC:A3:00:00"; // [0xcc, 0xa3, 0x00, 0x00];

async function getMacAddress(device: BluetoothDevice) {
  const trimmedName = device.name!.trim();
  const macName = trimmedName.substring(trimmedName.length - 4);
  return QYSC_MAC_PREFIX + ":" + macName.slice(0, 2) + ":" + macName.slice(2, 4);
}

async function initCube(device: BluetoothDevice, macAddress: string) {
  const server = await device.gatt?.connect();
  if (!server) throw new Error('Failed to connect to device');

  const operationQueue = new GattOperationQueue();

  const service = await server.getPrimaryService(QYSC_SERVICE);
  const characteristic = await service.getCharacteristic(QYSC_CHARACTERISTIC);

  const cubeStateEvents = new Subject<CubeStateEvent>();
  const cubeMoveEvents = new Subject<CubeMoveEvent>();
  const cubeInfoEvents = new Subject<CubeInfoEvent>();

  const processor = await createProcessor(cubeStateEvents, cubeMoveEvents, cubeInfoEvents);

  characteristic.addEventListener(
    "characteristicvaluechanged",
    async function (this: BluetoothRemoteGATTCharacteristic) {
      if (!this.value?.buffer) return;
      const packet = new Uint8Array(this.value.buffer);
      const data = decodePacket(packet);

      if (data.needsAck) {
        await operationQueue.enqueue(() => characteristic.writeValue(ackPacket(data.raw)));
      }

      processor.processPacket(data);
    }
  );

  await operationQueue.enqueue(() => characteristic.startNotifications());

  const macBytes = new Uint8Array(macAddress.split(':').map(byte => parseInt(byte, 16)));
  const hello = helloPacket(macBytes);
  await operationQueue.enqueue(() => characteristic.writeValue(hello));

  let freshStateTimeout: Timer | undefined = undefined;
  cubeStateEvents.subscribe(ev => {
    if (ev.type !== 'state') return;
    if (freshStateTimeout) clearTimeout(freshStateTimeout);
    freshStateTimeout = setTimeout(async () => {
      await operationQueue.enqueue(() => characteristic.writeValue(freshStatePacket()));
    }, 250);
  });

  const commands = {
    sync: async () => {
      const state = solvedState();
      const packet = syncPacket(state);
      await operationQueue.enqueue(() => characteristic.writeValue(packet));
    },
    freshState: async () => {
      await operationQueue.enqueue(() => characteristic.writeValue(freshStatePacket()));
    },
    disconnect: async () => {
      server.disconnect();
    },
  }

  return {
    device,
    events: {
      state: cubeStateEvents,
      moves: cubeMoveEvents,
      info: cubeInfoEvents,
    },
    commands,
  } satisfies SmartCube;
}

export const QYSC = {
  names: [QYSC_NAME_PREFIX],
  services: [QYSC_SERVICE],
  characteristics: [QYSC_CHARACTERISTIC],
  getMacAddress,
  initCube,
} satisfies SmartCubeDefinition;
