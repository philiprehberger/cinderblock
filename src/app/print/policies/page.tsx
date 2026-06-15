import { createServiceRoleClient } from "@/lib/supabase/server-only";

type PolicyRow = {
  schemaname: string;
  tablename: string;
  policyname: string;
  cmd: string;
  roles: string[];
  qual: string | null;
  with_check: string | null;
};

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cinderblock — Policy Reference (printable)",
  description:
    "Print-friendly reference of every RLS policy in the Cinderblock deployment. Open this page and File → Print → Save as PDF.",
};

async function loadPolicies(): Promise<PolicyRow[]> {
  const service = createServiceRoleClient();
  const { data, error } = await service.from("v_public_policies").select("*");
  if (error) return [];
  return (data ?? []) as PolicyRow[];
}

function groupBy<T, K extends string>(arr: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of arr) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

const CMD_ORDER: Record<string, number> = {
  ALL: 0,
  SELECT: 1,
  INSERT: 2,
  UPDATE: 3,
  DELETE: 4,
};

export default async function PrintablePolicyReference() {
  const policies = (await loadPolicies()).filter((p) => p.schemaname === "public");
  const byTable = groupBy(policies, (p) => p.tablename);
  const tables = Object.keys(byTable).sort();
  const generatedAt = new Date().toISOString().slice(0, 10);

  return (
    <main className="cb-print">
      {/* Print stylesheet — page breaks per table, no color, monospace SQL. */}
      <style>{`
        @page {
          size: letter;
          margin: 0.6in 0.6in 0.7in 0.6in;
          @bottom-right {
            content: "Page " counter(page) " of " counter(pages);
            font: 9pt sans-serif;
            color: #666;
          }
        }
        .cb-print {
          color: #111;
          background: #fff;
          font: 11pt/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
          max-width: 7.3in;
          margin: 0.5in auto;
          padding: 0 0.2in;
        }
        .cb-print h1 {
          font-size: 22pt;
          margin: 0 0 4pt;
          letter-spacing: -0.01em;
        }
        .cb-print .meta {
          color: #555;
          font-size: 10pt;
          margin-bottom: 18pt;
        }
        .cb-print .toc {
          border: 1px solid #ddd;
          padding: 10pt 14pt;
          margin-bottom: 20pt;
          break-after: page;
        }
        .cb-print .toc h2 {
          margin: 0 0 8pt;
          font-size: 13pt;
        }
        .cb-print .toc ul {
          columns: 2;
          column-gap: 18pt;
          margin: 0;
          padding-left: 18pt;
        }
        .cb-print .toc li {
          break-inside: avoid;
          margin-bottom: 3pt;
          font-size: 10pt;
        }
        .cb-print .table-section {
          break-before: page;
          break-inside: avoid-page;
        }
        .cb-print .table-section:first-of-type {
          break-before: auto;
        }
        .cb-print h2.table-name {
          font-size: 16pt;
          margin: 0 0 4pt;
          padding-bottom: 4pt;
          border-bottom: 2pt solid #111;
        }
        .cb-print .table-meta {
          color: #555;
          font-size: 9pt;
          margin: 0 0 12pt;
        }
        .cb-print .policy {
          break-inside: avoid;
          margin: 10pt 0 14pt;
          padding: 8pt 10pt;
          border-left: 3pt solid #888;
          background: #fafafa;
        }
        .cb-print .policy-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12pt;
          margin-bottom: 6pt;
        }
        .cb-print .policy-name {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11pt;
          font-weight: 600;
        }
        .cb-print .policy-cmd {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 9pt;
          letter-spacing: 0.05em;
          color: #555;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .cb-print .clause {
          margin: 4pt 0;
        }
        .cb-print .clause-label {
          font-size: 8pt;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #666;
        }
        .cb-print pre {
          background: #fff;
          border: 1px solid #ddd;
          margin: 2pt 0 0;
          padding: 6pt 8pt;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 9pt;
          white-space: pre-wrap;
          word-wrap: break-word;
          break-inside: avoid;
        }
        .cb-print .empty {
          color: #888;
          font-style: italic;
        }
        @media screen {
          .cb-print {
            box-shadow: 0 1px 4px rgba(0,0,0,0.06);
            padding: 0.5in 0.6in;
            margin-top: 24pt;
            margin-bottom: 24pt;
            background: #fff;
          }
          body { background: #f4f4f4; }
        }
        .cb-print .print-cta {
          margin: 12pt 0 24pt;
          padding: 10pt 14pt;
          border: 1px dashed #999;
          font-size: 10pt;
          color: #333;
        }
        @media print {
          .cb-print .print-cta { display: none; }
        }
      `}</style>

      <h1>Cinderblock — RLS Policy Reference</h1>
      <p className="meta">
        Generated {generatedAt} from <code>pg_policies</code> on the
        deployed database via <code>v_public_policies</code>.
        {" "}
        {policies.length} policies across {tables.length} tables.
      </p>

      <div className="print-cta">
        Use your browser&apos;s File → Print → <strong>Save as PDF</strong> to
        produce a static reference. The page is print-styled with page breaks
        between tables.
      </div>

      {policies.length === 0 ? (
        <p className="empty">
          The policy viewer view (<code>v_public_policies</code>) isn&apos;t
          available — apply migration <code>0120_policy_viewer.sql</code>.
        </p>
      ) : (
        <>
          <nav className="toc" aria-label="Tables in this reference">
            <h2>Tables</h2>
            <ul>
              {tables.map((tbl) => (
                <li key={tbl}>
                  <a href={`#tbl-${tbl}`}>public.{tbl}</a>
                  {" — "}
                  {byTable[tbl]!.length}{" "}
                  policies
                </li>
              ))}
            </ul>
          </nav>

          {tables.map((tbl) => {
            const tablePolicies = [...byTable[tbl]!].sort((a, b) => {
              const ao = CMD_ORDER[a.cmd] ?? 99;
              const bo = CMD_ORDER[b.cmd] ?? 99;
              if (ao !== bo) return ao - bo;
              return a.policyname.localeCompare(b.policyname);
            });
            return (
              <section
                key={tbl}
                id={`tbl-${tbl}`}
                className="table-section"
              >
                <h2 className="table-name">public.{tbl}</h2>
                <p className="table-meta">
                  {tablePolicies.length} policies
                </p>
                {tablePolicies.map((p) => (
                  <div className="policy" key={p.policyname}>
                    <div className="policy-header">
                      <span className="policy-name">{p.policyname}</span>
                      <span className="policy-cmd">
                        {p.cmd}
                        {p.roles?.length
                          ? ` · ${p.roles.join(", ")}`
                          : ""}
                      </span>
                    </div>
                    <div className="clause">
                      <div className="clause-label">USING</div>
                      {p.qual ? (
                        <pre>{p.qual}</pre>
                      ) : (
                        <pre className="empty">— (no USING clause)</pre>
                      )}
                    </div>
                    <div className="clause">
                      <div className="clause-label">WITH CHECK</div>
                      {p.with_check ? (
                        <pre>{p.with_check}</pre>
                      ) : (
                        <pre className="empty">— (no WITH CHECK clause)</pre>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}
