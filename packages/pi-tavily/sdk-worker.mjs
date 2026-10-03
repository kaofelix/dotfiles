import { parentPort, workerData } from 'node:worker_threads';
import { tavily } from '@tavily/core';

const { request, config } = workerData;
try {
  const client = tavily(config);
  const value = request.operation === 'search'
    ? await client.search(request.input, request.options)
    : await client.extract(request.input, request.options);
  parentPort.postMessage({ ok: true, value });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
} finally {
  parentPort.close();
}
