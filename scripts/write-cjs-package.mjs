// Marks dist/cjs as CommonJS so Node and TypeScript treat its .js/.d.ts files
// correctly even though the package root is "type": "module".
import { writeFileSync } from "node:fs";

writeFileSync(
  new URL("../dist/cjs/package.json", import.meta.url),
  `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`,
);
