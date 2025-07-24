import { GattOperationQueue } from "@/lib/gatt-queue";
import { SmartCube, SmartCubeDefinition } from "../smart-cube";
import { ackPacket, decodePacket, freshStatePacket, helloPacket, syncPacket } from "./protocol";
import { Subject } from "rxjs";
import { CubeMoveEvent, CubeStateEvent } from "@/events";
import createProcessor from "./processor";
import { solvedState } from "@/lib/cube-state";

export const QYSC_NAME_PREFIX = 'QY-QYSC';
export const QYSC_SERVICE = 0xfff0;
export const QYSC_CHARACTERISTIC = 0xfff6;
export const QYSC_MAC_PREFIX = [0xcc, 0xa3, 0x00, 0x00];

async function getMacAddress(device: BluetoothDevice) {
  const trimmedName = device.name!.trim();
  const macName = trimmedName.substring(trimmedName.length - 4);
  const mac = new Uint8Array([
    ...QYSC_MAC_PREFIX,
    parseInt(macName.slice(0, 2), 16),
    parseInt(macName.slice(2, 4), 16),
  ]);

  return mac;
}

async function initCube(device: BluetoothDevice, macAddress: Uint8Array) {
  const server = await device.gatt?.connect();
  if (!server) throw new Error('Failed to connect to device');

  const operationQueue = new GattOperationQueue();

  const service = await server.getPrimaryService(QYSC_SERVICE);
  const characteristic = await service.getCharacteristic(QYSC_CHARACTERISTIC);

  const cubeStateEvents = new Subject<CubeStateEvent>();
  const cubeMoveEvents = new Subject<CubeMoveEvent>();

  const processor = await createProcessor(cubeStateEvents, cubeMoveEvents);

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

  const hello = helloPacket(macAddress);
  await operationQueue.enqueue(() => characteristic.writeValue(hello));

  let freshStateTimeout: Timer | undefined = undefined;
  cubeStateEvents.subscribe(ev => {
    if (ev.type !== 'state') return;
    if (freshStateTimeout) clearTimeout(freshStateTimeout);
    freshStateTimeout = setTimeout(async () => {
      await operationQueue.enqueue(() => characteristic.writeValue(freshStatePacket()));
    }, 250);
  });

  // TODO: This should probably be handled globally better
  const commands = {
    sync: async () => {
      const state = solvedState();
      const packet = syncPacket(state);
      await operationQueue.enqueue(() => characteristic.writeValue(packet));
      // TODO: Handle sync packet properly on clients
    },
    freshState: async () => {
      await operationQueue.enqueue(() => characteristic.writeValue(freshStatePacket()));
    },
    disconnect: async () => {
      server.disconnect();
    },
  }

  return {
    cubeStateEvents,
    cubeMoveEvents,
    commands,
  } satisfies SmartCube;
}

export const QYSC = {
  namePrefixes: ["QY-QYSC"],
  services: [QYSC_SERVICE],
  getMacAddress,
  initCube,
} as const satisfies SmartCubeDefinition;
