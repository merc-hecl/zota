import * as fs from "node:fs";
import { defineConfig } from "zotero-plugin-scaffold";
import type { Plugin } from "esbuild";
import pkg from "./package.json";

/**
 * Zotero loads plugin scripts into a non-DOM privileged scope that lacks Web
 * Streams. @google/genai's web build evaluates
 * `class Stream extends ReadableStream` at module top level, which throws
 * there. All other pi-ai dependencies only touch these globals lazily.
 *
 * This patch resolves the base class through a helper that reads (never
 * injects) `ReadableStream` from the hidden DOM window when the scope has
 * none, so the shared global stays untouched and no shutdown cleanup is
 * needed. The strict marker match makes the patch fail loudly when an
 * upgrade changes the upstream code shape.
 */
function lazyReadableStreamPlugin(): Plugin {
  return {
    name: "zota-lazy-readable-stream",
    setup(build) {
      build.onLoad(
        { filter: /[\\/]@google[\\/]genai[\\/]dist[\\/]web[\\/]index\.mjs$/ },
        async (args) => {
          const contents = await fs.promises.readFile(args.path, "utf8");
          const marker = "class Stream extends ReadableStream {";
          if (!contents.includes(marker)) {
            throw new Error(
              `[zota] @google/genai web build no longer contains "${marker}". ` +
                "Re-check Web Streams handling for Zotero's privileged scope.",
            );
          }
          const patched =
            "var __zotaRS;\n" +
            "function __zotaReadableStream() {\n" +
            "  if (__zotaRS === void 0) {\n" +
            "    __zotaRS = globalThis.ReadableStream;\n" +
            '    if (typeof __zotaRS === "undefined") {\n' +
            "      // hiddenDOMWindow throws NS_ERROR_FAILURE in early startup\n" +
            "      // (and in the scaffold test profile), so fall back to the\n" +
            "      // main window: any DOM window provides native ReadableStream.\n" +
            "      var w = null;\n" +
            "      try {\n" +
            "        w = Services.appShell && Services.appShell.hiddenDOMWindow;\n" +
            "      } catch (e1) {}\n" +
            "      if (!w || !w.ReadableStream) {\n" +
            "        try {\n" +
            "          w = Zotero.getMainWindow();\n" +
            "        } catch (e2) {}\n" +
            "      }\n" +
            "      __zotaRS = w && w.ReadableStream;\n" +
            "    }\n" +
            "  }\n" +
            "  return __zotaRS;\n" +
            "}\n" +
            contents.replace(
              marker,
              "class Stream extends __zotaReadableStream() {",
            );
          return { contents: patched, loader: "js" };
        },
      );
    },
  };
}

export default defineConfig({
  source: ["src", "addon"],
  dist: ".scaffold/build",
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,
  updateURL: `https://github.com/{{owner}}/{{repo}}/releases/download/release/${
    pkg.version.includes("-") ? "update-beta.json" : "update.json"
  }`,
  xpiDownloadLink:
    "https://github.com/{{owner}}/{{repo}}/releases/download/V{{version}}/{{xpiName}}.xpi",

  build: {
    assets: ["addon/**/*.*"],
    define: {
      ...pkg.config,
      author: pkg.author,
      description: pkg.description,
      homepage: pkg.homepage,
      buildVersion: pkg.version,
      buildTime: "{{buildTime}}",
    },
    prefs: {
      prefix: pkg.config.prefsPrefix,
      defaults: {
        thinkingModeEnabled: false,
        claudeThinkingEffort: "none",
      },
    },
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        define: {
          __env__: `"${process.env.NODE_ENV}"`,
        },
        bundle: true,
        target: "firefox140",
        outfile: `.scaffold/build/addon/content/scripts/${pkg.config.addonRef}.js`,
        plugins: [lazyReadableStreamPlugin()],
      },
    ],
  },

  test: {
    waitForPlugin: `() => Zotero.${pkg.config.addonInstance}.data.initialized`,
  },

  release: {
    bumpp: {
      commit: "🔖 release V%s",
      tag: "V%s",
    },
  },

  // If you need to see a more detailed log, uncomment the following line:
  // logLevel: "trace",
});
