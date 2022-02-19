import typescript from "rollup-plugin-typescript2";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import { terser } from "rollup-plugin-terser";

const plugins = [
  typescript({
    tsconfig: "buildtargets/tsconfig.client.json",
  }),
  nodeResolve(),
  commonjs(),
  json(),
  terser(),
];

const external = [];

const name = "client";

export default [
  {
    input: "src/browser/client.ts",
    external,
    output: {
      name,
      file: `dist/client.js`,
      format: "iife",
      sourcemap: true,
      exports: "named",
      globals: {},
      inlineDynamicImports: true,
    },
    plugins,
    onwarn(warning, warn) {
      if (
        [
          "CIRCULAR_DEPENDENCY",
          "UNRESOLVED_IMPORT",
          "MISSING_GLOBAL_NAME",
          "MISSING_NODE_BUILTINS",
          "EVAL",
          "PLUGIN_WARNING",
        ].includes(warning.code)
      )
        return;

      console.log("warning code", warning.code);

      warn(warning);
    },
  },
];
