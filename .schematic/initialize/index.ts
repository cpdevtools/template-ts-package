import {
  apply,
  chain,
  empty,
  MergeStrategy,
  mergeWith,
  renameTemplateFiles,
  Rule,
  SchematicContext,
  strings,
  template,
  Tree,
  url,
} from "@angular-devkit/schematics";
import Path from "path/posix";
import { readJsonFile, readYamlFile } from "@cpdevtools/lib-node-utilities";
import { existsSync } from "fs";
import type { PackageJson } from "type-fest";
import { NodePackageInstallTask } from "@angular-devkit/schematics/tasks";

export interface Args {
  templatePath: string;
  finalize: boolean;
}

export interface Options extends Args {
  templatePath: string;
  dot: ".";
  strings: typeof strings & {
    lower: (str: string) => string;
    upper: (str: string) => string;
    json: (str: string) => string;
  };
  versions: Record<string, string>;
  package?: PackageJson;
  [key: string | number]: unknown;
}

async function readDataFile<T = unknown>(dataPath: string) {
  const filePath = [`${dataPath}.js`, `${dataPath}.yaml`, `${dataPath}.yml`, `${dataPath}.json`, `${dataPath}`].find((f) => existsSync(f));

  if (filePath) {
    const ext = Path.extname(filePath).toLowerCase();
    switch (ext) {
      case ".js":
        return (await require(filePath).default) as T;
      case ".json":
        return (await readJsonFile(filePath)) as T;
      case ".yml":
      case ".yaml":
        return (await readYamlFile(filePath)) as T;
    }
  }
  return undefined;
}

async function getOptions(args: Args) {
  let templatePath = Path.normalize(args.templatePath);

  if (!templatePath.startsWith("/")) {
    templatePath = Path.join(process.cwd(), templatePath);
  }

  const packagePath = Path.join(process.cwd(), "package.json");

  let data = (await readDataFile(Path.join(templatePath, "options"))) ?? {};
  let versions = ((await readDataFile(Path.join(templatePath, "versions"))) ?? {}) as Record<string, string>;
  const tplOpts: Options = {
    ...args,
    ...data,
    dot: ".",
    strings: {
      ...strings,
      lower: (str: string) => str.toLowerCase(),
      upper: (str: string) => str.toUpperCase(),
      json: (obj: any, indent?: number) => JSON.stringify(obj, undefined, indent),
    },
    versions,
    templatePath,
  };

  const pkg = existsSync(packagePath) ? ((await readJsonFile(packagePath)) as PackageJson) : null;
  if (pkg) {
    tplOpts.package = pkg;

    const p = pkg.name?.split("/");
    const repoOwner = p?.shift()?.slice(1);
    const repoName = p?.join("/");
    tplOpts.repo = {
      owner: repoOwner,
      name: repoName,
    };
  }
  return tplOpts;
}

function generateTemplate(options: Options) {
  return async () => {
    return mergeWith(apply(url(Path.join(options.templatePath, "files")), [template(options), renameTemplateFiles()]));
  };
}

function cleanGenerator(opts: Options) {
  return async (tree: Tree, _: SchematicContext) => {
    try {
      tree.delete(".tpl");
    } catch {}
    try {
      tree.delete("pnpm-lock.yaml");
    } catch {}
    if (opts.finalize !== false) {
      try {
        tree.delete(".schematic");
        tree.delete(".template");
        tree.delete(".github/workflows/initialize.yml");
      } catch {}
    }
  };
}

function installPnpm(opts: Options) {
  return async (_tree: Tree, context: SchematicContext) => {
    const installTaskId = context.addTask(
      new NodePackageInstallTask({
        packageManager: "pnpm",
      })
    );
  };
}

export function initialize(options: Args): Rule {
  return async (tree: Tree, _: SchematicContext) => {
    const rules: Rule[] = [];
    const tplOpts = await getOptions(options);
    rules.push(cleanGenerator(tplOpts));
    rules.push(mergeWith(apply(empty(), [generateTemplate(tplOpts)]), MergeStrategy.Overwrite));
    rules.push(installPnpm(tplOpts));

    return chain(rules);
  };
}
