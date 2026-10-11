import path from 'node:path'
import { Config } from '@remotion/cli/config'
import { enableTailwind } from '@remotion/tailwind-v4'

const here = process.cwd()

// Two videos, two entry points (src/index.ts: patient tablet, src/staff/index.ts: staff screens),
// so each gets its own Tailwind build. The staff components are imported straight from
// apps/staff: `@/` points there, and its avatar is swapped for one that waits for the photo.
Config.overrideWebpackConfig((config) => {
  const tailwind = enableTailwind(config)
  return {
    ...tailwind,
    resolve: {
      ...tailwind.resolve,
      alias: {
        '@/components/ui/avatar': path.join(here, 'src/staff/stubs/avatar.tsx'),
        '@': path.join(here, '../staff'),
        ...tailwind.resolve?.alias,
      },
    },
  }
})
Config.setVideoImageFormat('jpeg')
Config.setJpegQuality(95)
Config.setCrf(16)
