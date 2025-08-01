import { CubeMoveEvent } from "@/events";

export const now: () => number =
    typeof window != 'undefined' && typeof window.performance?.now == 'function' ?
        () => Math.floor(window.performance.now()) :
        typeof process != 'undefined' && typeof process.hrtime?.bigint == 'function' ?
            () => Number(process.hrtime.bigint() / 1_000_000n) :
            () => Date.now();

export function interpolateTimes(times: (number | undefined)[]): number[] {
  if (times.length === 0) return [];
  if (times.length === 1) {
    const time = times[0];
    return [time != null && !isNaN(time) && isFinite(time) && time >= 0 ? time : 0];
  }
  
  const result: number[] = [];
  let lastValidIndex = -1;
  let nextValidIndex = -1;
  
  const isValidTime = (time: number | undefined): boolean => {
    return time != null && 
           !isNaN(time) && 
           isFinite(time) && 
           time >= 0;
  };
  
  // Find first valid time
  for (let i = 0; i < times.length; i++) {
    if (isValidTime(times[i])) {
      lastValidIndex = i;
      break;
    }
  }
  
  // If no valid times found, return array of zeros
  if (lastValidIndex === -1) {
    return new Array(times.length).fill(0);
  }
  
  for (let i = 0; i < times.length; i++) {
    if (isValidTime(times[i])) {
      result.push(times[i]!);
      lastValidIndex = i;
    } else {
      // Find next valid time
      nextValidIndex = -1;
      for (let j = i + 1; j < times.length; j++) {
        if (isValidTime(times[j])) {
          nextValidIndex = j;
          break;
        }
      }
      
      let interpolatedValue: number;
      
      if (lastValidIndex === -1) {
        // No previous valid time found, use next valid time or 0
        interpolatedValue = nextValidIndex !== -1 ? times[nextValidIndex]! : 0;
      } else if (nextValidIndex === -1) {
        // No next valid time found, use last valid time
        interpolatedValue = times[lastValidIndex]!;
      } else {
        const lastValidTime = times[lastValidIndex]!;
        const nextValidTime = times[nextValidIndex]!;
        
        // Check for time going backwards - this could be legitimate in some cases
        // but we'll be more conservative and use the last valid time
        if (nextValidTime < lastValidTime) {
          // Time went backwards, use last valid time
          interpolatedValue = lastValidTime;
        } else {
          const timeDiff = nextValidTime - lastValidTime;
          const indexDiff = nextValidIndex - lastValidIndex;
          const currentIndexDiff = i - lastValidIndex;
          
          if (indexDiff <= 0) {
            // Defensive check for division by zero or negative index diff
            interpolatedValue = lastValidTime;
          } else {
            // Linear interpolation
            const interpolationRatio = currentIndexDiff / indexDiff;
            
            // Clamp ratio to [0, 1] to prevent extrapolation
            const clampedRatio = Math.max(0, Math.min(1, interpolationRatio));
            
            interpolatedValue = lastValidTime + (timeDiff * clampedRatio);
            
            // More conservative bounds checking - allow up to 25% deviation
            const maxAllowedDiff = Math.max(timeDiff * 0.25, 50); // 25% of time diff or 50ms minimum
            const minValue = lastValidTime - maxAllowedDiff;
            const maxValue = nextValidTime + maxAllowedDiff;
            
            interpolatedValue = Math.max(minValue, Math.min(maxValue, interpolatedValue));
            
            // Ensure temporal consistency - interpolated value should be between last and next
            interpolatedValue = Math.max(lastValidTime, Math.min(nextValidTime, interpolatedValue));
          }
        }
      }
      
      result.push(interpolatedValue);
    }
  }
  
  return result;
}

export function interpolateMoves(moves: CubeMoveEvent[]): CubeMoveEvent[] {
  const times = moves.map(move => move.cubeTimestamp);
  const localTimes = moves.map(move => move.localTimestamp);
  const interpolatedTimes = interpolateTimes(times);
  const interpolatedLocalTimes = interpolateTimes(localTimes);
  return moves.map((move, index) => ({
    ...move,
    cubeTimestamp: interpolatedTimes[index],
    localTimestamp: interpolatedLocalTimes[index],
  }));
}