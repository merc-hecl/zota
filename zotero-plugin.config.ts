import * as fs from "node:fs";
import { defineConfig } from "zotero-plugin-scaffold";
import type { Plugin } from "esbuild";
import pkg from "./package.json";

/**
 * zota ships pi-ai only as a provider *catalog*: base URLs, model lists and
 * per-model metadata. The chat transport is zota's own fetch+SSE code
 * (src/modules/providers/streaming), so pi-ai's api/*.lazy.js modules —
 * whose dynamic imports drag the official OpenAI/Anthropic/Google/Mistral
 * SDKs into the bundle — are replaced with empty stubs at build time.
 *
 * The stub reads the real export name from the module so an upstream rename
 * or new lazy module fails the build loudly instead of silently breaking
 * the provider catalog.
 */
function piAiLazyApiStubPlugin(): Plugin {
  return {
    name: "zota-pi-ai-lazy-api-stub",
    setup(build) {
      build.onLoad(
        {
          filter:
            /[\\/]@earendil-works[\\/]pi-ai[\\/]dist[\\/]api[\\/][^\\/]+\.lazy\.js$/,
        },
        async (args) => {
          const contents = await fs.promises.readFile(args.path, "utf8");
          const match = /export const (\w+)\s*=/.exec(contents);
          if (!match) {
            throw new Error(
              `[zota] ${args.path} no longer exports a named API factory. ` +
                "Re-check the pi-ai lazy API stub plugin.",
            );
          }
          return {
            contents: `export const ${match[1]} = () => ({});`,
            loader: "js",
          };
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
        plugins: [piAiLazyApiStubPlugin()],
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
