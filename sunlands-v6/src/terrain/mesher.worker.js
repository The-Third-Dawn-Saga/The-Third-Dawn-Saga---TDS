/* ============================================================================
   mesher.worker.js  ::  chunk building off the main thread.

   A module worker. It owns nothing but the pure height field, so it needs no
   state synchronisation with the main thread: the main thread asks for a
   chunk at an absolute centre and size, and gets back typed arrays that are
   transferred rather than copied.
   ========================================================================= */

import { buildChunk } from './mesher.js';

self.onmessage = (e) => {
  const jobs = e.data.jobs;
  const results = [];
  const transfer = [];
  for (const job of jobs) {
    const r = buildChunk(job.cx, job.cz, job.size);
    results.push({
      key: job.key, level: job.level, ix: job.ix, iz: job.iz,
      cx: job.cx, cz: job.cz, size: job.size,
      position: r.position, normal: r.normal, morphY: r.morphY,
      mat: r.mat, mat2: r.mat2,
      minY: r.minY, maxY: r.maxY,
    });
    transfer.push(r.position.buffer, r.normal.buffer, r.morphY.buffer,
                  r.mat.buffer, r.mat2.buffer);
  }
  self.postMessage({ results }, transfer);
};

self.postMessage({ ready: true });
