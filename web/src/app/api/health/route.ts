/** Which build is live: open /api/health after a deploy to confirm it went out. */
export function GET() {
  return Response.json({
    ok: true,
    app: "bimafy",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
  });
}
