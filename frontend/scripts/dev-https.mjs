import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "..");
const workspaceDir = path.resolve(frontendDir, "..");
const serverFile = path.join(workspaceDir, "server.js");
const nextBin = path.join(frontendDir, "node_modules", "next", "dist", "bin", "next");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function parseServerCerts() {
  if (!fs.existsSync(serverFile)) {
    return {};
  }

  const source = fs.readFileSync(serverFile, "utf8");
  const keyMatch = source.match(/key:\s*fs\.readFileSync\((['"`])(.+?-key\.pem)\1\)/);
  const certMatch = source.match(/cert:\s*fs\.readFileSync\((['"`])(.+?\.pem)\1\)/);

  return {
    key: keyMatch?.[2],
    cert: certMatch?.[2],
  };
}

function resolveIfPresent(targetPath) {
  if (!targetPath) {
    return null;
  }

  return path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(frontendDir, targetPath);
}

loadEnvFile(path.join(workspaceDir, ".env"));
loadEnvFile(path.join(frontendDir, ".env"));
loadEnvFile(path.join(frontendDir, ".env.local"));

const discovered = parseServerCerts();

const keyPath =
  resolveIfPresent('/Users/apple/Documents/DONTOPEN/NeuroCam/backend/172.27.126.200-key.pem') ??
  resolveIfPresent(discovered.key ? path.join("..", discovered.key) : null);

const certPath =
  resolveIfPresent('/Users/apple/Documents/DONTOPEN/NeuroCam/backend/172.27.126.200.pem') ??
  resolveIfPresent(discovered.cert ? path.join("..", discovered.cert) : null);

const caPath = resolveIfPresent(process.env.NEXT_DEV_HTTPS_CA);

if (!keyPath || !certPath) {
  console.error(
    "Could not determine the frontend HTTPS certificate paths. " +
      "Set NEXT_DEV_HTTPS_KEY and NEXT_DEV_HTTPS_CERT, or keep the cert filenames in server.js."
  );
  process.exit(1);
}

if (!fs.existsSync(keyPath)) {
  console.error(`HTTPS key file not found: ${keyPath}`);
  process.exit(1);
}

if (!fs.existsSync(certPath)) {
  console.error(`HTTPS cert file not found: ${certPath}`);
  process.exit(1);
}

const args = [
  nextBin,
  "dev",
  "--hostname",
  "0.0.0.0",
  "--port",
  "3000",
  "--experimental-https",
  "--experimental-https-key",
  keyPath,
  "--experimental-https-cert",
  certPath,
];

if (caPath) {
  if (!fs.existsSync(caPath)) {
    console.error(`HTTPS CA file not found: ${caPath}`);
    process.exit(1);
  }

  args.push("--experimental-https-ca", caPath);
}

console.log(`Starting Next.js over HTTPS with cert: ${certPath}`);
console.log(`Frontend: https://localhost:3000`);

const child = spawn(process.execPath, args, {
  cwd: frontendDir,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
