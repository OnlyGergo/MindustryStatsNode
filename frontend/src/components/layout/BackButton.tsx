import React from "react";
import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";

/**
 * Real anchor to "/", so middle-click works. A plain click steps back through
 * history when there is any (keeping list state), otherwise goes to "/".
 */
const BackButton: React.FC = () => {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  return (
    <Link
      to="/"
      aria-label="Back"
      className="button-secondary p-2 shrink-0"
      onClick={(e) => {
        if (!canGoBack) return;
        e.preventDefault();
        router.history.back();
      }}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
    </Link>
  );
};

export default BackButton;
