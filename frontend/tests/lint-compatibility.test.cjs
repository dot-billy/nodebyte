const assert = require("node:assert/strict");
const { join } = require("node:path");
const { test } = require("node:test");
const { ESLint } = require("eslint");

const cwd = join(__dirname, "..");

test("lint parser resolves configured and inline globals with ESLint 10", async () => {
  const eslint = new ESLint({ cwd, overrideConfig: { rules: { "no-undef": "error" } } });
  const [result] = await eslint.lintText(
    "/* global customGlobal */\nconsole.log(customGlobal, window.location);\n",
    { filePath: "src/lint-globals-check.js" },
  );
  assert.equal(result.errorCount, 0, JSON.stringify(result.messages));
});

test("React hook correctness rules still reject conditional hooks", async () => {
  const eslint = new ESLint({ cwd });
  const [result] = await eslint.lintText(
    'import { useState } from "react";\nexport default function Example({ enabled }: { enabled: boolean }) {\n  if (enabled) { useState(0); }\n  return <div />;\n}\n',
    { filePath: "src/lint-hooks-check.tsx" },
  );
  assert.ok(result.messages.some((m) => m.ruleId === "react-hooks/rules-of-hooks" && m.severity === 2), JSON.stringify(result.messages));
});

test("lint glob matching includes source and excludes build output", async () => {
  const eslint = new ESLint({ cwd });
  assert.equal(await eslint.isPathIgnored(join(cwd, "src/app/page.tsx")), false);
  assert.equal(await eslint.isPathIgnored(join(cwd, ".next/server/app/page.js")), true);
  assert.equal(await eslint.isPathIgnored(join(cwd, "out/index.js")), true);
});
