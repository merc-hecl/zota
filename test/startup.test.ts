import { assert } from "chai";
import { config } from "../package.json";

describe("startup", function () {
  it("should have plugin instance defined", function () {
    assert.isNotEmpty(Zotero[config.addonInstance]);
  });

  // Smoke test: pi-ai's gemini Stream subclasses ReadableStream borrowed
  // from a DOM window (see lazyReadableStreamPlugin in
  // zotero-plugin.config.ts). Verify it is constructible and readable in the
  // privileged scope.
  it("can run a ReadableStream subclass from a DOM window", async function () {
    let source: Window | null = null;
    try {
      source = Services.appShell.hiddenDOMWindow as Window | null;
    } catch (e) {
      // Throws NS_ERROR_FAILURE in early startup / test profile
    }
    if (!source?.ReadableStream) {
      source = Zotero.getMainWindow() as Window | null;
    }
    const RS = source!.ReadableStream as typeof ReadableStream;
    class S extends RS {}
    const s = new S({
      async pull(controller: ReadableStreamDefaultController) {
        controller.enqueue(new TextEncoder().encode("ok"));
        controller.close();
      },
    });
    const reader = s.getReader();
    const result = await reader.read();
    assert.equal(new TextDecoder().decode(result.value), "ok");
    assert.isTrue((await reader.read()).done);
  });
});
