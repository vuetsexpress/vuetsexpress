import typescript from "rollup-plugin-typescript2";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";

const plugins = [
  typescript({
    tsconfig: "buildtargets/tsconfig.server.json",
  }),
  nodeResolve({
    preferBuiltins: true,
  }),
  commonjs(),
  json(),
];

const external = [];

const name = "server";

export default [
  {
    input: "src/nodejs/cli.ts",
    external,
    output: {
      name,
      file: `dist/cli.js`,
      format: "umd",
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
        ].includes(warning.code)
      )
        return;

      console.log(warning.code);

      warn(warning);
    },
  },
];
