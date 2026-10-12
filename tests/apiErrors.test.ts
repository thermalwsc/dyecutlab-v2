import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/* A guard against a mistake that is easy to make again: sending a raw database,
   OpenAI or server error back to the browser. Errors belong in the server log;
   the customer gets a plain sentence. This scans every API route. */

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...routeFiles(path));
    else if (name === "route.ts") out.push(path);
  }
  return out;
}

const files = routeFiles("app/api");

test("there are API routes to check", () => {
  assert.ok(files.length >= 8, `found only ${files.length} routes`);
});

test("no route returns a database error message to the browser", () => {
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.ok(!/details:\s*[A-Za-z]+\.message/.test(text), `${file} returns a raw error in "details"`);
  }
});

test("no route returns error.message from a catch block", () => {
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.ok(
      !/error instanceof Error\s*\?\s*error\.message/.test(text),
      `${file} sends error.message to the browser`
    );
  }
});

test("no route tells the browser which environment variable is missing", () => {
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.ok(!/error:\s*["'`][^"'`]*(\.env|_API_KEY|SERVICE_ROLE)/i.test(text), `${file} mentions a secret or env name in a response`);
  }
});

test("every project route that handles chat or files blocks factories and signed-out users", () => {
  for (const file of files) {
    if (!file.includes("projects") && !file.includes("baba")) continue;
    const text = readFileSync(file, "utf8");
    assert.ok(text.includes("unauthorized()"), `${file} must reject signed-out callers`);
    assert.ok(text.includes('role === "factory"'), `${file} must reject factory accounts`);
  }
});
