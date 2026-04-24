// tsx 로더용: Next.js server-only shim. ESM resolver 에 no-op 등록.
import Module from "node:module";
const origResolve = Module._resolveFilename.bind(Module);
Module._resolveFilename = function (req, ...rest) {
  if (req === "server-only") return req;
  return origResolve(req, ...rest);
};
const origLoad = Module._load.bind(Module);
Module._load = function (req, ...rest) {
  if (req === "server-only") return {};
  return origLoad(req, ...rest);
};
