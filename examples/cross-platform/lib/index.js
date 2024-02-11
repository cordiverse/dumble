var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
import { platform as platform2 } from "@dunble-examples/cross-platform/adapter";
function foo() {
  return console.log(platform());
}
__name(foo, "foo");
export {
  foo,
  platform2 as platform
};
