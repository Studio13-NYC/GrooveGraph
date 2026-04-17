import { test } from "node:test";
import assert from "node:assert/strict";

test("basic sanity", () => {
  assert.equal(typeof "groovegraph", "string");
});
