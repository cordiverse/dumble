var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var map = {
  foo: () => import("./components/foo.js"),
  bar: () => import("./components/bar.js")
};
function load(name) {
  return map[name]();
}
__name(load, "load");
export {
  load as default
};
