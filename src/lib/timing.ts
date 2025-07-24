export const now: () => number =
    typeof window != 'undefined' && typeof window.performance?.now == 'function' ?
        () => Math.floor(window.performance.now()) :
        typeof process != 'undefined' && typeof process.hrtime?.bigint == 'function' ?
            () => Number(process.hrtime.bigint() / 1_000_000n) :
            () => Date.now();