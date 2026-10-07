import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  hardenExistingSecureFile,
  isUnreadableError,
  writeSecureJsonFile
} from '../../shared/secure-file'
import { AgentCanvasAccessError } from './agent-canvas-peers'
import { PROJECT_CANVAS_DIRNAME } from './agent-canvas-store'

export const ROLES_FILENAME = 'roles.json'
export const ROLE_PROMPT_MAX_CHARS = 20_000

/** A role preset, like the reference's `.maestri/roles/<id>/role.json`. */
export type AgentCanvasRole = {
  id: string
  name: string
  prompt: string
  /** The project key it belongs to, or null for a role visible everywhere. */
  projectKey: string | null
}

export type RoleScope = 'current' | 'global'

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Reads `key` from untrusted JSON without asserting its shape. */
export function jsonField(raw: unknown, key: string): unknown {
  return typeof raw === 'object' && raw !== null ? Reflect.get(raw, key) : undefined
}

function parseRoles(raw: unknown): AgentCanvasRole[] {
  const rows = jsonField(raw, 'roles')
  if (!Array.isArray(rows)) {
    return []
  }
  return rows.flatMap((row: unknown) => {
    const id = jsonField(row, 'id')
    const name = jsonField(row, 'name')
    const prompt = jsonField(row, 'prompt')
    const projectKey = jsonField(row, 'projectKey')
    return typeof id === 'string' &&
      typeof name === 'string' &&
      typeof prompt === 'string' &&
      (projectKey === null || typeof projectKey === 'string')
      ? [{ id, name, prompt, projectKey }]
      : []
  })
}

/**
 * Role presets the team assigns to recruits. Why in userData and not the repo:
 * the reference writes `.maestri/` into the checkout; Orca keeps the board out
 * of the repository, so its roles live beside the boards.
 */
export class AgentCanvasRoleStore {
  private readonly path: string
  private roles: AgentCanvasRole[]
  private readonly unreadable: boolean

  constructor(userDataPath: string) {
    this.path = join(userDataPath, PROJECT_CANVAS_DIRNAME, ROLES_FILENAME)
    let roles: AgentCanvasRole[] = []
    let unreadable = false
    try {
      hardenExistingSecureFile(this.path)
      roles = parseRoles(JSON.parse(readFileSync(this.path, 'utf8')))
    } catch (error) {
      // Why: an unreadable (not merely missing) file must never be overwritten by an empty list.
      unreadable = isUnreadableError(error)
    }
    this.roles = roles
    this.unreadable = unreadable
  }

  /** Roles visible from `projectKey`: its own first, then the global ones. */
  list(projectKey: string | null): AgentCanvasRole[] {
    return [
      ...this.roles.filter((role) => role.projectKey !== null && role.projectKey === projectKey),
      ...this.roles.filter((role) => role.projectKey === null)
    ]
  }

  /** A project role shadows a global one of the same name, as it is listed first. */
  find(name: string, projectKey: string | null): AgentCanvasRole {
    const role = this.list(projectKey).find(
      (candidate) => same(candidate.name, name) || candidate.id === name
    )
    if (!role) {
      throw new AgentCanvasAccessError(
        'canvas_role_not_found',
        `No role is named "${name}". Run \`orca canvas role list\` to see the roles.`
      )
    }
    return role
  }

  byId(id: string | null): AgentCanvasRole | null {
    return id === null ? null : (this.roles.find((role) => role.id === id) ?? null)
  }

  create(
    name: string,
    prompt: string,
    projectKey: string | null,
    scope: RoleScope
  ): AgentCanvasRole {
    const owner = scope === 'global' ? null : projectKey
    if (this.roles.some((role) => role.projectKey === owner && same(role.name, name))) {
      throw new AgentCanvasAccessError(
        'canvas_role_exists',
        `A role named "${name}" already exists here. Edit it, or pick another name.`
      )
    }
    const role = {
      id: randomUUID(),
      name: name.trim(),
      prompt: boundPrompt(prompt),
      projectKey: owner
    }
    this.save([...this.roles, role])
    return role
  }

  /** Replaces the prompt, a substring of it, and/or the scope. */
  update(
    name: string,
    projectKey: string | null,
    change: { prompt?: string; oldText?: string; newText?: string; scope?: RoleScope }
  ): AgentCanvasRole {
    const role = this.find(name, projectKey)
    // Why: a role belonging to another project is not this caller's to change.
    if (role.projectKey !== null && role.projectKey !== projectKey) {
      throw new AgentCanvasAccessError('canvas_role_not_found', `No role is named "${name}".`)
    }
    let prompt = change.prompt ?? role.prompt
    if (change.oldText !== undefined) {
      const at = prompt.indexOf(change.oldText)
      if (at === -1) {
        throw new AgentCanvasAccessError(
          'canvas_role_edit_no_match',
          `The text to replace was not found in role "${role.name}". Run \`orca canvas role show\`.`
        )
      }
      prompt =
        prompt.slice(0, at) + (change.newText ?? '') + prompt.slice(at + change.oldText.length)
    }
    const owner =
      change.scope === undefined ? role.projectKey : change.scope === 'global' ? null : projectKey
    const next = { ...role, prompt: boundPrompt(prompt), projectKey: owner }
    this.save(this.roles.map((candidate) => (candidate.id === role.id ? next : candidate)))
    return next
  }

  remove(name: string, projectKey: string | null): AgentCanvasRole {
    const role = this.find(name, projectKey)
    this.save(this.roles.filter((candidate) => candidate.id !== role.id))
    return role
  }

  private save(roles: AgentCanvasRole[]): void {
    this.roles = roles
    if (!this.unreadable) {
      writeSecureJsonFile(this.path, { roles })
    }
  }
}

function boundPrompt(prompt: string): string {
  if (prompt.length > ROLE_PROMPT_MAX_CHARS) {
    throw new AgentCanvasAccessError(
      'canvas_role_invalid',
      `A role prompt is limited to ${ROLE_PROMPT_MAX_CHARS} characters.`
    )
  }
  return prompt
}

/**
 * The first prompt a recruit with a role receives. Why the tag: the reference
 * hands the role as `<your_assigned_role>`, so agents read it as standing orders
 * rather than as the task itself.
 */
export function roleBriefing(role: AgentCanvasRole, task?: string): string {
  const brief = `<your_assigned_role name="${role.name}">\n${role.prompt}\n</your_assigned_role>`
  return task ? `${brief}\n\n${task}` : brief
}
