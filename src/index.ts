import { MOYU } from "./moyu";
import { QYSC } from "./qysc";
import { SmartCubeDefinition } from "./smart-cube";

const smartCubes: SmartCubeDefinition[] = [
  MOYU,
  QYSC
]

export async function connectSmartCube() {
  const device = await navigator.bluetooth.requestDevice({
    filters: smartCubes.flatMap(cube => cube.names.map(name => ({ namePrefix: name }))),
    optionalServices: smartCubes.flatMap(cube => cube.services),
  });

  if (!device.name) throw new Error('No device name');

  for (const cube of smartCubes) {
    if (cube.names.some((name: string) => device.name!.startsWith(name))) {
      const macAddress = await cube.getMacAddress(device);

      return cube.initCube(device, macAddress ?? "CF:30:16:01:DC:E1");
    }
  }

  throw new Error('No smart cube found');
}

export { interpolateTimes, now, interpolateMoves } from "./lib/timing";