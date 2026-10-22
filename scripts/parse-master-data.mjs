import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const source = readFileSync(join(root, "docs", "master-data.md"), "utf8");

const companies = [];
let company = null;
let project = null;
let plaza = null;

function cleanName(value) {
  return value
    .split("/")
    .map((part) =>
      part
        .replace(/\s*\([^)]*\)\s*$/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function pushManager(line) {
  const match = line.match(
    /^(Toll Mananger|Toll Manager|Maintenance Manager|Corridor Manager):\s*(.*)$/i,
  );
  if (!match) return false;
  if (!plaza) throw new Error(`Manager outside plaza: ${line}`);
  const role = match[1].toLowerCase();
  const names = cleanName(match[2]);
  if (role.startsWith("toll")) plaza.toll.push(...names);
  else if (role.startsWith("maintenance")) plaza.maintenance.push(...names);
  else plaza.corridor.push(...names);
  return true;
}

for (const rawLine of source.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line) continue;

  const companyMatch = line.match(/^###\s+(.+)$/);
  if (companyMatch) {
    company = { name: companyMatch[1].trim(), code: "", projects: [] };
    companies.push(company);
    project = null;
    plaza = null;
    continue;
  }

  const projectMatch = line.match(
    /^#####\s+\d+\\?\.\s+(.+?)\s+\\?\[(.+?)\]$/,
  );
  if (projectMatch) {
    if (!company) throw new Error(`Project before company: ${line}`);
    project = {
      name: projectMatch[1].trim(),
      code: projectMatch[2].trim(),
      state: "",
      round: 1,
      pms: [],
      plazas: [],
    };
    company.projects.push(project);
    plaza = null;
    continue;
  }

  if (!project) continue;

  const stateMatch = line.match(/^State:\s*(.+)$/i);
  if (stateMatch) {
    project.state = stateMatch[1].trim();
    continue;
  }

  const roundMatch = line.match(/^Round:\s*(\d+)$/i);
  if (roundMatch) {
    project.round = Number(roundMatch[1]);
    continue;
  }

  const pmMatch = line.match(/^Project Manager:\s*(.*)$/i);
  if (pmMatch) {
    project.pms.push(...cleanName(pmMatch[1]));
    continue;
  }

  const plazaMatch = line.match(/^[a-z]\.\s+(.+?)\s+\\?\[([\d.]+)\]$/);
  if (plazaMatch) {
    plaza = {
      name: plazaMatch[1].trim(),
      lengthKm: Number(plazaMatch[2]),
      toll: [],
      maintenance: [],
      corridor: [],
    };
    project.plazas.push(plaza);
    continue;
  }

  if (pushManager(line)) continue;
}

const companyCodes = new Map([
  ["NHIT Eastern Projects Private Limited", "NEPPL"],
  ["NHIT Southern Projects Private Limited", "NSPPL"],
  ["NHIT Western Projects Private Limited", "NWPPL"],
]);
for (const c of companies) {
  c.code = companyCodes.get(c.name) ?? c.name.replace(/[^A-Z]/g, "").slice(0, 8);
}

const fieldNames = new Set();
for (const c of companies) {
  for (const p of c.projects) {
    for (const n of p.pms) fieldNames.add(n);
    for (const z of p.plazas) {
      for (const n of [...z.toll, ...z.maintenance, ...z.corridor]) {
        fieldNames.add(n);
      }
    }
  }
}

const projectCount = companies.reduce((n, c) => n + c.projects.length, 0);
const plazaCount = companies.reduce(
  (n, c) => n + c.projects.reduce((m, p) => m + p.plazas.length, 0),
  0,
);

console.log({
  companies: companies.length,
  projects: projectCount,
  plazas: plazaCount,
  fieldNames: fieldNames.size,
});

const banner = `// Generated from docs/master-data.md by scripts/parse-master-data.mjs.
// Do not hand-edit this file. Re-run the script after changing the master data.

`;

const body = `export type MasterPlaza = {
  name: string;
  lengthKm: number;
  toll: string[];
  maintenance: string[];
  corridor: string[];
};

export type MasterProject = {
  name: string;
  code: string;
  state: string;
  round: 1 | 2 | 3 | 4;
  pms: string[];
  plazas: MasterPlaza[];
};

export type MasterCompany = {
  name: string;
  code: string;
  projects: MasterProject[];
};

export const MASTER_COMPANIES: MasterCompany[] = ${JSON.stringify(companies, null, 2)};
`;

writeFileSync(join(root, "prisma", "master-data.ts"), banner + body, "utf8");
console.log("Wrote prisma/master-data.ts");
