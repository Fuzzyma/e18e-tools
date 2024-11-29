#!/usr/bin/env tsx

import pc from "picocolors";
import fs from "fs";
import path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const argv = await yargs(hideBin(process.argv))
  .option("format", {
    alias: "f",
    type: "string",
    description: "Output format",
    default: "ci",
    choices: ["md", "ci"],
  })
  .option("number", {
    alias: "n",
    type: "number",
    description: "Number of dependents to display",
    default: Infinity,
  })
  .help().argv;

interface DependentPackage {
  name: string;
  downloads: number;
  traffic?: number;
  isDevDependency: boolean;
  error: boolean;
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

async function main() {
  const fileName = argv._[0] as string;

  if (!fileName) {
    console.error(pc.red("Please provide a filename as the first argument."));
    process.exit(1);
  }

  let topResults: DependentPackage[] = [];

  // check if file is json file and read it as json
  if (path.extname(fileName) === ".json") {
    topResults = JSON.parse(fs.readFileSync(fileName, "utf-8"));
  }

  if (argv.format === "md") {
    console.log(`| # | Downloads | Traffic | Package |\n|---|---|---|---|`);
  }

  const maxIndexWidth = topResults.length.toString().length; // Width for indices

  const downloadsFormatted = topResults.map((p) =>
    formatDownloads(p.downloads)
  );
  const trafficFormatted = topResults.map((p) => formatTraffic(p.traffic ?? 0));
  const maxDownloadsWidth = downloadsFormatted.reduce(
    (a, b) => Math.max(a, b.length),
    0
  );
  const maxTrafficWidth = trafficFormatted.reduce(
    (a, b) => Math.max(a, b.length),
    0
  );

  const maxNameWidth = topResults.reduce(
    (a, b) => Math.max(a, b.name.length),
    0
  );

  topResults.slice(0, argv.number).forEach((pkg, index) => {
    const indexStr = `${index + 1}`.padEnd(maxIndexWidth);
    const downloadsStr = formatDownloads(pkg.downloads).padStart(
      maxDownloadsWidth
    );
    const trafficStr = pkg.traffic
      ? formatTraffic(pkg.traffic).padStart(maxTrafficWidth)
      : "".padStart(maxTrafficWidth);
    const nameStr = pkg.name.padEnd(maxNameWidth);
    const npmLink = `https://npmjs.com/${pkg.name}`;

    if (argv.format === "md") {
      console.log(
        `| ${indexStr} | ${downloadsStr} | ${trafficStr} | [${pkg.name}](https://npmjs.com/${pkg.name}) |`
      );
    } else {
      console.log(
        `${pc.green(`#${indexStr}`)} ${pc.magenta(downloadsStr)} ⬇️ , ${pc.red(
          trafficStr
        )} - ${pc.yellow(nameStr)} ${npmLink}`
      );
    }
  });
}

main();
