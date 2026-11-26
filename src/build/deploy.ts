// npm run deploy [-- <target>]: builds the site and publishes it to
// Cloudflare Pages, as secrets/cloudflare.env names it, or with a target as
// secrets/cloudflare.<target>.env does (secrets/README.md says why and how).

import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { resolveTrailDir } from "./trail.ts";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(srcDir, "..");
const secretsDir = join(repoRoot, "secrets");
const wrangler = join(srcDir, "node_modules", "wrangler", "bin", "wrangler.js");

const fail = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};
const read = (file: string) => {
  if (!existsSync(file)) fail(`No ${file}: secrets/README.md says what goes into it.`);
  return parseEnv(readFileSync(file, "utf8"));
};

const args = process.argv.slice(2);
if (args.length > 1 || (args[0] !== undefined && !/^[a-z0-9][a-z0-9-]*$/.test(args[0])))
  fail(`Usage: npm run deploy [-- <target>], a target being the <target> of secrets/cloudflare.<target>.env.`);
const credentials = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"];
const target = ["CLOUDFLARE_PAGES_PROJECT", "THEMENWEG_TRAIL"];
const baseFile = join(secretsDir, "cloudflare.env");
const targetFile = args[0] ? join(secretsDir, `cloudflare.${args[0]}.env`) : baseFile;
const base = read(baseFile);
// A target's file names the project and the trail on its own; only the
// credentials come from cloudflare.env, so a target never inherits where
// the default deploy goes.
const values = targetFile === baseFile ? base : { ...pick(base, credentials), ...pick(read(targetFile), target) };
for (const v of credentials) if (!values[v]) fail(`${v} is not set in ${baseFile} (secrets/README.md).`);
if (!values.CLOUDFLARE_PAGES_PROJECT) fail(`CLOUDFLARE_PAGES_PROJECT is not set in ${targetFile} (secrets/README.md).`);

// The files alone decide where the site goes and which trail it is: values
// these names have in the shell, left from other work, are dropped.
for (const v of [...credentials, ...target]) delete process.env[v];
Object.assign(process.env, values);
const project = values.CLOUDFLARE_PAGES_PROJECT as string;

function pick(env: NodeJS.Dict<string>, names: string[]) {
  return Object.fromEntries(names.filter((n) => env[n]).map((n) => [n, env[n]]));
}

let trailDir = "";
try {
  trailDir = resolveTrailDir(repoRoot);
} catch (e) {
  fail(`${(e as Error).message} (THEMENWEG_TRAIL is read from ${targetFile} here)`);
}
console.log(`${trailDir} to the Pages project "${project}" (${targetFile})`);

const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) fail(`git ${args.join(" ")} in ${cwd} failed: ${r.stderr || r.error?.message}`);
  return r.stdout.trimEnd();
};
for (const dir of [srcDir, trailDir]) {
  const changes = git(dir, "status", "--porcelain", "--", ".");
  if (changes) fail(`Uncommitted changes in ${dir}; only committed work is deployed:\n${changes}`);
}
const commit = git(repoRoot, "rev-parse", "HEAD");

const run = (label: string, cmd: string, args: string[], opts: SpawnSyncOptions = {}) => {
  console.log(`\n=== ${label}`);
  const r = spawnSync(cmd, args, { cwd: srcDir, stdio: "inherit", ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
// npm is npm.cmd on Windows, which only a shell starts.
run("Check", "npm run check", [], { shell: true });
run("Build", "npm run build", [], { shell: true });

console.log(`\n=== Pages project "${project}"`);
const list = spawnSync(process.execPath, [wrangler, "pages", "project", "list", "--json"], { cwd: srcDir, encoding: "utf8" });
let projects: Record<string, string>[] = [];
try {
  projects = JSON.parse(list.stdout);
} catch {
  fail(`Couldn't read the account's Pages projects:\n${list.stdout}${list.stderr}`);
}
if (!projects.some((p) => (p["Project Name"] ?? p.name) === project)) {
  // Without --force (not in its --help), wrangler 4.158 hands the creation to
  // Workers, which fails on a site without a Worker entry point.
  run("Creating it", process.execPath, [wrangler, "pages", "project", "create", project, "--production-branch", "main", "--force"]);
}
run(`Deploying ${trailDir} at ${commit.slice(0, 7)}`, process.execPath, [
  wrangler, "pages", "deploy", "dist", "--project-name", project, "--branch", "main", "--commit-dirty=true",
]);
console.log(`\nDone: https://${project}.pages.dev, unless Cloudflare gave the project another address (above, and in its dashboard).`);
