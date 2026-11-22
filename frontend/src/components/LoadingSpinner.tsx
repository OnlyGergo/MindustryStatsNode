import React from "react";

export const LoadingSpinner: React.FC<{showText?: boolean, size?: "large" | "medium" | "small"}> = ({showText = true, size = "medium"}) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surf/50 z-20">
        <div className={`animate-spin rounded h-${size === "large" ? "8" : size === "medium" ? "6" : "4"} w-${size === "large" ? "8" : size === "medium" ? "6" : "4"} border-3 border-acc border-t-transparent`} />
        {showText && (
            <span className={`text-${size === "large" ? "sm" : size === "medium" ? "xs" : "xxs"} text-dim font-medium tracking-wide animate-pulse`}>
              Loading...
            </span>
        )}
    </div>
);