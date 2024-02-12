var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
import { platform } from "@dumble-examples/cross-platform/adapter";
function foo() {
  return console.log(platform());
}
__name(foo, "foo");
export {
  foo
};
