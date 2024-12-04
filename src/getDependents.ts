#!/usr/bin/env tsx

import fs from "fs/promises";
import pc from "picocolors";
import * as readline from "readline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { fetchWithProgress } from "./utils/fetch-with-progress.ts";
import { Spinner } from "picospinner";
import semver from "semver";

const argv = await yargs(hideBin(process.argv))
  .option("number", {
    alias: "n",
    type: "number",
    description: "Number of dependents printed to stdout",
    default: Infinity,
  })
  .option("file", {
    alias: "f",
    description: "Write results as json to the specified file",
    type: "string",
  })
  .option("output", {
    alias: "o",
    description: "Output format",
    type: "string",
    default: "ci",
    choices: ["md", "ci", "json"],
  })
  .option("exclude", {
    alias: "e",
    description:
      "Exclude packages that include the specified string (can be comma separated)",
    type: "string",
  })
  .option("dev", {
    alias: "D",
    description: "Use devDependencies",
    type: "boolean",
  })
  .option("list", {
    alias: "l",
    description: "Only prints dependents as list to pipe into other commands",
    type: "boolean",
  })
  .option("recursive", {
    alias: "r",
    description: "Gets x dependents recursively and prints sub tables",
    type: "number",
    default: 3,
  })
  .option("depths", {
    alias: "d",
    description: "Number of recursion steps",
    type: "number",
    default: 0,
  })
  .option("accumulate", {
    alias: "a",
    description: "Accumulate recursive stats into topmost dependent",
    type: "boolean",
  })
  .option("quiet", {
    alias: "q",
    description: "Supress Package Info",
    type: "boolean",
  })
  .option("user", {
    alias: "u",
    description: "CouchDB user",
    type: "string",
  })
  .option("password", {
    alias: "p",
    description: "CouchDB password",
    type: "string",
  })
  .option("url", {
    alias: "U",
    description: "CouchDB URL",
    type: "string",
  })
  .help().argv;

const npmRegistryBaseUrl = "https://registry.npmmirror.com";
const localCouchdbUrl = argv.url;

if (!localCouchdbUrl) {
  console.error(pc.red("Please provide a CouchDB URL."));
  process.exit(1);
}

// const authHeader = "Basic " + Buffer.from("admin:admin").toString("base64");

const getAuthHeaders = (): { Authorization: string } | {} => {
  if (argv.user && argv.password) {
    return {
      Authorization:
        "Basic " +
        Buffer.from(`${argv.user}:${argv.password}`).toString("base64"),
    };
  }
  return {};
};

interface NpmPackageInfo {
  name: string;
  version: string;
  description?: string;
  homepage?: string;
  devDependencies?: Record<string, string>;
  repository?: {
    type: string;
    url: string;
  };
  dist?: {
    tarball: string;
    size: number;
  };
}

interface LocalDependendsResponseDev {
  total_rows: number;
  offset: number;

  rows: {
    id: string;
    key: string;
    value: string;
  }[];
}

interface LocalDependendsResponseProd {
  total_rows: number;
  offset: number;

  rows: {
    id: string;
    key: string;
    value: { name: string; version: string };
  }[];
}

interface DependentPackage {
  name: string;
  description?: string;
  maintainers?: {
    name: string;
  }[];
  distTags?: {
    latest: string;
  };
  lastPublish?: {
    maintainer: string;
    time: string;
  };
  version?: string;
}

function formatDownloads(downloads: number): string {
  if (downloads >= 1_000_000) return `${(downloads / 1_000_000).toFixed(2)}M`;
  if (downloads >= 1_000) return `${(downloads / 1_000).toFixed(2)}k`;
  return downloads.toString();
}

function formatTraffic(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(2)} KB`;
  return `${bytes} bytes`;
}

async function fetchPackageInfo(
  packageName: string,
  version = "latest"
): Promise<NpmPackageInfo | null> {
  const url = `${npmRegistryBaseUrl}/${packageName}/${version}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = (await response.json()) as NpmPackageInfo;
    return data;
    // eslint-disable-next-line
  } catch (_e) {
    return null;
  }
}

async function fetchDependents(
  packageName: string,
  dev = false,
  quiet = false
) {
  const deps = dev ? "dev-dependencies" : "dependents2";
  const url = `${localCouchdbUrl}/_design/dependents/_view/${deps}?key="${packageName}"`;

  const spinner = new Spinner("Fetching dependent packages...");

  if (!quiet) {
    spinner.start();
  }

  const response = await fetch(url, {
    headers: {
      ...getAuthHeaders(),
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      console.error(
        pc.red(
          `Please supply username and password with --user and --password.`
        )
      );
    }
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const data = (await response.json()) as
    | LocalDependendsResponseDev
    | LocalDependendsResponseProd;

  if (!quiet) {
    spinner.succeed(
      pc.bold(pc.cyan(`Fetched ${data.rows.length} dependents.`))
    );
  }

  if (data.rows.length && typeof data.rows[0].value === "string") {
    return data.rows.map((p) => {
      return {
        ...p,
        value: {
          name: p.id,
          version: "",
        },
      };
    });
  }

  return data.rows as LocalDependendsResponseProd["rows"];
}

async function fetchDownloadStats(packageNames: string[], quiet = false) {
  type Stats = {
    total_rows: number;
    offset: number;
    rows: { id: string; key: string; value: number }[];
  };

  let spinner = quiet ? null : new Spinner("Fetching download stats...");
  spinner?.start();

  const sizes = packageNames.map(
    (name) => `{ "id": "${name}", "key": "${name}", "value": 00000000 }`.length
  );
  const totalSizes = sizes.reduce((a, b) => a + b, 0);
  const overhead = `{total_rows: 00000, offset: 0000, rows: []}`.length;
  const total = (totalSizes + overhead) * 0.88; // Yes this is a really bad approximation based on tests

  const response = await fetchWithProgress<Stats>(
    `${localCouchdbUrl}/_design/downloads/_view/downloads`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ keys: packageNames }),
      onProgress: quiet
        ? undefined
        : (curr) => {
            spinner?.stop();
            spinner = null;
            showProgress(
              curr,
              total,
              `Fetching download stats for ${packageNames.length} packages`
            );
          },
    }
  );

  const docs = response.rows.map((row) => [row.key, row.value]);

  return Object.fromEntries(docs);
}

function showProgress(current: number, total: number, message: string): void {
  const percentage = Math.min(Math.round((current / total) * 100), 100);
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(
    `${pc.cyan(
      `[${"=".repeat(percentage / 5)}${" ".repeat(20 - percentage / 5)}]`
    )} ${percentage}% - ${message}`
  );
}

const getnameAndVersion = (
  inputPackage: string
): [string, string | undefined] => {
  const scoped = inputPackage.startsWith("@");

  let [packageName, version] = inputPackage.split("@") as [
    string,
    string | undefined
  ];

  if (scoped) {
    const atPosition = inputPackage.lastIndexOf("@");
    if (atPosition === 0) {
      packageName = inputPackage;
      version = undefined;
    } else {
      packageName = inputPackage.slice(0, atPosition);
      version = inputPackage.slice(atPosition + 1);
    }
  }

  return [packageName, version];
};

type Results = {
  name: string;
  downloads: number;
  traffic: number;
  isDevDependency: boolean;
  children: Results[];
  version: string;
};

function printOutput(results: Results[], spaces = "") {
  results = results
    .filter(filterExcludes)
    .slice(0, argv.number)
    .slice(0, argv.depths ? argv.recursive || Infinity : Infinity);

  const maxIndexWidth = results.length.toString().length; // Width for indices

  const downloadsFormatted = results.map((p) => formatDownloads(p.downloads));
  const trafficFormatted = results.map((p) => formatTraffic(p.traffic));
  const maxDownloadsWidth = downloadsFormatted.reduce(
    (a, b) => Math.max(a, b.length),
    0
  );
  const maxTrafficWidth = trafficFormatted.reduce(
    (a, b) => Math.max(a, b.length),
    0
  );

  const maxNameWidth = results.reduce((a, b) => Math.max(a, b.name.length), 0);

  const maxVersionWidth = Math.min(
    results.reduce((a, b) => Math.max(a, b.version.length), 0),
    10
  );

  results.forEach((pkg, index) => {
    const indexStr = `${index + 1}`.padEnd(maxIndexWidth);
    const downloadsStr = formatDownloads(pkg.downloads).padStart(
      maxDownloadsWidth
    );
    const trafficStr = pkg.traffic
      ? formatTraffic(pkg.traffic).padStart(maxTrafficWidth)
      : "".padStart(maxTrafficWidth);
    const nameStr = pkg.name.padEnd(maxNameWidth);
    const versionStr = pkg.version.slice(0, 10).padEnd(maxVersionWidth);
    const npmLink = `https://npmjs.com/${pkg.name}`;

    if (argv.output === "md") {
      console.log(
        `| ${indexStr} | ${downloadsStr} | ${trafficStr} | ${versionStr} | [${pkg.name}](https://npmjs.com/${pkg.name}) |`
      );
    } else {
      console.log(
        spaces,
        `${pc.green(`#${indexStr}`)} ${pc.magenta(downloadsStr)} ⬇️ , ${pc.red(
          trafficStr
        )} - ${pc.yellow(nameStr)} ${pc.blue(versionStr)} ${npmLink}`
      );

      if (pkg.children.length > 0) {
        printOutput(pkg.children, spaces + "  ");
      }
    }
  });
}

function accumulateStats(result: Results): number {
  return (
    result.children.reduce((a, b) => a + accumulateStats(b), 0) +
    result.downloads
  );
}

const filterExcludes = (pkg: DependentPackage) =>
  argv.exclude?.split(",").every((ex) => !pkg.name.includes(ex)) ?? true;

async function main(inputPackage: string, depths = 0, quiet = false) {
  const [packageName, version] = getnameAndVersion(inputPackage);

  const packageInfo = await fetchPackageInfo(packageName, version);

  if (!packageInfo) {
    console.error(pc.red(`Failed to fetch package info for ${packageName}`));
    if (argv.recursive && argv.depths !== depths) {
      return [];
    }
    process.exit();
  }

  const actualVersion = packageInfo.version;
  const homepage = packageInfo.homepage || "No homepage found";

  if (!argv.list && !quiet) {
    console.log(pc.bold(pc.cyan("Package Info:")));
    console.log(
      `${pc.green("Name:")} ${pc.yellow(packageInfo.name)} (${pc.magenta(
        actualVersion
      )})\n` +
        `${pc.green("Homepage:")} ${pc.blue(homepage)}\n` +
        `${pc.green("Unpacked Size:")} ${pc.yellow(
          formatTraffic(packageInfo.dist?.size ?? 0)
        )}`
    );
  }

  const dependentsWithVersion = await fetchDependents(
    packageName,
    argv.dev,
    quiet || argv.list
  );

  const dependents = dependentsWithVersion.filter((dependent) => {
    return (
      // Dont filter when no version was given
      !version || semver.satisfies(actualVersion, dependent.value.version)
    );
  });

  if (argv.list) {
    dependents.forEach((d) => {
      console.log(d.value);
    });
    return;
  }

  const downloadStats = await fetchDownloadStats(
    dependents.map((p) => p.value.name),
    quiet
  );

  const results = dependents.map((dep): Results => {
    const downloads = downloadStats[dep.value.name] ?? 0;
    const traffic = downloads * (packageInfo.dist?.size ?? 0);

    return {
      name: dep.value.name,
      version: dep.value.version,
      downloads,
      traffic,
      isDevDependency: argv.dev ?? false,
      children: [],
    };
  });

  if (!quiet) {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
  }

  results.sort((a, b) => b.downloads - a.downloads);

  let topResults = results;
  if (argv.recursive && depths) {
    topResults = await Promise.all(
      results
        .filter(filterExcludes)
        .slice(0, argv.recursive)
        .map(async (r) => {
          const recursiveResults = await main(r.name, depths - 1, true);
          r.children = recursiveResults!;
          return r;
        })
    );
  }

  if (depths !== argv.depths) {
    return topResults;
  }

  if (argv.file) {
    await fs.writeFile(argv.file, JSON.stringify(results, null, 2), "utf-8");
  }

  if (!quiet) {
    console.log(pc.bold(pc.cyan("\nDependents sorted by downloads:")));
  }

  if (argv.accumulate) {
    topResults.forEach((result) => {
      result.downloads = accumulateStats(result);
      result.traffic = result.downloads * (packageInfo.dist?.size ?? 0);
      result.children = [];
    });

    topResults = topResults.sort((a, b) => b.downloads - a.downloads);
  }

  if (argv.output === "json") {
    console.log(
      JSON.stringify(
        topResults.filter(filterExcludes).slice(0, argv.number),
        null,
        2
      )
    );
  } else {
    if (argv.output === "md") {
      console.log(
        `| # | Downloads | Traffic | Version | Package |\n|---|---|---|---|---|`
      );
    }

    printOutput(topResults);
  }
}

const inputPackage = argv._[0] as string;

if (!inputPackage) {
  console.error(pc.red("Please provide a package name as the first argument."));
  process.exit(1);
}

main(inputPackage, argv.depths, argv.quiet).catch(console.error);
