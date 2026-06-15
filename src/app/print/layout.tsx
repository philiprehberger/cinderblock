// Minimal wrapper for print-friendly artifacts. Renders children with no
// docs chrome — the print route is intended to be opened, then printed via
// the browser's print dialog and saved as a PDF reference.

export default function PrintLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
