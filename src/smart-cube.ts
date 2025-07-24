import { Subject } from "rxjs";
import { CubeMoveEvent, CubeStateEvent } from "./events";

export type SmartCube = {
  cubeStateEvents: Subject<CubeStateEvent>;
  cubeMoveEvents: Subject<CubeMoveEvent>;
  commands: {
    sync: () => Promise<void>;
    freshState: () => Promise<void>;
    disconnect: () => Promise<void>;
  }
}

export type SmartCubeDefinition = {
  namePrefixes: string[];
  services: (string | number)[];
  manufacturerData?: number[];
  getMacAddress(device: BluetoothDevice): Promise<Uint8Array | undefined>;
  initCube(device: BluetoothDevice, macAddress: Uint8Array): Promise<SmartCube>;
}