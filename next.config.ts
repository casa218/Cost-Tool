import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Opening the dev server at 127.0.0.1 is otherwise treated as cross-origin,
  // and the supplier and recipe forms never attach.
  allowedDevOrigins: ["127.0.0.1"],
  // store.ts builds the path at runtime, so the tracer never sees this file.
  // Cost pages and their actions read it on every request.
  outputFileTracingIncludes: {
    "/cost": ["./data/food-cost.json"],
    "/cost/**": ["./data/food-cost.json"],
  },
};

export default nextConfig;
