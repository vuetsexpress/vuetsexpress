import { interpreter } from "./clicore";
import fs from "fs";

/////////////////////////////////////////////////////////////

const argv = require("minimist")(process.argv.slice(2));

interpreter(argv).then((result: any) => {
  if (typeof result !== "object") {
    console.log(result);
    return;
  }

  if (result.stdout) {
    fs.writeFileSync("clistdout", result.stdout);
  } else {
    console.log(result);
  }
});
