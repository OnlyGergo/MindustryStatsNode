import React from "react";

const AnimatedBackground: React.FC = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none">
    <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-500/10 rounded blur-3xl animate-pulse"></div>
    <div
      className="absolute -bottom-40 -left-40 w-80 h-80 bg-amber-500/10 rounded blur-3xl animate-pulse"
      style={{ animationDelay: "1s" }}
    ></div>
    <div
      className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-60 h-60 bg-orange-600/5 rounded blur-3xl animate-pulse"
      style={{ animationDelay: "2s" }}
    ></div>
  </div>
);

export default AnimatedBackground;
