const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');

const POOL_SIZE = Math.max(2, os.cpus().length - 1);

class AnalysisWorkerPool {
  constructor() {
    this.workers = [];
    this.queue = [];
    for (let i = 0; i < POOL_SIZE; i++) this._spawnWorker();
  }

  _spawnWorker() {
    const worker = new Worker(path.join(__dirname, 'analysisWorker.cjs'));
    const entry = { worker, busy: false };
    
    worker.on('error', (err) => {
      console.error('[WorkerPool] Worker crashed', err);
      this._removeWorker(worker);
      this._spawnWorker();
    });
    
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`[WorkerPool] Worker abnormal exit: ${code}`);
        this._removeWorker(worker);
        this._spawnWorker();
      }
    });
    
    this.workers.push(entry);
  }

  _getIdleWorker() { return this.workers.find(e => !e.busy) || null; }
  
  _removeWorker(w) { this.workers = this.workers.filter(e => e.worker !== w); }

  async run(workerData, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const entry = this._getIdleWorker();
      if (!entry) { 
        this.queue.push({ workerData, resolve, reject, timeoutMs }); 
        return; 
      }
      this._dispatch(entry, workerData, resolve, reject, timeoutMs);
    });
  }

  _dispatch(entry, workerData, resolve, reject, timeoutMs) {
    entry.busy = true;
    const timer = setTimeout(() => {
      entry.worker.terminate();
      entry.busy = false;
      reject(new Error(`Worker timeout after ${timeoutMs}ms`));
      this._processQueue();
    }, timeoutMs);

    entry.worker.once('message', (result) => {
      clearTimeout(timer);
      entry.busy = false;
      if (result.success) {
        resolve(result.data);
      } else {
        reject(new Error(result.error));
      }
      this._processQueue();
    });

    entry.worker.postMessage(workerData);
  }

  _processQueue() {
    if (!this.queue.length) return;
    const entry = this._getIdleWorker();
    if (!entry) return;
    const { workerData, resolve, reject, timeoutMs } = this.queue.shift();
    this._dispatch(entry, workerData, resolve, reject, timeoutMs);
  }
}

module.exports = new AnalysisWorkerPool();
