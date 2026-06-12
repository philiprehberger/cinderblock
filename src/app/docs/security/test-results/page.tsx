import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-static";

function readLatest(): { output: string; capturedAt: string | null } {
  // CI writes the latest green pgtap output to docs/test-results.txt
  // (see .github/workflows/ci.yml). For local dev the file may be
  // absent — show a friendly placeholder.
  const path = join(process.cwd(), "docs", "test-results.txt");
  if (!existsSync(path)) {
    return { output: "", capturedAt: null };
  }
  try {
    const output = readFileSync(path, "utf-8");
    return { output, capturedAt: new Date().toISOString() };
  } catch {
    return { output: "", capturedAt: null };
  }
}

export default function TestResultsPage() {
  const { output, capturedAt } = readLatest();

  return (
    <>
      <h1>Test results</h1>
      <p>
        Latest captured <code>supabase test db</code> run. The CI job
        writes this file on every successful main-branch run so the page
        always shows the most recent green build.
      </p>
      <p>
        <strong>Current target:</strong> 74 tests across 15 categories.
        Run-time on the in-CI fixture: under 1 second wall-clock once
        Postgres is warm.
      </p>

      {output ? (
        <>
          <p className="text-sm text-zinc-500">
            Captured at: {capturedAt ?? "unknown"}
          </p>
          <pre className="not-prose mt-4 overflow-x-auto rounded-md border border-zinc-200 bg-zinc-100 p-4 text-xs leading-5 dark:border-zinc-800 dark:bg-zinc-900">
            <code>{output}</code>
          </pre>
        </>
      ) : (
        <div className="rounded-md border border-zinc-300 bg-zinc-100 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <p className="m-0">
            No captured run in this environment yet. To populate locally:
          </p>
          <pre className="mt-2">
            <code>
              {`mkdir -p docs && npx supabase test db > docs/test-results.txt`}
            </code>
          </pre>
          <p className="mt-2 m-0 text-zinc-600 dark:text-zinc-400">
            In production this file is written by the CI job on every
            green main-branch run.
          </p>
        </div>
      )}
    </>
  );
}
