var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
import { foo } from "./foo.js";

// src/bar.ts
function bar() {
  console.log("bar");
}
__name(bar, "bar");
export {
  bar,
  foo
};
