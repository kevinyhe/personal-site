import {
  type BuildSolidChunkOptions,
  buildSolidThinkerChunks,
  chunkTransferables,
  loadThinkerGeometry,
} from "@/components/thinkerFragments";

/**
 * Builds The Thinker's chunks off the main thread: the fracture takes a
 * second or two, which would otherwise land as a freeze right as the panel
 * opens. Receives the build options, replies once with the build (buffers
 * transferred) or an error message.
 */

type WorkerScope = {
  onmessage: ((event: MessageEvent<BuildSolidChunkOptions>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = async (event) => {
  try {
    const geometry = await loadThinkerGeometry();
    const build = buildSolidThinkerChunks(geometry, event.data);

    geometry.dispose();
    scope.postMessage({ build }, chunkTransferables(build.chunks));
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
