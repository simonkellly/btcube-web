import { SmartCubeDefinition } from "../smart-cube";

const GAN_CIC_LIST = Array(256).fill(undefined).map((_v, i) => (i << 8) | 0x01);
const GAN_GEN3_SERVICE = "8653000a-43e6-47b7-9cb0-5fc21d4ae340";

async function getMacAddress(device: BluetoothDevice) {
  return new Promise<Uint8Array | undefined>((resolve) => {
    if (typeof device.watchAdvertisements != 'function') {
      resolve(undefined);
    }

    const cancellation = new AbortController();
    const onAdvertisement = (ev: BluetoothAdvertisingEvent) => {
      device.removeEventListener("advertisementreceived", onAdvertisement);
      cancellation.abort();

      const macBytes: Uint8Array = new Uint8Array(6);
      const cic = GAN_CIC_LIST.find(cic => ev.manufacturerData.has(cic));
      const dataBytes = cic ? new DataView(ev.manufacturerData.get(cic)!.buffer.slice(0, 9)) : undefined;
      
      if (dataBytes && dataBytes.byteLength >= 6) {
        for (let i = 1; i <= 6; i++) {
          macBytes[i] = dataBytes.getUint8(dataBytes.byteLength - i);
        }
      }
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

export const GAN = {
  namePrefixes: ["GAN", "MG", "AiCube"],
  services: [GAN_GEN3_SERVICE],
  manufacturerData: GAN_CIC_LIST,
  getMacAddress,
} as const satisfies Partial<SmartCubeDefinition>;