declare const __APP_VERSION__: string
declare const __BUILD_SHA__: string

export const APP_VERSION = __APP_VERSION__
export const BUILD_SHA = __BUILD_SHA__

export function getAppVersionLabel(): string {
  return `v${APP_VERSION} · ${BUILD_SHA}`
}
