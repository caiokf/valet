import { execFile, type ExecFileOptions } from "node:child_process"

type ExecResult = { stdout: string; stderr: string }

export function execAbortable(
  cmd: string,
  args: string[],
  opts: ExecFileOptions & { signal?: AbortSignal; stdin?: string },
): Promise<ExecResult> {
  const { signal, stdin, ...execOpts } = opts

  if (signal?.aborted) {
    return Promise.reject(
      Object.assign(new Error("Aborted"), { stdout: "", stderr: "", code: "ABORT_ERR" }),
    )
  }

  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, execOpts, (error, stdout, stderr) => {
      if (error) {
        const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
        err.stdout = typeof stdout === "string" ? stdout : ""
        err.stderr = typeof stderr === "string" ? stderr : ""
        reject(err)
      } else {
        resolve({
          stdout: typeof stdout === "string" ? stdout : "",
          stderr: typeof stderr === "string" ? stderr : "",
        })
      }
    })

    if (stdin !== undefined && child.stdin) {
      child.stdin.write(stdin)
      child.stdin.end()
    }

    if (signal) {
      const onAbort = () => child.kill("SIGTERM")
      signal.addEventListener("abort", onAbort, { once: true })
      child.on("exit", () => signal.removeEventListener("abort", onAbort))
    }
  })
}
