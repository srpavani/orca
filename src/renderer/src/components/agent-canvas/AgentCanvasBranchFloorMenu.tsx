import React from 'react'
import { GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { openBranchFloor } from './agent-canvas-branch-floor'

/**
 * "Floor from branch": pick a repo's existing worktree, or type a new branch,
 * and get a floor pinned to it. Its terminals land on that floor.
 */
export function AgentCanvasBranchFloorMenu(props: { chipClassName: string }): React.JSX.Element {
  const repos = useAppStore((state) => state.repos)
  const worktreesByRepo = useAppStore((state) => state.worktreesByRepo)
  const label = translate('auto.components.agentCanvas.branchFloor', 'Branch floor')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            props.chipClassName,
            'border-dashed border-border text-muted-foreground hover:text-foreground'
          )}
        >
          <GitBranch className="size-3" />
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <div className="scrollbar-sleek max-h-96 overflow-y-auto">
          {repos.length === 0 ? (
            <DropdownMenuLabel>
              {translate(
                'auto.components.agentCanvas.branchFloorNoRepos',
                'Add a repository first.'
              )}
            </DropdownMenuLabel>
          ) : null}
          {repos.map((repo, index) => (
            <React.Fragment key={repo.id}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel>{repo.displayName}</DropdownMenuLabel>
              {(worktreesByRepo[repo.id] ?? [])
                .filter((worktree) => worktree.branch)
                .map((worktree) => (
                  <DropdownMenuItem
                    key={worktree.id}
                    onSelect={() => void openBranchFloor(repo.id, worktree.branch)}
                  >
                    {worktree.branch.replace(/^refs\/heads\//, '')}
                  </DropdownMenuItem>
                ))}
              <DropdownMenuItem
                onSelect={() => {
                  const branch = window.prompt(
                    translate(
                      'auto.components.agentCanvas.branchFloorPrompt',
                      'New branch name (a worktree is created for it)'
                    )
                  )
                  if (branch?.trim()) {
                    void openBranchFloor(repo.id, branch)
                  }
                }}
              >
                {translate('auto.components.agentCanvas.branchFloorNew', 'New branch…')}
              </DropdownMenuItem>
            </React.Fragment>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
