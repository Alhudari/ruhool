import { z } from 'zod';

export const MeetingRecordSchema = z.object({
  No: z.number().nullable(),
  date: z.string().nullable(),
  Location: z.string().nullable(),
  Summary: z.string(),
  Attendees: z.array(z.string()).default([]),
  GRS2_Input: z.string().nullable(),
  GRS2_Respond: z.string().nullable(),
  GRS2_confirmed: z.boolean().default(false),
  Next_Meeting: z.string().nullable(),
  Next_Location: z.string().nullable(),
  action_plan_previous: z.array(z.string()).default([]),
  agenda: z.array(z.string()).default([]),
  discussion: z.string().default(''),
  action_plan_next: z.array(z.string()).default([]),
  arabic_summary: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export type MeetingRecord = z.infer<typeof MeetingRecordSchema>;
