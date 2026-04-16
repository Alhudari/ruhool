/**
 * Pre-installed workflow templates.
 *
 * Import and push these into store.workflows when it is empty:
 *
 *   import { getDefaultWorkflowTemplates } from './workflow-templates';
 *   if (store.workflows.length === 0) {
 *     store.workflows.push(...getDefaultWorkflowTemplates());
 *     saveStore(store);
 *   }
 */

import crypto from 'node:crypto';

export interface WorkflowTemplate {
  id: string;
  name: { en: string; ar: string };
  description: string;
  steps: Array<{ agentId: string; prompt: string }>;
  trigger: { type: string; cron?: string };
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
}

export function getDefaultWorkflowTemplates(): WorkflowTemplate[] {
  const now = new Date().toISOString();

  return [
    {
      id: crypto.randomUUID(),
      name: {
        en: 'Weekly BIM Scopus Digest',
        ar: 'ملخص سكوبس الأسبوعي لـ BIM',
      },
      description:
        'Searches Scopus for new BIM-related papers published in the past week, summarises findings, and saves a digest note.',
      steps: [
        {
          agentId: 'researcher',
          prompt:
            'Search Scopus for papers published in the last 7 days with keywords: BIM, Building Information Modeling, digital twin construction. Return title, authors, DOI, and abstract for each.',
        },
        {
          agentId: 'writer',
          prompt:
            'Summarise the retrieved papers into a weekly digest note with key themes and trends.',
        },
      ],
      trigger: { type: 'cron', cron: '0 8 * * 1' }, // Every Monday at 08:00
      enabled: false,
      lastRunAt: null,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: {
        en: 'Daily Notes Backup',
        ar: 'نسخ احتياطي يومي للملاحظات',
      },
      description:
        'Backs up the notes folder to a timestamped archive daily at midnight.',
      steps: [
        {
          agentId: 'system',
          prompt:
            'Create a compressed backup of the data/notes directory. Save it to data/backups/ with a filename including today\'s date (YYYY-MM-DD).',
        },
      ],
      trigger: { type: 'cron', cron: '0 0 * * *' }, // Every day at midnight
      enabled: false,
      lastRunAt: null,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: {
        en: 'Monthly Usage Report',
        ar: 'تقرير الاستخدام الشهري',
      },
      description:
        'Generates a monthly cost and usage report covering all API providers, total tokens, and spend breakdown.',
      steps: [
        {
          agentId: 'analyst',
          prompt:
            'Aggregate all usage records from the past calendar month. Calculate total cost, token counts by provider and model, average cost per call, and peak usage hours. Format as a structured report.',
        },
        {
          agentId: 'writer',
          prompt:
            'Save the monthly usage report as a note with charts-ready data tables.',
        },
      ],
      trigger: { type: 'cron', cron: '0 9 1 * *' }, // 1st of every month at 09:00
      enabled: false,
      lastRunAt: null,
      createdAt: now,
    },
  ];
}
