import { afterEach, describe, expect, test } from "bun:test";
import {
  executeCode,
  resetSandboxFactoryForTests,
  setSandboxFactoryForTests,
} from "./code-execution";

afterEach(() => {
  resetSandboxFactoryForTests();
});

function makeSignal() {
  return new AbortController().signal;
}

function useFakeSandbox(result: {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}) {
  let stopped = false;

  setSandboxFactoryForTests(async () => ({
    async runCommand() {
      return {
        exitCode: result.exitCode,
        stdout: async () => result.stdout,
        stderr: async () => result.stderr,
      };
    },
    async stop() {
      stopped = true;
    },
  }));

  return {
    wasStopped: () => stopped,
  };
}

describe("executeCode", () => {
  test("returns stdout for successful Python execution", async () => {
    const sandbox = useFakeSandbox({
      stdout: "4\n",
      stderr: "",
      exitCode: 0,
    });

    const result = await executeCode({
      code: "print(2 + 2)",
      signal: makeSignal(),
    });

    expect(result).toEqual({
      stdout: "4\n",
      stderr: "",
      exitCode: 0,
      timedOut: false,
      error: null,
    });
    expect(sandbox.wasStopped()).toBe(true);
  });

  test("truncates excessive stdout and stderr", async () => {
    useFakeSandbox({
      stdout: "x".repeat(9_000),
      stderr: "y".repeat(9_000),
      exitCode: 0,
    });

    const result = await executeCode({
      code: "print('x')",
      signal: makeSignal(),
    });

    expect(result.stdout).toHaveLength(8_000);
    expect(result.stderr).toHaveLength(8_000);
  });

  test("returns a structured error for invalid Python", async () => {
    useFakeSandbox({
      stdout: "",
      stderr: "SyntaxError: invalid syntax\n",
      exitCode: 1,
    });

    const result = await executeCode({
      code: "not valid python",
      signal: makeSignal(),
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("SyntaxError");
    expect(result.error).toBe("Python exited with code 1.");
  });

  test("rejects oversized code before creating a sandbox", async () => {
    let created = false;
    setSandboxFactoryForTests(async () => {
      created = true;
      throw new Error("should not create sandbox");
    });

    const result = await executeCode({
      code: "x".repeat(12_001),
      signal: makeSignal(),
    });

    expect(created).toBe(false);
    expect(result.error).toBe("Code exceeds maximum length.");
  });

  test("stops the sandbox when command execution fails", async () => {
    let stopped = false;
    setSandboxFactoryForTests(async () => ({
      async runCommand() {
        throw new Error("command aborted");
      },
      async stop() {
        stopped = true;
      },
    }));

    const result = await executeCode({
      code: "while True: pass",
      signal: makeSignal(),
    });

    expect(result.error).toBe("command aborted");
    expect(stopped).toBe(true);
  });
});
