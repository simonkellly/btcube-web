import { KPattern } from "cubing/kpuzzle";

export type CubeStateEvent = {
  type: string;
  pattern: KPattern;
}

export type CubeMoveEvent = {
  move: string;
  cubeTimestamp?: number;
  localTimestamp?: number;
}

export type CubeBatteryEvent = {
  type: 'battery';
  battery: number;
}

export type CubeInfoEvent = CubeBatteryEvent;