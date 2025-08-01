import { CubeData, CubeFreshStateData, CubeHelloData, CubeOperations, CubeStateData, CubeSyncData } from "./protocol";
import type { KPattern } from "cubing/kpuzzle";
import { type Subject } from 'rxjs';
import { cube3x3x3 } from "cubing/puzzles";
import { stateToPattern } from "@/lib/cube-state";
import { now } from "@/lib/timing";
import { CubeInfoEvent, CubeMoveEvent, CubeStateEvent } from "@/events";

export const MOVES = {
  0x1: 'L\'',
  0x2: 'L',
  0x3: 'R\'',
  0x4: 'R',
  0x5: 'D\'',
  0x6: 'D',
  0x7: 'U\'',
  0x8: 'U',
  0x9: 'F\'',
  0xa: 'F',
  0xb: 'B\'',
  0xc: 'B',
}

export function getMove(state: CubeStateData) {
  const move = state.move;
  return MOVES[move as keyof typeof MOVES];
}

const possibleMoves = ['U', 'U\'', 'R', 'R\'', 'F', 'F\'', 'L', 'L\'', 'B', 'B\'', 'D', 'D\''];

function identifyMoves(original: KPattern, current: KPattern, depth: number = 4): string[] | undefined {
  const queue: [KPattern, string[]][] = [[original, []]];

  while (queue.length > 0) {
    const [pattern, moves] = queue.shift()!;

    if (pattern.isIdentical(current)) {
      return moves;
    }

    if (moves.length < depth) {
      for (const move of possibleMoves) {
        const transformed = pattern.applyMove(move);
        queue.push([transformed, [...moves, move]]);
      }
    }
  }

  return undefined;
}

function extractPreviousMoves(prev: Uint8Array) {
  // structure: 9 sets of previous moves:
  // Padding up until:
  // Timestamp (4 bytes)
  // Move (1 byte)
  // Most recent goes at the end

  const moves: string[] = [];
  const timestamps: number[] = [];
  for (let i = prev.length - 1; i >= 0; i -= 5) {
    const move = prev[i];
    if (move === 255) continue;
    const timestamp = (prev[i - 4] << 24) | (prev[i - 3] << 16) | (prev[i - 2] << 8) | prev[i - 1];
    if (!MOVES[move as keyof typeof MOVES]) {
      console.log('invalid move', move);
    }
    moves.push(MOVES[move as keyof typeof MOVES]);
    timestamps.push(timestamp);
  }
  return { moves, timestamps };
}

const createProcessor = async (
  cubeStateEvents: Subject<CubeStateEvent>,
  cubeMoveEvents: Subject<CubeMoveEvent>,
  cubeInfoEvents: Subject<CubeInfoEvent>,
) => {
  let lastState: KPattern | undefined = undefined;
  let lastTimestamp = 0;

  const puzzle = await cube3x3x3.kpuzzle();

  const handlers = {
    [CubeOperations.CubeHello]: (data: CubeHelloData) => {
      const pattern = lastState = stateToPattern(data.initialState);
      lastTimestamp = data.timestamp;
      cubeStateEvents.next({ type: 'hello', pattern });
      cubeInfoEvents.next({ type: 'battery', battery: data.battery });
    },
    [CubeOperations.CubeSync]: (data: CubeSyncData) => {
      const pattern = lastState = stateToPattern(data.cubeState);
      lastTimestamp = data.timestamp;
      cubeStateEvents.next({ type: 'sync', pattern });
    },
    [CubeOperations.CubeState]: (data: CubeStateData) => {
      const pattern = stateToPattern(data.cubeState);

      const moves: CubeMoveEvent[] = [];
      const move = getMove(data);
      const prev = extractPreviousMoves(data.previousMoves);

      const moveIndex = prev.timestamps.findIndex(t => t === lastTimestamp);
      if (moveIndex !== -1) {
        const missedMoves = prev.moves.slice(0, moveIndex).reverse();
        const missedTimestamps = prev.timestamps.slice(0, moveIndex).reverse();

        for (let i = 0; i < missedMoves.length; i++) {
          const move = missedMoves[i];
          const timestamp = missedTimestamps[i];
          moves.push({
            move: move as CubeMoveEvent['move'],
            cubeTimestamp: timestamp,
          });
        }
      }

      moves.push({
        move: move as CubeMoveEvent['move'],
        cubeTimestamp: data.timestamp,
        localTimestamp: now(),
      });

      const actualState = data.needsAck ? puzzle.defaultPattern() : stateToPattern(data.cubeState);
      const currentState = lastState ? lastState.applyAlg(moves.map(m => m.move).join(' ')) : actualState;
      lastState = actualState;

      if (!currentState.isIdentical(actualState)) {
        const foundMoves = identifyMoves(currentState, actualState);
        if (foundMoves && (foundMoves.length > 0)) {
          foundMoves.forEach(m => {
            moves.push({
              move: m as CubeMoveEvent['move'],
            });
          });
          console.log('Needs additional moves for state: ', foundMoves);
        }
      }

      lastTimestamp = data.timestamp;
      lastState = actualState;

      for (const move of moves) {
        cubeMoveEvents.next(move);
      }
      cubeStateEvents.next({ type: 'state', pattern });
    },
    [CubeOperations.CubeFreshState]: (data: CubeFreshStateData) => {
      const pattern = stateToPattern(data.cubeState);

      const actualState = stateToPattern(data.cubeState);
      const currentState = lastState ? lastState : actualState;
      
      lastTimestamp = data.timestamp;
      lastState = actualState;

      if (currentState.isIdentical(actualState)) {
        cubeStateEvents.next({ type: 'freshState', pattern });
        return;
      }
      
      const foundMoves = identifyMoves(currentState, actualState);
      if (!foundMoves || foundMoves.length === 0) {
        cubeStateEvents.next({ type: 'freshState', pattern });
        return;
      }

      for (const move of foundMoves) {
        cubeMoveEvents.next({
          move: move as CubeMoveEvent['move'],
        });
      }
      console.log('FreshState found moves: ', foundMoves);
      cubeStateEvents.next({ type: 'freshState', pattern });
      cubeInfoEvents.next({ type: 'battery', battery: data.battery });
    },
  };

  const processPacket = (data: CubeData) => {
    handlers[data.opcode](data as any);
  }

  return {
    processPacket,
    currentState: () => lastState,
  }
}

export default createProcessor;
