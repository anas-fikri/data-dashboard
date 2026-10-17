// Worker thread uji (parallel.test.ts): menghabiskan heap sampai batas resourceLimits → Node
// menghentikannya dengan ERR_WORKER_OUT_OF_MEMORY sebelum ada pesan.
const keep: number[][] = [];
for (;;) keep.push(new Array<number>(1_000_000).fill(keep.length));
