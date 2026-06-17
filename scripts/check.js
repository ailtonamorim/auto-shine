const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const failures = [];

const htmlPages = [
  "index.html",
  "mapa.html",
  "perfil.html",
  "agendamento.html",
  "meus-agendamentos.html",
  "avaliacoes.html",
  "cadastro.html",
  "cadastro-dono.html",
  "admin.html",
  "termos.html",
  "privacidade.html",
  "favoritos.html",
  "login.html",
];

const requiredFiles = [
  "server.js",
  "database-admin.js",
  "package.json",
  "README.md",
  ".env.example",
  "assets/css/styles.css",
  "assets/js/app.js",
  "prisma/schema.prisma",
  "prisma/seed.js",
  ...htmlPages,
];

function fullPath(relativePath) {
  return path.join(rootDir, relativePath);
}

function logOk(message) {
  console.log(`[ok] ${message}`);
}

function logFail(message) {
  failures.push(message);
  console.error(`[erro] ${message}`);
}

function fileExists(relativePath) {
  return fs.existsSync(fullPath(relativePath));
}

function checkRequiredFiles() {
  requiredFiles.forEach((relativePath) => {
    if (fileExists(relativePath)) {
      logOk(`Arquivo encontrado: ${relativePath}`);
    } else {
      logFail(`Arquivo ausente: ${relativePath}`);
    }
  });
}

function runCommand(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    ...options,
  });

  if (result.status === 0) {
    logOk(label);
    return;
  }

  if (result.error) {
    logFail(`${label}\n${result.error.message}`);
    return;
  }

  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .trim();
  logFail(`${label}\n${output || `Comando falhou: ${command} ${args.join(" ")}`}`);
}

function checkJavaScriptSyntax() {
  ["server.js", "database-admin.js", "assets/js/app.js", "prisma/seed.js"].forEach((relativePath) => {
    if (!fileExists(relativePath)) return;
    runCommand(`Sintaxe JS valida: ${relativePath}`, process.execPath, ["--check", fullPath(relativePath)]);
  });
}

function checkPrismaSchema() {
  const prismaCli = path.join(rootDir, "node_modules", "prisma", "build", "index.js");
  if (!fileExists("node_modules/prisma/build/index.js")) {
    logFail("Prisma CLI não encontrado. Rode npm install antes de npm run check.");
    return;
  }

  runCommand("Schema Prisma valido", process.execPath, [prismaCli, "validate"], {
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || "file:./data/dev.db",
    },
    timeout: 90000,
  });
}

function shouldCheckReference(reference) {
  return (
    reference &&
    !reference.startsWith("#") &&
    !reference.startsWith("/") &&
    !reference.startsWith("http://") &&
    !reference.startsWith("https://") &&
    !reference.startsWith("mailto:") &&
    !reference.startsWith("tel:") &&
    !reference.startsWith("data:") &&
    !reference.startsWith("javascript:")
  );
}

function normalizeReference(page, reference) {
  const cleanReference = reference.split("#")[0].split("?")[0];
  if (!cleanReference || !shouldCheckReference(cleanReference)) return null;

  const pageDir = path.dirname(page);
  return path.normalize(path.join(pageDir === "." ? "" : pageDir, cleanReference)).replace(/\\/g, "/");
}

function checkHtmlReferences() {
  const referencePattern = /\b(?:href|src)=["']([^"']+)["']/gi;

  htmlPages.forEach((page) => {
    if (!fileExists(page)) return;

    const html = fs.readFileSync(fullPath(page), "utf8");
    const references = new Set();
    let match;

    while ((match = referencePattern.exec(html)) !== null) {
      const normalized = normalizeReference(page, match[1]);
      if (normalized) references.add(normalized);
    }

    references.forEach((reference) => {
      if (fileExists(reference)) {
        logOk(`Referencia local encontrada em ${page}: ${reference}`);
      } else {
        logFail(`Referencia local ausente em ${page}: ${reference}`);
      }
    });
  });
}

checkRequiredFiles();
checkJavaScriptSyntax();
checkPrismaSchema();
checkHtmlReferences();

if (failures.length) {
  console.error(`\n${failures.length} problema(s) encontrado(s).`);
  process.exit(1);
}

console.log("\nTudo certo.");
