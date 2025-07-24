import { KPattern } from "cubing/kpuzzle";

export type CubeStateEvent = {
  type: 'hello' | 'state' | 'sync' | 'freshState';
  pattern: KPattern;
}

export type CubeMoveEvent = {
  move: 'U' | 'U\'' | 'R' | 'R\'' | 'F' | 'F\'' | 'L' | 'L\'' | 'B' | 'B\'' | 'D' | 'D\'';
  cubeTimestamp?: number;
  localTimestamp?: number;
}