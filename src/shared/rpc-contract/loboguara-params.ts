import { z } from 'zod'

export const LoboGuaraEmptyParams = z.object({}).optional().default({})

export const LoboGuaraPrepareLaunchParams = z
  .object({
    /** Open the browser sign-in when no token is stored yet. */
    signIn: z.boolean().optional()
  })
  .optional()
  .default({})
