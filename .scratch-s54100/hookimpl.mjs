export async function resolve(spec, ctx, next) {
  if (spec.startsWith("./") && !spec.endsWith(".ts") && !spec.endsWith(".mts") && !spec.endsWith(".js")) {
    try { return await next(spec + ".ts", ctx); } catch { /* fall through */ }
  }
  return next(spec, ctx);
}
