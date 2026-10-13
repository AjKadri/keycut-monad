import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const commands = {
  "simulate-deploy": { target: "script/Deploy.s.sol:Deploy", broadcast: false },
  "simulate-approve": { target: "script/Approve.s.sol:Approve", broadcast: false },
  deploy: { target: "script/Deploy.s.sol:Deploy", broadcast: true },
  approve: { target: "script/Approve.s.sol:Approve", broadcast: true },
};
const command = process.argv[2];
const selected = commands[command];
if (!selected) throw new Error("Usage: node scripts/run-forge.mjs <simulate-deploy|deploy|simulate-approve|approve>");

const localEnv = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator < 1) throw new Error("Invalid line in .env.local");
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    }),
);

const rpcUrl = localEnv.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz";
if (!localEnv.MONAD_TESTNET_PRIVATE_KEY) throw new Error("MONAD_TESTNET_PRIVATE_KEY is missing from .env.local");

const result = spawnSync(
  "forge",
  [
    "script",
    selected.target,
    "--rpc-url",
    rpcUrl,
    ...(selected.broadcast ? ["--broadcast", "--slow"] : []),
  ],
  { env: { ...process.env, ...localEnv }, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
