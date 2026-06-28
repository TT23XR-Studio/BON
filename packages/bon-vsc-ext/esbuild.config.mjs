import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  external: ["vscode"],
  format: "esm",
  platform: "node",
  target: "esnext",
  sourcemap: true,
  minify: false,
  keepNames: true,
});
