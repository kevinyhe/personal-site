// Next resolves extensionless relative imports; bare Node does not. Append .ts
// when the specifier has no extension so these modules can be audited offline.
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\.[mc]?[jt]sx?$/.test(specifier)) {
    try { return await next(specifier + ".ts", context); } catch { /* fall through */ }
  }
  return next(specifier, context);
}
