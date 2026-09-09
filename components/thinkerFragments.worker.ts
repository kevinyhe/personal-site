import {
  type BuildSolidChunkOptions,
  buildSolidThinkerChunks,
  chunkTransferables,
  loadThinkerGeometry,
} from "@/components/thinkerFragments";

/**
 * Builds a figure's chunks off the main thread: the fracture takes a
 * second or two, which would otherwise land as a freeze right as the panel
 * opens. Receives the build options (which name the model to cut; the
 * statue by default), replies once per request with the build (buffers
 * transferred) or an error message. One worker serves every figure, one
 * request after another — see thinkerChunks.
 */

type WorkerScope = {
  onmessage: ((event: MessageEvent<BuildSolidChunkOptions>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = async (event) => {
  try {
    const options = event.data;
    const geometry = await loadThinkerGeometry(options.modelPath, options.normalizeHeight);
    const build = buildSolidThinkerChunks(geometry, options);

    geometry.dispose();
    scope.postMessage({ build }, chunkTransferables(build.chunks));
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
