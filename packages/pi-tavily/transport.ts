import { Worker } from 'node:worker_threads';
import type { TavilyClientOptions, TavilySearchOptions, TavilyExtractOptions, TavilySearchResponse, TavilyExtractResponse } from '@tavily/core';

export type Request =
  | { operation: 'search'; input: string; options: TavilySearchOptions }
  | { operation: 'extract'; input: string[]; options: TavilyExtractOptions };
export type Response = TavilySearchResponse | TavilyExtractResponse;
export type RequestRunner = (request: Request, config: TavilyClientOptions, signal?: AbortSignal) => Promise<Response>;

/** The SDK has no transport AbortSignal. An isolated worker lets cancellation
 * close the actual SDK sockets without patching Axios or duplicating the API. */
export const requestTavily: RequestRunner = async (request, config, signal) => {
  signal?.throwIfAborted();
  const timeout = request.options.timeout ?? (request.operation === 'search' ? 60 : 30);
  const worker = new Worker(new URL('./sdk-worker.mjs', import.meta.url), {
    workerData: { request, config }, execArgv: [],
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await new Promise<Response>((resolve, reject) => {
      abort = () => reject(new Error('Tavily request cancelled'));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      timer = setTimeout(() => reject(new Error(`Tavily request timed out after ${timeout} seconds`)), timeout * 1000);
      worker.once('message', (message: {ok: boolean; value?: Response; error?: string}) => {
        if (message.ok && message.value) resolve(message.value);
        else reject(new Error(message.error ?? 'Tavily SDK request failed'));
      });
      worker.once('error', reject);
      worker.once('exit', code => reject(new Error(`Tavily SDK worker exited without a result (${code})`)));
    });
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
    await worker.terminate();
  }
};
