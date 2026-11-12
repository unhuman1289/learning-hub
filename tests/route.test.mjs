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

test("an old notebook address opens the book of the same track, except documents and single v1 lessons", async () => {
  const { bookForLegacy } = await import("../app/hub/legacy-route.ts");
  const subjects = [{ id, legacyTrack: "Deutsch" }, { id: "sub_other00000000000000", legacyTrack: null }];
  const old = (tab, page) => ({ view: "notebook", track: "Deutsch", tab, page });
  assert.deepEqual(bookForLegacy(old("bai"), subjects), { view: "book", id, page: "hom-nay" });
  assert.deepEqual(bookForLegacy(old("muc-luc"), subjects), { view: "book", id, page: "muc-luc" });
  assert.deepEqual(bookForLegacy(old("muc-tieu"), subjects), { view: "book", id, page: "cai-dat" });
  assert.equal(bookForLegacy(old("tai-lieu"), subjects), null);
  assert.equal(bookForLegacy(old("bai", "some-v1-lesson"), subjects), null);
  assert.equal(bookForLegacy({ view: "notebook", track: "AI", tab: "bai" }, subjects), null);
  assert.equal(bookForLegacy(old("bai"), null), null);
  assert.equal(bookForLegacy({ view: "desk" }, subjects), null);
});
