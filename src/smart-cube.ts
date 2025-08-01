import { Subject } from "rxjs";
import { CubeInfoEvent, CubeMoveEvent, CubeStateEvent } from "./events";

export type SmartCubeDefinition = {
  names: string[];
  services: (string | number)[];
  characteristics: (string | number)[];
  initCube: (device: BluetoothDevice, macAddress: string) => Promise<SmartCube>;
  getMacAddress: (device: BluetoothDevice) => Promise<string | null>;
}

export type SmartCube = {
  device: BluetoothDevice;
  events: {
    state: Subject<CubeStateEvent>;
    moves: Subject<CubeMoveEvent>;
    info: Subject<CubeInfoEvent>;
  };
  commands: {
    [key: string]: () => Promise<void>;
  }
}