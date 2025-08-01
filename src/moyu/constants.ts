export const KEY = new Uint8Array([
  21, 119, 58, 92, 103, 14, 45, 31, 23, 103,
  42, 19, 155, 103, 82, 87
]);
export const IV = new Uint8Array([
  17, 35, 38, 37, 134, 42, 44, 59, 85, 6,
  127, 49, 126, 103, 33, 87
]);

export const MOYU_SERVICE = "0783b03e-7735-b5a0-1760-a305d2795cb0";
export const MOYU_READ_CHARACTERISTIC = "0783b03e-7735-b5a0-1760-a305d2795cb1";
export const MOYU_WRITE_CHARACTERISTIC = "0783b03e-7735-b5a0-1760-a305d2795cb2";

export enum MoyuOps {
  CubeDisconnect = 0xA0,
  CubeInfo = 0xA1,
  CubeReset = 0xA2,
  CubeStatus = 0xA3,
  CubePower = 0xA4,
  CubeMove = 0xA5,
  CubeMoveGyro = 0xA6,
  CubeMoveExtend = 0xA7,
  CubeMoveHistory = 0xA8,
  CubeMoveTime = 0xA9,
  CubeBindAccount = 0xAA,
  CubeGyroUpdate = 0xAB,
  CubeGyroOperation = 0xAC,
  CubeChangeName = 0xAD,
  CubeSolving = 0xAE,
}