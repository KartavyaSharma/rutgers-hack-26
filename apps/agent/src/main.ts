// Worker entry: `tsx src/main.ts dev|start`. Exits quietly (code 0) when keys are missing so the
// root `pnpm dev` keeps the web app running.
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AGENT_NAME } from '@bell/core/taxonomy'
import { envWarnings, loadRootEnv, missingEnv } from './env'

loadRootEnv()

const missing = missingEnv()
if (missing.length > 0) {
  console.log(`voice agent disabled: missing ${missing.join(', ')} (see .env.example)`)
  process.exit(0)
}
for (const warning of envWarnings()) console.warn(`voice agent: ${warning}`)

// Loaded only once we know the worker will run.
const { ServerOptions, cli } = await import('@livekit/agents')

// Job processes are forked and import the agent by path. They inherit tsx's loader through
// execArgv, so this resolves to agent.ts under tsx (agent.js if this is ever compiled).
const agentFile = fileURLToPath(
  new URL(`./agent${extname(fileURLToPath(import.meta.url))}`, import.meta.url),
)

cli.runApp(
  new ServerOptions({
    agent: agentFile,
    // Explicit dispatch: the web token endpoint dispatches this name with { roomId } metadata.
    agentName: AGENT_NAME,
  }),
)
