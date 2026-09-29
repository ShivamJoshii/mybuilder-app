import { z } from 'zod'

export const lineSchema = z.object({
  id: z.string().uuid(), cost_code_id: z.string().uuid().nullable(),
  cost_type: z.enum(['labor', 'material', 'equipment', 'subcontractor', 'other', 'none']),
  title: z.string().trim().min(1, 'Every line needs a title').max(200),
  description: z.string().max(4000).nullable(), quantity: z.number().finite().min(-1e9).max(1e9), unit: z.string().trim().max(20),
  unit_cost: z.number().finite().min(-1e10).max(1e10).optional(), sort: z.number().int(),
})
