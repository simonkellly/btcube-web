import { GattOperationQueue } from "@/lib/gatt-queue";
import { SmartCube, SmartCubeDefinition } from "../smart-cube";
import { Subject } from "rxjs";
import { CubeMoveEvent, CubeStateEvent } from "@/events";
import { GAN_CIC_LIST, GAN_GEN3_SERVICE, GAN_GEN3_STATE_CHARACTERISTIC } from "./constants";
import { createCrypter } from "./protocol";
import createProcessor from "./processor";

function getManufacturerDataBytes(manufacturerData: BluetoothManufacturerData | DataView): DataView | undefined {
  if (manufacturerData instanceof DataView) {
    return new DataView(manufacturerData.buffer.slice(2, 11));
  }

  for (const id of GAN_CIC_LIST) {
    if (manufacturerData.has(id)) {
        return new DataView(manufacturerData.get(id)!.buffer.slice(0, 9));
    }
  }
  return;
}

function extractMAC(manufacturerData: BluetoothManufacturerData) {
  const bytes = new Uint8Array(6);
  const data = getManufacturerDataBytes(manufacturerData);
  if (data && data.byteLength >= 6) {
    for (let i = 1; i <= 6; i++) {
      bytes[i - 1] = data.getUint8(data.byteLength - i);
    }
  }
  return bytes;
}

async function getMacAddress(device: BluetoothDevice) {
  return new Promise<Uint8Array | undefined>((resolve) => {
    if (typeof device.watchAdvertisements != 'function') {
      resolve(undefined);
    }

    const cancellation = new AbortController();
    const onAdvertisement = (ev: BluetoothAdvertisingEvent) => {
      device.removeEventListener("advertisementreceived", onAdvertisement);
      cancellation.abort();

      const macBytes = extractMAC(ev.manufacturerData);
      console.log('macBytes', Array.from(macBytes).map(b => b.toString(16).padStart(2, '0')).join(' '));
      resolve(macBytes);
    };

    const onAbort = () => {
      device.removeEventListener("advertisementreceived", onAdvertisement);
      cancellation.abort();
      resolve(undefined);
    };

    device.addEventListener("advertisementreceived", onAdvertisement);
    device.watchAdvertisements({ signal: cancellation.signal }).catch(onAbort);
    setTimeout(onAbort, 10000);
  });
}

async function initCube(device: BluetoothDevice, macAddress: Uint8Array) {
  const server = await device.gatt?.connect();
  if (!server) throw new Error('Failed to connect to device');

  const operationQueue = new GattOperationQueue();

  const service = await server.getPrimaryService(GAN_GEN3_SERVICE);
  const characteristic = await service.getCharacteristic(GAN_GEN3_STATE_CHARACTERISTIC);

  const crypter = createCrypter(device, macAddress);

  const cubeStateEvents = new Subject<CubeStateEvent>();
  const cubeMoveEvents = new Subject<CubeMoveEvent>();

  const processor = await createProcessor(cubeStateEvents, cubeMoveEvents);

  characteristic.addEventListener(
    "characteristicvaluechanged",
    async function (this: BluetoothRemoteGATTCharacteristic) {
      if (!this.value?.buffer) return;
      const packet = new Uint8Array(this.value.buffer);
      const data = crypter.decodePacket(packet);

      processor.processPacket(data);
    }
  );

  await operationQueue.enqueue(() => characteristic.startNotifications());

  return {
    cubeStateEvents,
    cubeMoveEvents,
    commands: {
      sync: async () => {},
      freshState: async () => {},
      disconnect: async () => {
        server.disconnect();
      },
    },
  } satisfies SmartCube;
}

export const GAN = {
  namePrefixes: ["GAN", "MG", "AiCube"],
  services: [GAN_GEN3_SERVICE],
  manufacturerData: GAN_CIC_LIST,
  getMacAddress,
  initCube,
} as const satisfies Partial<SmartCubeDefinition>;