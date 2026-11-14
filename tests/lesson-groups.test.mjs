import test from "node:test";
import assert from "node:assert/strict";
import { lessonGroups } from "../app/hub/lesson/groups.ts";

const short = { input: "short", attachment: "none", prompt: "Điền từ còn thiếu." };
const choice = { ...short, input: "choice", choices: [{ text: "am Montag" }, { text: "um Montag" }] };

test("short exercises stay in order around standalone reading and extended work", () => {
  assert.deepEqual(lessonGroups([
    short, choice, short, short,
    { ...short, instructions: "Đọc thông báo sau. ".repeat(24) },
    choice, short,
    { ...short, input: "table" },
    { ...short, input: "long" },
    { ...short, attachment: "required" },
  ]), [[1, 2, 3], [4], [5], [6, 7], [8], [9], [10]]);
});
