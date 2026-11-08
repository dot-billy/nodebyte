const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { test } = require("node:test");
const { parseForESLint, clearCaches } = require("@typescript-eslint/parser");

// Exercise the parser's project allowlist with the patched minimatch override.
test("typed linting accepts allowed config files and rejects files outside the project", () => {
  const root = mkdtempSync(join(tmpdir(), "nodebyte-lint-"));
  try {
    writeFileSync(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: { allowJs: true },
      include: ["included.ts"],
    }));
    writeFileSync(join(root, "included.ts"), "export const value: number = 1;\n");
    const parse = (name) => {
      const code = "const value = 1;\n";
      writeFileSync(join(root, name), code);
      return parseForESLint(code, {
        filePath: join(root, name),
        tsconfigRootDir: root,
        projectService: { allowDefaultProject: ["*.config.js"] },
      });
    };

    for (const name of ["eslint.config.js", ".hidden.config.js"]) {
      const result = parse(name);
      assert.ok(result.services.program.getSourceFile(join(root, name)));
      assert.equal(result.ast.body[0].type, "VariableDeclaration");
    }
    assert.throws(() => parse("unlisted.js"), /not found by the project service/);
  } finally {
    clearCaches();
    rmSync(root, { recursive: true, force: true });
  }
});
