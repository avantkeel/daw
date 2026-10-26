install:
  pnpm install

format:
  pnpm exec prettier --write .

build:
  pnpm exec node scripts/build.mjs

start:
  pnpm exec electron .

package-windows:
  pnpm exec node scripts/build.mjs
  pnpm exec electron-builder --win --x64

package-windows-portable:
  pnpm exec node scripts/build.mjs
  pnpm electron-builder --win portable --x64

package-windows-installer:
  pnpm exec node scripts/build.mjs
  pnpm exec electron-builder --win nsis --x64

clean:
  rm -rf dist/
  rm -rf release/

clean-deep:
  rm -rf dist/
  rm -rf release/
  rm -rf node_modules/
