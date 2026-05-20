import { Sandbox } from "@vercel/sandbox";
import { config } from "./config";

export type ExecuteCodeInput = {
  code: string;
  signal: AbortSignal;
};

export type ExecuteCodeResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  error: string | null;
};

type CommandResult = {
  exitCode: number | null;
  stdout(opts?: { signal?: AbortSignal }): Promise<string>;
  stderr(opts?: { signal?: AbortSignal }): Promise<string>;
};

type SandboxInstance = {
  runCommand(
    command: string,
    args?: string[],
    opts?: { signal?: AbortSignal },
  ): Promise<CommandResult>;
  stop(opts?: { signal?: AbortSignal; blocking?: boolean }): Promise<unknown>;
};

type SandboxFactory = (params: {
  runtime: "python3.13";
  networkPolicy: "deny-all";
  timeout: number;
  signal: AbortSignal;
}) => Promise<SandboxInstance>;

let sandboxFactory: SandboxFactory = (params) => Sandbox.create(params);

export function setSandboxFactoryForTests(factory: SandboxFactory) {
  sandboxFactory = factory;
}

export function resetSandboxFactoryForTests() {
  sandboxFactory = (params) => Sandbox.create(params);
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function createTimeoutSignal(parentSignal: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("Code execution timed out."));
  }, timeoutMs);

  const onAbort = () => controller.abort(parentSignal.reason);
  if (parentSignal.aborted) {
    onAbort();
  } else {
    parentSignal.addEventListener("abort", onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    dispose: () => {
      clearTimeout(timeout);
      parentSignal.removeEventListener("abort", onAbort);
    },
  };
}

export async function executeCode({
  code,
  signal,
}: ExecuteCodeInput): Promise<ExecuteCodeResult> {
  if (code.length > config.maxExecutorCodeChars) {
    return {
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      error: "Code exceeds maximum length.",
    };
  }

  const timeoutSignal = createTimeoutSignal(signal, config.executorTimeoutMs);
  let sandbox: SandboxInstance | null = null;

  try {
    sandbox = await sandboxFactory({
      runtime: "python3.13",
      networkPolicy: "deny-all",
      timeout: config.executorTimeoutMs + 5_000,
      signal: timeoutSignal.signal,
    });

    const result = await sandbox.runCommand("python3", ["-c", code], {
      signal: timeoutSignal.signal,
    });

    const [stdout, stderr] = await Promise.all([
      result.stdout({ signal: timeoutSignal.signal }),
      result.stderr({ signal: timeoutSignal.signal }),
    ]);
    const exitCode = result.exitCode;

    return {
      stdout: truncate(stdout, config.maxExecutorOutputChars),
      stderr: truncate(stderr, config.maxExecutorOutputChars),
      exitCode,
      timedOut: false,
      error:
        exitCode === 0 || exitCode === null
          ? null
          : `Python exited with code ${exitCode}.`,
    };
  } catch (error) {
    const timedOut = timeoutSignal.didTimeOut();
    return {
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut,
      error:
        error instanceof Error
          ? error.message
          : timedOut
            ? "Code execution timed out."
            : "Code execution failed.",
    };
  } finally {
    timeoutSignal.dispose();
    await sandbox?.stop({ blocking: false }).catch(() => {});
  }
}
