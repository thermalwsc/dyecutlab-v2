import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { START_PROJECT_HREF } from "../lib/contact.ts";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

test("every 'Start your project' link points at the AI chat", () => {
  assert.equal(START_PROJECT_HREF, "/app");
});

test("no page links to the retired /start form", () => {
  /* the form's own folder is excluded: it is kept but no longer reachable */
  const files = [...sourceFiles("app"), ...sourceFiles("lib")].filter((file) => !file.replace(/\\/g, "/").startsWith("app/start/"));
  assert.ok(files.length > 20);

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.ok(!/["'`]\/start(["'`?#/])/.test(text), `${file} still links to /start, use START_PROJECT_HREF`);
  }
});

test("/start is redirected to the chat", () => {
  const config = readFileSync("next.config.ts", "utf8");
  assert.match(config, /source:\s*"\/start"/);
  assert.match(config, /destination:\s*"\/app"/);
});
