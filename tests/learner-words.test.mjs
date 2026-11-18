import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { words } from "../app/hub/words.ts";

test("shared learner copy is nonempty and short", () => {
  for (const [group, entries] of Object.entries(words)) for (const [key, value] of Object.entries(entries)) {
    assert.ok(value.trim(), group + "." + key);
    assert.ok(value.length <= 80 || key === "long", group + "." + key);
  }
});

test("learner surfaces keep technical terms out of visible copy", () => {
  const blocked = /máy chấm|máy soạn|máy chủ|\bHub\b|\bplanner\b|\bPrompt\b|lộ trình|lượt soạn|lượt chấm|phiên bản|định danh|Hủy|tùy|của tôi|\bmình\b/iu;
  const ignored = new Set(["pages.tsx", "ai-jobs-panel.tsx", "run-status.tsx", "import-panel.tsx", "tutor.tsx"]);
  const files = ["app/hub", "components"].flatMap(dir =>
    readdirSync(dir, { recursive: true }).filter(file => file.endsWith(".tsx") && !ignored.has(file.split("/").at(-1))).map(file => dir + "/" + file));
  files.push("lib/today.ts", "lib/household.ts");
  const matches = [];
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = node => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
      if (ts.isJsxText(node) || ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateTail(node) || ts.isTemplateMiddle(node)) {
        const value = node.text.trim();
        // This literal is an old document-title prefix stripped before display.
        if (value !== "Learning Hub —" && blocked.test(value)) matches.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${value}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(matches, []);
});
