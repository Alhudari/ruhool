/**
 * Parser + executor for Mudawwin's [MEETING:CREATE] action tag.
 * Creates a new file in 01 PhD/01 Supervision/Supervision Interaction Points/{N}.md
 * matching the existing meeting-file format.
 */
import { writeNoteRaw, noteExists, writeFrontmatter, listNotes } from '@ruhool/core';
import { auditLog } from '../services/audit-log.js';

interface MeetingPayload {
  no?: string | number;
  date?: string;
  location?: string;
  attendees?: string[];
  summary?: string;
  decisions?: string[];
  action_plan_next?: string[];
  next_meeting?: string;
  next_location?: string;
}

export function parseMeetingCreateActions(text: string): MeetingPayload[] {
  const out: MeetingPayload[] = [];
  const re = /\[MEETING:CREATE\]\s*(\{[\s\S]*?\})\s*\[\/MEETING:CREATE\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const data = JSON.parse(m[1]) as MeetingPayload;
      out.push(data);
    } catch { /* skip bad json */ }
  }
  return out;
}

// Auto-pick the next meeting number by scanning existing files
async function nextMeetingNo(): Promise<number> {
  try {
    const paths = await listNotes({ subPath: '01 PhD/01 Supervision/Supervision Interaction Points', recursive: false });
    const nums = paths
      .map((p) => p.split('/').pop()?.replace(/\.md$/, '') ?? '')
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n));
    return (nums.length === 0 ? 0 : Math.max(...nums)) + 1;
  } catch { return 1; }
}

export async function applyMeetingCreate(payload: MeetingPayload): Promise<{ ok: boolean; path?: string; error?: string }> {
  const no = payload.no ? String(payload.no) : String(await nextMeetingNo());
  const relPath = `01 PhD/01 Supervision/Supervision Interaction Points/${no}.md`;

  if (await noteExists(relPath)) {
    return { ok: false, error: `Meeting #${no} already exists` };
  }

  const fm: Record<string, unknown> = {
    type: 'supervision-meeting',
    'No.': String(no),
    date: payload.date ?? new Date().toISOString(),
    Location: payload.location ?? '',
    Summary: payload.summary ?? '',
    Attendees: payload.attendees ?? [],
    GRS2_Input: 'N/A',
    GRS2_Respond: 'N/A',
    GRS2_confirmed: false,
    Next_Meeting: payload.next_meeting ?? '',
    Next_Location: payload.next_location ?? '',
    related: '',
  };
  const keyOrder = Object.keys(fm);
  const yaml = writeFrontmatter(fm, keyOrder);

  const decisions = (payload.decisions ?? []).map((d, i) => `${i + 1}. ${d}`).join('\n');
  const actions = (payload.action_plan_next ?? []).map((a) => `- [ ] ${a}`).join('\n');

  const body = [
    '---',
    yaml,
    '---',
    '',
    `> [[🏠 Home]] → 🎓 [[PhD Dashboard]] → 📊 [[Supervision Dashboard]]`,
    '',
    `# اجتماع #${no} — ${(payload.date ?? '').slice(0, 10)}`,
    '',
    '## 📋 الملخص',
    '',
    payload.summary ?? '',
    '',
    decisions ? '## ✅ القرارات\n\n' + decisions + '\n' : '',
    actions ? '## 🎯 خطة العمل\n\n' + actions + '\n' : '',
  ].join('\n');

  try {
    await writeNoteRaw(relPath, body);
    await auditLog({
      action: 'meeting.create',
      path: relPath,
      source: 'platform:mudawwin',
      meta: { no, date: payload.date, attendees: payload.attendees, nextMeeting: payload.next_meeting },
    });
    return { ok: true, path: relPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
