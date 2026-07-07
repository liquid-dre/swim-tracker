"use client";

/*
  Last-resort boundary: replaces the ROOT layout when even it throws, so
  globals.css and the Outfit font are not guaranteed to be loaded. Everything
  here is deliberately self-contained inline style using DESIGN.md token values
  (gray-50 canvas, gray-200 border, gray-900 ink, brand indigo #465fff).
*/
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error(error);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f9fafb",
          color: "#101828",
          fontFamily:
            "Outfit, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: "26rem",
            textAlign: "center",
            background: "#ffffff",
            border: "1px solid #e4e7ec",
            borderRadius: "1rem",
            padding: "3rem 1.5rem",
            boxShadow: "0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.1)",
          }}
        >
          <p style={{ margin: 0, fontSize: "1rem", fontWeight: 500 }}>
            Something went wrong
          </p>
          <p style={{ margin: "0.25rem 0 1.25rem", fontSize: "0.875rem", color: "#667085" }}>
            The app hit an unexpected error. Your data is safe.
          </p>
          <button
            onClick={reset}
            style={{
              height: "2.75rem",
              padding: "0 1rem",
              fontSize: "1rem",
              fontWeight: 500,
              color: "#ffffff",
              background: "#465fff",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
