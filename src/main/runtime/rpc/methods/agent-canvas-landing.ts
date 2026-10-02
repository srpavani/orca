import { z } from 'zod'
import { defineMethod } from '../core'
import {
  landFloor,
  landingPreflight,
  landingPreview,
  type GitRun
} from '../../../agent-canvas/floor-landing'
import { extractExecError } from '../../../git/exec-error'
import { gitExecFileAsync } from '../../../git/runner'

const Path = z.string().min(1).max(4_096)
const Branch = z.string().min(1).max(512)

const LandingPreflightParams = z.object({ worktreePath: Path })
const LandingPreviewParams = z.object({ worktreePath: Path, target: Branch })
const LandingLandParams = z.object({ worktreePath: Path, target: Branch })

/**
 * Landing reads git's exit codes (a conflict is an answer, not an error), so this
 * wraps the throwing runner into one that reports the code instead.
 */
const runGit: GitRun = async (args, cwd) => {
  try {
    const { stdout, stderr } = await gitExecFileAsync(args, { cwd })
    return { exitCode: 0, stdout, stderr }
  } catch (error) {
    const { stdout, stderr } = extractExecError(error)
    const code = (error as { code?: unknown } | null)?.code
    return { exitCode: typeof code === 'number' && code !== 0 ? code : 1, stdout, stderr }
  }
}

export const AGENT_CANVAS_LANDING_METHODS = [
  defineMethod({
    name: 'canvas.landingPreflight',
    params: LandingPreflightParams,
    handler: async (params) => landingPreflight(runGit, params.worktreePath)
  }),
  defineMethod({
    name: 'canvas.landingPreview',
    params: LandingPreviewParams,
    handler: async (params) => landingPreview(runGit, params.worktreePath, params.target)
  }),
  defineMethod({
    name: 'canvas.landFloor',
    params: LandingLandParams,
    handler: async (params) => landFloor(runGit, params.worktreePath, params.target)
  })
]
