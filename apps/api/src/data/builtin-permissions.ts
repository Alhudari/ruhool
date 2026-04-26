// Built-in agent permissions table — extracted from index.ts (REL-01 stage 2d final trim).
import type { AgentPermissions } from '../store/types.js';

export const BUILTIN_AGENT_PERMISSIONS: Record<string, AgentPermissions> = {
  manager: { canReadFiles: true, canWriteFiles: true, canSearch: true, canAccessInternet: true, canModifyAgents: false, canAccessPrivate: false },
  research: { canReadFiles: true, canWriteFiles: false, canSearch: true, canAccessInternet: false, canModifyAgents: false, canAccessPrivate: false },
  'reading-helper': { canReadFiles: true, canWriteFiles: false, canSearch: false, canAccessInternet: false, canModifyAgents: false, canAccessPrivate: false },
  'writing-critic': { canReadFiles: true, canWriteFiles: false, canSearch: false, canAccessInternet: false, canModifyAgents: false, canAccessPrivate: false },
  comparator: { canReadFiles: true, canWriteFiles: false, canSearch: false, canAccessInternet: false, canModifyAgents: false, canAccessPrivate: false },
  architect: { canReadFiles: true, canWriteFiles: false, canSearch: true, canAccessInternet: false, canModifyAgents: true, canAccessPrivate: false },
  'content-creator': { canReadFiles: true, canWriteFiles: false, canSearch: false, canAccessInternet: false, canModifyAgents: false, canAccessPrivate: false },
  creative: { canReadFiles: true, canWriteFiles: true, canSearch: false, canAccessInternet: false, canModifyAgents: false, canAccessPrivate: false },
  'tasks-agent': { canReadFiles: false, canWriteFiles: false, canSearch: false, canAccessInternet: false, canModifyAgents: false, canAccessPrivate: false },
};
