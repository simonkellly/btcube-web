import { QYSC } from "@/qysc";
import { SmartCube, SmartCubeDefinition } from "@/smart-cube";

const cubes: SmartCubeDefinition[] = [
  QYSC,
];

export type BTCube = {
  device: BluetoothDevice;
} & SmartCube;

export async function connectBTCube() {
  const device = await navigator.bluetooth.requestDevice({
    filters: [
      ...cubes.flatMap(cube => cube.namePrefixes.map(prefix => ({ namePrefix: prefix }))),
    ],
    optionalServices: cubes.flatMap(cube => cube.services),
    optionalManufacturerData: cubes.flatMap(cube => cube.manufacturerData ?? []),
  });

  const cubeDef = cubes.find(cube => cube.namePrefixes.some(prefix => device.name?.startsWith(prefix)));

  if (!cubeDef) throw new Error('Cube not found');

  const macAddress = await cubeDef.getMacAddress(device);
  if (!macAddress) throw new Error('Mac address not found');

  const cube = await cubeDef.initCube(device, macAddress);

  return {
    device,
    events: {
      state: cube.cubeStateEvents,
      moves: cube.cubeMoveEvents,
    },
    commands: cube.commands,
  };
}