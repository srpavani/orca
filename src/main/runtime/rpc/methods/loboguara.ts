import { defineMethod } from '../core'
import {
  LoboGuaraEmptyParams,
  LoboGuaraPrepareLaunchParams
} from '../../../../shared/rpc-contract/loboguara-params'
import {
  loboGuaraStatus,
  prepareLoboGuaraLaunch,
  signOutOfLoboGuara
} from '../../../loboguara/loboguara-launch'
import { signInToLoboGuara } from '../../../loboguara/loboguara-sign-in'

export const LOBO_GUARA_METHODS = [
  defineMethod({
    name: 'loboguara.status',
    params: LoboGuaraEmptyParams,
    handler: async () => loboGuaraStatus()
  }),
  defineMethod({
    name: 'loboguara.signIn',
    params: LoboGuaraEmptyParams,
    handler: async () => {
      await signInToLoboGuara()
      return loboGuaraStatus()
    }
  }),
  defineMethod({
    name: 'loboguara.signOut',
    params: LoboGuaraEmptyParams,
    handler: async () => signOutOfLoboGuara()
  }),
  defineMethod({
    name: 'loboguara.prepareLaunch',
    params: LoboGuaraPrepareLaunchParams,
    handler: async (params) => ({ launch: await prepareLoboGuaraLaunch(params) })
  })
]
