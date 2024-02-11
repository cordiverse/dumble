var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/foo.ts
function foo() {
  console.log("foo");
}
__name(foo, "foo");

// src/bar.ts
function bar() {
  console.log("bar");
}
__name(bar, "bar");

// src/bin.ts
foo();
bar();
