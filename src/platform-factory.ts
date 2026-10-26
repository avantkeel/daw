import type { Platform } from "./platform/platform";
import { ElectronPlatform } from "./platform/electron/electron-platform";
import { WebPlatform } from "./platform/web/web-platform";

/**
 * The ONLY file that knows which hosts exist.
 * Dropping Electron: delete src/platform/electron/ and the ElectronPlatform line here.
 */
export function createPlatform(): Platform {
  if (window.dawBridge) return new ElectronPlatform(window.dawBridge);
  return new WebPlatform();
}
