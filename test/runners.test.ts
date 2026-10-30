// The box-side model runners, driven with a stub `ai` so no model is called.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const scripts = join(repo, "scripts", "round7");
const posts = [{ id: "1", username: "a", text: "AI is not conscious." }, { id: "2", username: "b", text: "Maybe it is." }];

/** A stub `ai` that logs each call and then runs `body`. */
function stub(dir: string, body: string): { bin: string; calls: () => number } {
  const log = join(dir, "calls.log");
  const bin = join(dir, "ai-stub");
  writeFileSync(bin, `#!/usr/bin/env bash\necho call >> "${log}"\n${body}\n`);
  chmodSync(bin, 0o755);
  return { bin, calls: () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").length : 0) };
}
const env = (bin: string, extra: Record<string, string> = {}) => {
  const e: Record<string, string> = { ...(process.env as Record<string, string>), AI_BIN: bin, RUN_RETRY_SLEEP: "0", ...extra };
  delete e.AI_GATEWAY_API_KEY;
  return e;
};
const lines = (f: string) => readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);

for (const [runner, group, questions] of [["run_r5.py", "core", "questions_r5.json"], ["run_r6.py", "stance4", "questions_r6.json"], ["run_r7x.py", "use", "questions_r7.json"]] as const) {
  test(`${runner}: a call that times out is retried, then recorded as an error, and the run carries on`, () => {
    const dir = mkdtempSync(join(tmpdir(), "runner-"));
    copyFileSync(join(scripts, runner), join(dir, runner));
    copyFileSync(join(repo, "data", questions), join(dir, questions));
    writeFileSync(join(dir, "posts.jsonl"), posts.map((p) => JSON.stringify(p)).join("\n") + "\n");
    const s = stub(dir, "sleep 5");
    const out = join(dir, "out.jsonl");
    const r = spawnSync("python3", [join(dir, runner), group, "stub/model", join(dir, "posts.jsonl"), out], { env: env(s.bin, { RUN_CALL_TIMEOUT: "0.2" }), encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const got = lines(out);
    assert.deepEqual(got.map((x) => x.id).sort(), ["1", "2"], "every post gets a record");
    for (const x of got) assert.equal(x.error, "timeout after 0.2s");
    assert.equal(s.calls(), 8, "four attempts per post");
  });
}

/** Lays out the shell runner's working tree in a temp dir, as on the box. */
function shellTree(script: "run_r7x.sh" | "run_r7.sh"): string {
  const root = mkdtempSync(join(tmpdir(), "runsh-"));
  const jsonl = posts.slice(0, 1).map((p) => JSON.stringify(p)).join("\n") + "\n";
  if (script === "run_r7x.sh") {
    const d = join(root, "round7");
    mkdirSync(join(d, "raw"), { recursive: true });
    for (const f of ["run_r7x.sh", "run_r7x.py"]) copyFileSync(join(scripts, f), join(d, f));
    copyFileSync(join(repo, "data", "questions_r7.json"), join(d, "questions_r7.json"));
    writeFileSync(join(d, "posts_r7.jsonl"), jsonl);
  } else {
    for (const r of ["round5", "round6", "round7"]) mkdirSync(join(root, r, "raw"), { recursive: true });
    copyFileSync(join(scripts, "run_r7.sh"), join(root, "round7", "run_r7.sh"));
    copyFileSync(join(scripts, "run_r5.py"), join(root, "round5", "run_r5.py"));
    copyFileSync(join(scripts, "run_r6.py"), join(root, "round6", "run_r6.py"));
    copyFileSync(join(repo, "data", "questions_r5.json"), join(root, "round5", "questions_r5.json"));
    copyFileSync(join(repo, "data", "questions_r6.json"), join(root, "round6", "questions_r6.json"));
    writeFileSync(join(root, "round5", "posts_r5.jsonl"), jsonl);
  }
  return root;
}

test("run_r7x.sh: an all-error group is set aside and retried, and the next group still runs", () => {
  const root = shellTree("run_r7x.sh");
  const s = stub(root, 'echo "Error: boom" >&2; exit 1');
  const r = spawnSync("bash", [join(root, "round7", "run_r7x.sh"), "stub/model"], { env: env(s.bin), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  for (const g of ["stance4", "use"]) {
    const f = join(root, "round7", "raw", `${g}_stub_model.jsonl`);
    assert.equal(lines(f).length, 1, `${g}: the retry wrote a fresh record`);
    assert.equal(lines(`${f}.errors`).length, 1, `${g}: the first error was set aside`);
  }
  assert.equal(s.calls(), 2 * 2 * 4, "two groups, a run and a retry each, four attempts per call");
});

test("run_r7.sh: an all-error group is set aside and retried, and every group runs", () => {
  const root = shellTree("run_r7.sh");
  const s = stub(root, 'echo "Error: boom" >&2; exit 1');
  const r = spawnSync("bash", [join(root, "round7", "run_r7.sh"), "stub/model"], { env: env(s.bin), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const files = [...["core", "framing", "attribution"].map((g) => join(root, "round5", "raw", `${g}_stub_model.jsonl`)), join(root, "round6", "raw", "stance4_stub_model.jsonl")];
  for (const f of files) {
    assert.equal(lines(f).length, 1, f);
    assert.equal(lines(`${f}.errors`).length, 1, f);
  }
  assert.equal(s.calls(), 4 * 2 * 4);
});
