import { KPattern } from "cubing/kpuzzle";
import { type Subject } from 'rxjs';
import { CubeInfoEvent, CubeMoveEvent, CubeStateEvent } from "@/events";
import { MoyuOps } from "./constants";
import { MoyuData, MoyuInfoData, MoyuMoveData, MoyuPowerData, MoyuStatusData } from "./protocol";
import { faceletsToPattern } from "@/lib/cube-state";
import { now } from "@/lib/timing";

export const MOVES = {
  0: 'F',
  1: 'F\'',
  2: 'B',
  3: 'B\'',
  4: 'U',
  5: 'U\'',
  6: 'D',
  7: 'D\'',
  8: 'L',
  9: 'L\'',
  10: 'R',
  11: 'R\'',
}

function stateToFacelets(faceletBits: number[]) {
  var state = [];
  var faces = [2, 5, 0, 3, 4, 1] // parse in order URFDLB instead of FBUDLR
  for (var i = 0; i < 6; i += 1) {
    var face = faceletBits.slice(faces[i] * 8, 8 + faces[i] * 8);
    for (var j = 0; j < 8; j += 1) {
      state.push("FBUDLR".charAt(face[j]));
      if (j == 3) {
        state.push("FBUDLR".charAt(faces[i]));
      }
    }
  }
  return state.join('');
}

const createProcessor = async (
  cubeStateEvents: Subject<CubeStateEvent>,
  cubeMoveEvents: Subject<CubeMoveEvent>,
  cubeInfoEvents: Subject<CubeInfoEvent>,
) => {
  let isStartingMove = true;
  let lastState: KPattern | undefined = undefined;
  let lastStep = -1;
  let lastTimestamp = 0;

  const handlers = {
    [MoyuOps.CubeInfo]: (data: MoyuInfoData) => {
      lastStep = data.step;
      cubeInfoEvents.next({ type: 'gyro', gyroEnabled: data.isGyroEnabled });
    },
    [MoyuOps.CubePower]: (data: MoyuPowerData) => {
      cubeInfoEvents.next({ type: 'battery', battery: data.batt });
    },
    [MoyuOps.CubeStatus]: (data: MoyuStatusData) => {
      const facelets = stateToFacelets(data.state);
      const pattern = lastState = faceletsToPattern(facelets);
      lastStep = data.step;
      cubeStateEvents.next({ type: 'status', pattern });
    },
    [MoyuOps.CubeMove]: (data: MoyuMoveData) => {
      if (lastStep === 255) lastStep = -1;

      if (lastStep + 1 == data.step) {
        lastTimestamp += data.expressionIntervalubes[0];
        
        if (isStartingMove) {
          isStartingMove = false;
          lastTimestamp = 0;
        }

        cubeMoveEvents.next({
          move: MOVES[data.expressionIds[0] as keyof typeof MOVES],
          cubeTimestamp: lastTimestamp,
          localTimestamp: now(),
        })
      } else {
        console.info("Recovering moves");
        console.info(data.expressionIds);
        console.info(data.expressionIntervalubes);

        const amountNeeded = data.step - lastStep;
        if (amountNeeded > 5) throw new Error("Massive loss detected");
        for (let i = amountNeeded - 1; i >= 0; i--) {
          const move = MOVES[data.expressionIds[i] as keyof typeof MOVES];
          const time = data.expressionIntervalubes[i];
          lastTimestamp += time;
          cubeMoveEvents.next({
            move: move,
            cubeTimestamp: lastTimestamp,
            localTimestamp: i === 0 ? now() : undefined,
          })
        }
      }

      lastStep = data.step;
    }
  };

  const processPacket = (data: MoyuData) => {
    const handler = handlers[data.opCode as keyof typeof handlers];
    if (handler) {
      handler(data as any);
    }
  }

  return {
    processPacket,
    currentState: () => lastState,
  }
}

export default createProcessor;
