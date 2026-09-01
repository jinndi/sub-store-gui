const ALLOWED_PERMISSIONS = new Set([
  'clipboard-read',
  'clipboard-sanitized-write',
])

export function isPermissionAllowed(
  permission: string,
  requestingOrigin: string,
  expectedOrigin: string,
): boolean {
  return requestingOrigin === expectedOrigin && ALLOWED_PERMISSIONS.has(permission)
}

export function isPermissionRequestAllowed(
  permission: string,
  pageUrl: string,
  expectedOrigin: string,
): boolean {
  try {
    return new URL(pageUrl).origin === expectedOrigin && ALLOWED_PERMISSIONS.has(permission)
  } catch {
    return false
  }
}
