import { PackageJson } from "type-fest";
import { readJsonFile, writeJsonFile } from "@cpdevtools/lib-node-utilities";

(async () => {
  const pkg = (await readJsonFile("./package.json")) as PackageJson;
  delete pkg.devDependencies;
  delete pkg.scripts;
  delete (pkg as any)["lint-staged"];
  await writeJsonFile("./dist/package.json", pkg, 2);
})();
