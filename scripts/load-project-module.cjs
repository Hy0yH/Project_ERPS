const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const taskRoot = path.resolve(__dirname, "..");
const localRequire = require("node:module").createRequire(path.join(taskRoot, "package.json"));
const ts = localRequire("typescript");

// Execute the project's TypeScript from a standalone read-only audit without a server or API writes.
module.exports = function createProjectLoader() {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} };
    cache.set(filename, mod);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText;
    const requireModule = (name) => {
      if (!name.startsWith("@/") && !name.startsWith(".")) return localRequire(name);
      const base = name.startsWith("@/") ? path.join(taskRoot, name.slice(2)) : path.resolve(path.dirname(filename), name);
      const resolved = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.cjs`]
        .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (!resolved) throw new Error(`Cannot resolve local audit module: ${name}`);
      return load(resolved);
    };
    vm.compileFunction(source, ["require", "module", "exports"], { filename })(requireModule, mod, mod.exports);
    return mod.exports;
  }
  return (relativePath) => load(path.resolve(taskRoot, relativePath));
};
