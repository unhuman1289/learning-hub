import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

test("lesson and notebook screens use the shared hand-drawn icons", () => {
  const app = new URL("../app/hub/", import.meta.url);
  const files = ["desk.tsx", "lesson-page.tsx", "notebook-view.tsx", "paper-bits.tsx", "paper-dialog.tsx", "study-meter.tsx"];
  for (const folder of ["notebook/", "lesson-v2/"]) {
    files.push(...readdirSync(new URL(folder, app), { recursive: true }).filter(path => /\.tsx?$/.test(path)).map(path => folder + path));
  }
  for (const file of files) assert.doesNotMatch(readFileSync(new URL(file, app), "utf8"), /lucide-react/, file);
  for (const file of ["app/home-client.tsx", "components/profile-controls.tsx"]) {
    assert.doesNotMatch(readFileSync(new URL("../" + file, import.meta.url), "utf8"), /lucide-react/, file);
  }
});
