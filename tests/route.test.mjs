import test from "node:test";
import assert from "node:assert/strict";
import { parseRoute, routeHref } from "../app/hub/use-route.ts";
import { lessons } from "../app/content.ts";

const id = "sub_1234567890abcdefabcd";
test("old notebook link opens Today and named pages round trip", () => {
  assert.deepEqual(parseRoute("?sach=" + id), { view: "book", id, page: "hom-nay" });
  for (const page of ["muc-luc", "hom-nay", "tien-do", "cai-dat"]) {
    const route = { view: "book", id, page };
    assert.deepEqual(parseRoute(routeHref(route).slice(1)), route);
  }
});
test("direct lesson links and legacy notebook routes still open", () => {
  assert.deepEqual(parseRoute("?bai2=les_00000000000000000005"), { view: "lesson", id: "les_00000000000000000005" });
  assert.deepEqual(parseRoute("?so=Deutsch&tab=muc-luc"), { view: "notebook", track: "Deutsch", tab: "muc-luc", page: undefined });
  const first = lessons[0];
  assert.deepEqual(parseRoute("?lesson=" + first.id), { view: "notebook", track: first.track, tab: "bai", page: first.id });
});

test("a desk correction link opens the lesson in correction mode", () => {
  const route = { view: "lesson", id: "les_00000000000000000005", correction: true };
  assert.deepEqual(parseRoute(routeHref(route).slice(1)), route);
});
