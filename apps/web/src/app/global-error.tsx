"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors in the root layout. It replaces the whole document, so it
 * can't rely on globals.css; colours are the UI_SPEC tokens inline.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 24,
          padding: "64px 24px",
          background: "#04070a",
          color: "#f0f5fa",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <title>Something went wrong — Campus Lost &amp; Found</title>
        <h1
          style={{
            margin: 0,
            fontSize: 37,
            lineHeight: 1.25,
            fontWeight: 500,
            color: "#ffffff",
          }}
        >
          Something went wrong loading this page.
        </h1>
        <p style={{ margin: 0, fontSize: 19, lineHeight: 1.5 }}>
          Try again in a moment.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            alignSelf: "flex-start",
            border: 0,
            borderRadius: 24,
            padding: "12px 24px",
            background: "#ff6314",
            color: "#04070a",
            fontSize: 16,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.033em",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
