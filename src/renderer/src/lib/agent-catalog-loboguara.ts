import loboGuaraLogoUrl from '../../../../resources/loboguara-logo.png?url'
import { getTuiAgentLaunchCommand, TUI_AGENT_CONFIG } from '../../../shared/tui-agent-config'
import type { AgentCatalogEntry } from './agent-catalog'
import { getCatalogPlatform } from './agent-catalog-platform'

export const LOBO_GUARA_CATALOG_ENTRY: AgentCatalogEntry = {
  id: 'loboguara',
  label: 'Lobo-Guará',
  cmd: getTuiAgentLaunchCommand(TUI_AGENT_CONFIG.loboguara, getCatalogPlatform()),
  iconUrl: loboGuaraLogoUrl,
  homepageUrl: 'https://loboguara.net/'
}
