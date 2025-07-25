import { CubeBatteryData, CubeData, CubeDisconnectData, CubeHardwareData, CubeMoveData, CubeMoveHistoryData, CubeOperations, CubeStateData } from "./protocol";
import { KPattern, KPuzzle } from "cubing/kpuzzle";
import { type Subject } from 'rxjs';
import { cube3x3x3 } from "cubing/puzzles";
import { now } from "@/lib/timing";
import { CubeMoveEvent, CubeStateEvent } from "@/events";

const moves = {
  0x02: "U",
  0x42: "U'",
  0x08: "F",
  0x48: "F'",
  0x20: "R",
  0x60: "R'",
  0x04: "B",
  0x44: "B'",
  0x10: "L",
  0x50: "L'",
  0x01: "D",
  0x41: "D'",
} as const;

const EDGE_SLOT_MAPPING = [1, 0, 3, 2, 5, 4, 7, 6, 8, 9, 11, 10];
const CORNER_SLOT_MAPPING = [0, 3, 2, 1, 4, 5, 6, 7]; 

function toKPattern(puzzle: KPuzzle, data: CubeStateData['pattern']) {
  return new KPattern(puzzle, {
    EDGES: {
      pieces: EDGE_SLOT_MAPPING.map(ganSlot => EDGE_SLOT_MAPPING[data.edges.pieces[ganSlot]]),
      orientation: EDGE_SLOT_MAPPING.map(ganSlot => data.edges.orientation[ganSlot]),
    },
    CORNERS: {
      pieces: CORNER_SLOT_MAPPING.map(ganSlot => CORNER_SLOT_MAPPING[data.corners.pieces[ganSlot]]),
      orientation: CORNER_SLOT_MAPPING.map(ganSlot => data.corners.orientation[ganSlot]),
    },
    CENTERS: {
      pieces: [0, 1, 2, 3, 4, 5],
      orientation: [0, 0, 0, 0, 0, 0],
      orientationMod: [1, 1, 1, 1, 1, 1],
    }
  });
}

const createProcessor = async (
  cubeStateEvents: Subject<CubeStateEvent>,
  cubeMoveEvents: Subject<CubeMoveEvent>,
) => {
  let lastState: KPattern | undefined = undefined;

  const puzzle = await cube3x3x3.kpuzzle();

  const handlers = {
    [CubeOperations.CubeMove]: (data: CubeMoveData) => {
      const move = moves[data.move as keyof typeof moves];
      const localTimestamp = now();
      cubeMoveEvents.next({
        move, localTimestamp, cubeTimestamp: data.timestamp
      });
    },
    [CubeOperations.CubeState]: (data: CubeStateData) => {
      const pattern = toKPattern(puzzle, data.pattern);
      cubeStateEvents.next({ type: 'state', pattern });
    },
    [CubeOperations.CubeMoveHistory]: (data: CubeMoveHistoryData) => {},
    [CubeOperations.CubeHardware]: (data: CubeHardwareData) => {},
    [CubeOperations.CubeBattery]: (data: CubeBatteryData) => {},
    [CubeOperations.CubeDisconnect]: (data: CubeDisconnectData) => {},
  };

  const processPacket = (data: CubeData) => {
    if (!handlers[data.opcode]) {
      console.error('unknown opcode', data.opcode);
      console.log(data.raw);
    }

    handlers[data.opcode](data as any);
  }

  return {
    processPacket,
    currentState: () => lastState,
  }
}

export default createProcessor;
