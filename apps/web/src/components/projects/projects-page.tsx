'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  FolderKanban, Plus, Search, Edit2, Trash2, Archive, RotateCcw,
  MessageSquare, FileText, Upload, X, Loader2, Bot,
  Pin, Settings, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface ProjectFile {
  id: string;
  name: string;
  size: number;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  color?: string;
  icon?: string;
  pinned?: boolean;
  archived?: boolean;
  defaultAgentId?: string;
  files?: ProjectFile[];
  agentInstructions?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

interface Conversation {
  id: string;
  title: string;
  agentId?: string;
  updatedAt: string;
}

const COLORS = ['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16'];

const AGENTS = [
  { id: 'manager', ar: 'الراعي', en: "Al-Ra'i" },
  { id: 'research', ar: 'الباحث', en: 'Al-Bahith' },
  { id: 'reading-helper', ar: 'المُلخِّص', en: 'Al-Mulakhkhis' },
  { id: 'writing-critic', ar: 'الناقد', en: 'Al-Naqid' },
  { id: 'comparator', ar: 'المُقارِن', en: 'Al-Muqarin' },
  { id: 'content-creator', ar: 'السارد', en: 'Al-Sarid' },
  { id: 'creative', ar: 'المبدع', en: "Al-Mubdi'" },
  { id: 'tasks-agent', ar: 'مهام', en: 'Maham' },
  { id: 'research-companion', ar: 'الخوي', en: 'Al-Khuwy' },
  { id: 'mudawwin', ar: 'المُدوّن', en: 'Al-Mudawwin' },
  { id: 'sayyaq', ar: 'الكاتب', en: 'Al-Katib' },
];

function fmtSize(b: number) { return b<1024 ? b+'B' : b<1048576 ? (b/1024).toFixed(1)+'KB' : (b/1048576).toFixed(1)+'MB'; }
function ago(iso: string, rtl: boolean) {
  const d = Math.floor((Date.now()-new Date(iso).getTime())/86400000);
  if (d===0) return rtl?'اليوم':'today'; if (d===1) return rtl?'أمس':'yesterday';
  if (d<30) return rtl?`قبل ${d} يوم`:`${d}d ago`;
  return new Date(iso).toLocaleDateString(rtl?'ar':'en');
}

// ── Form Modal ────────────────────────────────────────────────────────
function ProjectModal({ initial, onSave, onClose, language }: {
  initial?: Partial<Project>; onSave: (d: Partial<Project>) => Promise<void>;
  onClose: () => void; language: 'ar' | 'en';
}) {
  const isRTL = language === 'ar';
  const [name, setName] = useState(initial?.name||'');
  const [desc, setDesc] = useState(initial?.description||'');
  const [instr, setInstr] = useState(initial?.instructions||'');
  const [color, setColor] = useState(initial?.color||COLORS[0]);
  const [agent, setAgent] = useState(initial?.defaultAgentId||'manager');
  const [agentInstrs, setAgentInstrs] = useState<Record<string,string>>(initial?.agentInstructions||{});
  const [tab, setTab] = useState<'basic'|'instructions'|'agents'>('basic');
  const [selAgent, setSelAgent] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={cn('bg-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col',isRTL&&'rtl')} dir={isRTL?'rtl':'ltr'}>
        <div className="flex items-center gap-3 p-5 border-b border-border">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{backgroundColor:color+'25'}}>
            <FolderKanban size={18} style={{color}}/>
          </div>
          <h2 className="text-base font-semibold flex-1">
            {initial?.id ? (isRTL?'تعديل المشروع':'Edit Project') : (isRTL?'مشروع جديد':'New Project')}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X size={18}/></button>
        </div>

        <div className="flex border-b border-border px-5">
          {(['basic','instructions','agents'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={cn('py-3 px-4 text-sm font-medium border-b-2 transition-colors',tab===t?'border-primary text-primary':'border-transparent text-on-surface-tertiary hover:text-on-surface')}>
              {t==='basic'?(isRTL?'الأساسي':'Basic'):t==='instructions'?(isRTL?'التعليمات':'Instructions'):(isRTL?'الوكلاء':'Agents')}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab==='basic' && <>
            <div>
              <label className="text-sm font-medium block mb-1">{isRTL?'الاسم *':'Name *'}</label>
              <input value={name} onChange={e=>setName(e.target.value)}
                placeholder={isRTL?'مثال: دكتوراه BIM، KSE البراند...':'e.g. BIM PhD, KSE Brand...'}
                className="w-full h-10 rounded-[var(--radius)] bg-input border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"/>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">{isRTL?'الوصف':'Description'}</label>
              <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2} dir="auto"
                placeholder={isRTL?'وصف مختصر...':'Brief description...'}
                className="w-full rounded-[var(--radius)] bg-input border border-border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"/>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">{isRTL?'اللون':'Color'}</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c=><button key={c} onClick={()=>setColor(c)}
                  className={cn('w-8 h-8 rounded-lg transition-all',color===c&&'ring-2 ring-offset-2 ring-offset-surface scale-110')}
                  style={{backgroundColor:c}}/>)}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">{isRTL?'الوكيل الافتراضي':'Default Agent'}</label>
              <select value={agent} onChange={e=>setAgent(e.target.value)}
                className="w-full h-10 rounded-[var(--radius)] bg-input border border-border px-3 text-sm focus:outline-none">
                {AGENTS.map(a=><option key={a.id} value={a.id}>{isRTL?a.ar:a.en}</option>)}
              </select>
              <p className="text-xs text-on-surface-tertiary mt-1">{isRTL?'الوكيل الذي يُفتح تلقائياً لمحادثات هذا المشروع':'Agent auto-selected for new chats in this project'}</p>
            </div>
          </>}

          {tab==='instructions' && <>
            <p className="text-xs text-on-surface-tertiary">
              {isRTL?'تُحقن تلقائياً في كل محادثة داخل المشروع — تخبر الوكلاء بسياق عملك وهدفك':'Auto-injected in every project conversation — tells agents your context and goals'}
            </p>
            <textarea value={instr} onChange={e=>setInstr(e.target.value)} rows={12} dir="auto"
              placeholder={isRTL?'مثال:\n- أنا عبدالله، طالب دكتوراه في BIM\n- بحثي يركز على تبني BIM في الكويت\n- أكتب باللغتين العربية والإنجليزية':'e.g.\n- I am Abdullah, PhD student in BIM\n- My research focuses on BIM adoption in Kuwait\n- I write in Arabic and English'}
              className="w-full rounded-[var(--radius)] bg-input border border-border px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"/>
            <p className="text-xs text-on-surface-tertiary">{instr.length} {isRTL?'حرف':'chars'}</p>
          </>}

          {tab==='agents' && <>
            <p className="text-sm text-on-surface-secondary">{isRTL?'تعليمات خاصة لكل وكيل داخل هذا المشروع':'Agent-specific instructions within this project'}</p>
            <select value={selAgent} onChange={e=>setSelAgent(e.target.value)}
              className="w-full h-10 rounded-[var(--radius)] bg-input border border-border px-3 text-sm">
              <option value="">{isRTL?'— اختر وكيلاً —':'— Select agent —'}</option>
              {AGENTS.map(a=><option key={a.id} value={a.id}>{isRTL?a.ar:a.en}</option>)}
            </select>
            {selAgent && <textarea value={agentInstrs[selAgent]||''} onChange={e=>setAgentInstrs(ai=>({...ai,[selAgent]:e.target.value}))} rows={5} dir="auto"
              className="w-full rounded-[var(--radius)] bg-input border border-border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"/>}
            {Object.keys(agentInstrs).filter(k=>agentInstrs[k]).length>0 && (
              <div className="space-y-1">
                {Object.entries(agentInstrs).filter(([,v])=>v).map(([k,v])=>(
                  <div key={k} className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm">
                    <span className="font-medium">{AGENTS.find(a=>a.id===k)?.[isRTL?'ar':'en']}</span>
                    <span className="text-on-surface-tertiary flex-1 truncate">{v.slice(0,50)}</span>
                    <button onClick={()=>{const n={...agentInstrs};delete n[k];setAgentInstrs(n);}} className="text-red-500"><X size={12}/></button>
                  </div>
                ))}
              </div>
            )}
          </>}
        </div>

        <div className="flex items-center gap-3 p-5 border-t border-border">
          <button onClick={onClose} className="flex-1 h-10 rounded-[var(--radius)] border border-border text-sm hover:bg-muted">
            {isRTL?'إلغاء':'Cancel'}
          </button>
          <button onClick={async()=>{if(!name.trim())return;setSaving(true);try{await onSave({name:name.trim(),description:desc,instructions:instr,color,defaultAgentId:agent,agentInstructions:agentInstrs});onClose();}finally{setSaving(false);}}}
            disabled={saving||!name.trim()}
            className="flex-1 h-10 rounded-[var(--radius)] bg-primary text-on-primary text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {saving&&<Loader2 size={14} className="animate-spin"/>}
            {initial?.id?(isRTL?'حفظ':'Save'):(isRTL?'إنشاء':'Create')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail Panel ─────────────────────────────────────────────────────
function ProjectDetail({ project, onClose, onEdit, language, onStartChat }: {
  project: Project; onClose: ()=>void; onEdit: ()=>void;
  language: 'ar'|'en'; onStartChat: (id:string,agentId?:string)=>void;
}) {
  const isRTL = language==='ar';
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>(project.files||[]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<'conversations'|'files'|'context'>('conversations');
  const [context, setContext] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(()=>{
    apiFetch<Conversation[]>(`/api/projects/${project.id}/conversations`)
      .then(setConvs).catch(()=>{}).finally(()=>setLoadingConvs(false));
  },[project.id]);

  useEffect(()=>{
    if(tab==='context')
      apiFetch<{context:string}>(`/api/projects/${project.id}/context`).then(d=>setContext(d.context)).catch(()=>{});
  },[tab,project.id]);

  const upload = async(file:File)=>{
    setUploading(true);
    try{
      const content=await file.text();
      const pf=await apiFetch<ProjectFile>(`/api/projects/${project.id}/files`,{method:'POST',body:JSON.stringify({name:file.name,content})});
      setFiles(f=>[...f,pf]);
    }finally{setUploading(false);}
  };

  const delFile=async(fid:string)=>{
    await apiFetch(`/api/projects/${project.id}/files/${fid}`,{method:'DELETE'}).catch(()=>{});
    setFiles(f=>f.filter(x=>x.id!==fid));
  };

  return(
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/50">
      <div className={cn('bg-surface rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-3xl h-[90vh] md:max-h-[85vh] flex flex-col',isRTL&&'rtl')} dir={isRTL?'rtl':'ltr'}>
        <div className="flex items-center gap-3 p-5 border-b border-border shrink-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{backgroundColor:(project.color||'#8b5cf6')+'25'}}>
            <FolderKanban size={20} style={{color:project.color||'#8b5cf6'}}/>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold truncate">{project.name}</h2>
            {project.description&&<p className="text-xs text-on-surface-tertiary truncate">{project.description}</p>}
          </div>
          <button onClick={onEdit} className="p-2 rounded-lg hover:bg-muted"><Edit2 size={16}/></button>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X size={16}/></button>
        </div>

        <div className="px-5 pt-4 pb-3 shrink-0">
          <button onClick={()=>onStartChat(project.id,project.defaultAgentId)}
            className="w-full h-11 rounded-[var(--radius-lg)] text-sm font-medium flex items-center justify-center gap-2 text-white"
            style={{backgroundColor:project.color||'#8b5cf6'}}>
            <MessageSquare size={16}/>
            {isRTL?'محادثة جديدة في هذا المشروع':'New chat in this project'}
          </button>
        </div>

        <div className="flex border-b border-border px-5 shrink-0">
          {(['conversations','files','context'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={cn('py-2.5 px-3 text-sm font-medium border-b-2 transition-colors',tab===t?'border-primary text-primary':'border-transparent text-on-surface-tertiary hover:text-on-surface')}>
              {t==='conversations'?`${isRTL?'محادثات':'Chats'} (${convs.length})`:t==='files'?`${isRTL?'ملفات':'Files'} (${files.length})`:(isRTL?'السياق':'Context')}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab==='conversations'&&(
            loadingConvs?<div className="flex items-center gap-2 text-on-surface-tertiary text-sm"><Loader2 size={14} className="animate-spin"/>{isRTL?'جاري التحميل...':'Loading...'}</div>
            :convs.length===0?<div className="text-center py-8 text-on-surface-tertiary text-sm">{isRTL?'لا توجد محادثات بعد':'No conversations yet'}</div>
            :<div className="space-y-1">{convs.map(cv=>(
              <a key={cv.id} href={`/chat/${cv.id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius)] hover:bg-muted group">
                <MessageSquare size={14} className="text-on-surface-tertiary shrink-0"/>
                <span className="flex-1 text-sm truncate">{cv.title||(isRTL?'محادثة':'Chat')}</span>
                <span className="text-xs text-on-surface-tertiary shrink-0">{ago(cv.updatedAt,isRTL)}</span>
                <ExternalLink size={12} className="text-on-surface-tertiary opacity-0 group-hover:opacity-100"/>
              </a>
            ))}</div>
          )}

          {tab==='files'&&(
            <div className="space-y-3">
              <div className="border-2 border-dashed border-border rounded-[var(--radius-lg)] p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5"
                onClick={()=>fileRef.current?.click()}
                onDragOver={e=>e.preventDefault()}
                onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)upload(f);}}>
                {uploading?<Loader2 size={20} className="animate-spin mx-auto text-primary"/>:
                  <><Upload size={20} className="mx-auto mb-2 text-on-surface-tertiary"/>
                  <p className="text-sm text-on-surface-tertiary">{isRTL?'اسحب ملفاً أو انقر للرفع':'Drag a file or click to upload'}</p>
                  <p className="text-xs text-on-surface-tertiary mt-1">{isRTL?'نصوص، PDF، مستندات (.txt .md .pdf .doc)':'Text, PDF, docs (.txt .md .pdf .doc)'}</p></>}
              </div>
              <input ref={fileRef} type="file" className="hidden" accept=".txt,.md,.pdf,.doc,.docx"
                onChange={e=>{if(e.target.files?.[0])upload(e.target.files[0]);}}/>
              {files.length===0?<p className="text-sm text-on-surface-tertiary text-center py-4">{isRTL?'لا ملفات بعد':'No files yet'}</p>:
                <div className="space-y-1">{files.map(f=>(
                  <div key={f.id} className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius)] hover:bg-muted group">
                    <FileText size={14} className="text-on-surface-tertiary shrink-0"/>
                    <span className="flex-1 text-sm truncate">{f.name}</span>
                    <span className="text-xs text-on-surface-tertiary">{fmtSize(f.size)}</span>
                    <button onClick={()=>delFile(f.id)} className="p-1 text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={12}/></button>
                  </div>
                ))}</div>}
            </div>
          )}

          {tab==='context'&&(
            <div>
              <p className="text-xs text-on-surface-tertiary mb-3">{isRTL?'هذا ما يُحقن في system prompt لكل محادثة في هذا المشروع:':'This is injected into every conversation in this project:'}</p>
              <pre className="text-xs bg-muted rounded-[var(--radius)] p-3 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed" dir="auto">
                {context||(isRTL?'لا يوجد context بعد':'No context yet')}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────
export function ProjectsPageView() {
  const { language } = useAppStore();
  const isRTL = language==='ar';
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Project|null>(null);
  const [detail, setDetail] = useState<Project|null>(null);

  const load = useCallback(async()=>{
    try{
      const [active,archived]=await Promise.all([
        apiFetch<Project[]>('/api/projects'),
        apiFetch<Project[]>('/api/projects?archived=true'),
      ]);
      setProjects([...(active||[]),(archived||[])].flat());
    }finally{setLoading(false);}
  },[]);
  useEffect(()=>{load();},[load]);

  const filtered=projects.filter(p=>{
    if(p.archived!==showArchived)return false;
    if(!search.trim())return true;
    const q=search.toLowerCase();
    return p.name.toLowerCase().includes(q)||(p.description||'').toLowerCase().includes(q);
  }).sort((a,b)=>{
    if(a.pinned&&!b.pinned)return -1;if(!a.pinned&&b.pinned)return 1;
    return new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime();
  });

  const create=async(data:Partial<Project>)=>{const p=await apiFetch<Project>('/api/projects',{method:'POST',body:JSON.stringify(data)});setProjects(ps=>[p,...ps]);};
  const update=async(id:string,data:Partial<Project>)=>{const p=await apiFetch<Project>(`/api/projects/${id}`,{method:'PUT',body:JSON.stringify(data)});setProjects(ps=>ps.map(x=>x.id===id?p:x));if(detail?.id===id)setDetail(p);};
  const del=async(id:string)=>{if(!confirm(isRTL?'حذف المشروع؟ المحادثات لن تُحذف.':'Delete project? Conversations will not be deleted.'))return;await apiFetch(`/api/projects/${id}`,{method:'DELETE'});setProjects(ps=>ps.filter(p=>p.id!==id));if(detail?.id===id)setDetail(null);};
  const archive=async(id:string,a:boolean)=>{const p=await apiFetch<Project>(`/api/projects/${id}/${a?'archive':'restore'}`,{method:'PUT'});setProjects(ps=>ps.map(x=>x.id===id?p:x));};
  const startChat=(pid:string,agentId?:string)=>router.push(`/?projectId=${pid}${agentId?`&agentId=${agentId}`:''}`);

  return(
    <div className={cn('max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-4',isRTL&&'rtl')} dir={isRTL?'rtl':'ltr'}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
          <FolderKanban size={18} className="text-violet-500"/>
        </div>
        <h1 className="text-xl font-semibold">{isRTL?'المشاريع':'Projects'}</h1>
        <span className="text-sm text-on-surface-tertiary">({filtered.length})</span>
        <div className="ms-auto flex items-center gap-2">
          <button onClick={()=>setShowArchived(!showArchived)}
            className={cn('text-xs px-3 py-1.5 rounded-lg',showArchived?'bg-muted text-on-surface':'text-on-surface-tertiary hover:bg-muted')}>
            <Archive size={12} className="inline me-1"/>
            {isRTL?'الأرشيف':'Archive'}
          </button>
          <button onClick={()=>{setEditing(null);setShowModal(true);}}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-sm font-medium">
            <Plus size={14}/>{isRTL?'مشروع جديد':'New project'}
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-tertiary"/>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder={isRTL?'ابحث في المشاريع...':'Search projects...'}
          className="w-full h-9 rounded-[var(--radius)] bg-input border border-border ps-9 pe-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"/>
      </div>

      {!loading&&filtered.length===0&&(
        <div className="space-y-6">
          {/* Quick templates */}
          <div>
            <p className="text-sm text-on-surface-tertiary mb-3">{isRTL?'ابدأ بقالب جاهز:':'Start with a template:'}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { color:'#8b5cf6', name:{ar:'دكتوراه BIM',en:'BIM PhD'}, desc:{ar:'بحث أكاديمي في تبني BIM بالكويت',en:'BIM adoption research in Kuwait'}, instructions:{ar:`- أنا عبدالله، طالب دكتوراه في BIM بجامعة برمنغهام\n- بحثي: تبني BIM في قطاع البناء الكويتي والخليجي\n- مشرفان: د. ريتشارد (رئيسي) وبروف. إيان (ثانوي)\n- أكتب باللغتين العربية والإنجليزية\n- مرحلة البحث: مراجعة الأدبيات + جمع البيانات`,en:`- Abdullah, PhD student in BIM at University of Birmingham\n- Research: BIM adoption in Kuwait & GCC construction sector\n- Supervisors: Dr. Richard (primary), Prof. Ian (secondary)\n- Write in both Arabic and English\n- Stage: Literature review + data collection`}, agent:'research' },
                { color:'#3b82f6', name:{ar:'KSE التحول الرقمي',en:'KSE Digital'}, desc:{ar:'تطوير منصات KSE الرقمية',en:'KSE digital platform development'}, instructions:{ar:`- مشروع رقمي لتطوير منصات شركة KSE الكويتية\n- التقنيات: Next.js, Supabase, Vercel\n- المجال: قطاع البناء والهندسة في الكويت\n- الأهداف: منصة عقود، دليل مشاريع، نظام دعوات`,en:`- Digital project for KSE Kuwait company platforms\n- Stack: Next.js, Supabase, Vercel\n- Domain: Construction & engineering in Kuwait\n- Goals: contracts platform, project directory, invitation system`}, agent:'manager' },
                { color:'#ec4899', name:{ar:'محتوى تعليمي',en:'Educational Content'}, desc:{ar:'كاروسيل وريلز تعليمية عربية',en:'Arabic educational carousels & reels'}, instructions:{ar:`- محتوى تعليمي عربي عن الهندسة والتكنولوجيا\n- الجمهور: مهندسون وطلاب في الخليج\n- الأسلوب: بسيط، مرئي، عملي\n- المنصات: إنستغرام (ريلز + كاروسيل)`,en:`- Arabic educational content about engineering & tech\n- Audience: Engineers and students in the Gulf\n- Style: Simple, visual, practical\n- Platforms: Instagram (reels + carousels)`}, agent:'content-creator' },
              ].map((t,i)=>(
                <button key={i}
                  onClick={()=>create({name:t.name[isRTL?'ar':'en'],description:t.desc[isRTL?'ar':'en'],instructions:t.instructions[isRTL?'ar':'en'],color:t.color,defaultAgentId:t.agent,agentInstructions:{}})}
                  className="text-start rounded-[var(--radius-lg)] border border-border p-4 hover:border-primary/30 hover:shadow-sm transition-all"
                  style={{borderInlineStartColor:t.color,borderInlineStartWidth:3}}>
                  <p className="font-medium text-sm mb-1">{t.name[isRTL?'ar':'en']}</p>
                  <p className="text-xs text-on-surface-tertiary">{t.desc[isRTL?'ar':'en']}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="text-center">
            <button onClick={()=>{setEditing(null);setShowModal(true);}}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius)] border border-border text-sm hover:bg-muted">
              <Plus size={14}/>{isRTL?'مشروع فارغ':'Empty project'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(p=>(
          <div key={p.id}
            className="group relative rounded-[var(--radius-lg)] border border-border bg-surface p-4 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all"
            style={{borderInlineStartColor:p.color,borderInlineStartWidth:3}}
            onClick={()=>setDetail(p)}>
            {p.pinned&&<Pin size={12} className="absolute top-3 end-3 text-amber-500"/>}
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{backgroundColor:(p.color||'#8b5cf6')+'20'}}>
                <FolderKanban size={16} style={{color:p.color||'#8b5cf6'}}/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{p.name}</p>
                {p.description&&<p className="text-xs text-on-surface-tertiary truncate mt-0.5">{p.description}</p>}
              </div>
            </div>
            {p.instructions&&<p className="text-xs text-on-surface-secondary line-clamp-2 mb-3 leading-relaxed" dir="auto">{p.instructions}</p>}
            <div className="flex items-center gap-2 text-xs text-on-surface-tertiary">
              {(p.files||[]).length>0&&<span className="flex items-center gap-1"><FileText size={11}/>{p.files!.length}</span>}
              {p.defaultAgentId&&<span className="flex items-center gap-1"><Bot size={11}/>{AGENTS.find(a=>a.id===p.defaultAgentId)?.[isRTL?'ar':'en']}</span>}
              <span className="ms-auto">{ago(p.updatedAt,isRTL)}</span>
            </div>
            <div className="absolute top-2 end-8 opacity-0 group-hover:opacity-100 flex items-center gap-1">
              <button onClick={e=>{e.stopPropagation();setEditing(p);setShowModal(true);}} className="p-1.5 rounded-lg hover:bg-muted"><Settings size={13}/></button>
              <button onClick={e=>{e.stopPropagation();archive(p.id,!p.archived);}} className="p-1.5 rounded-lg hover:bg-muted">{p.archived?<RotateCcw size={13}/>:<Archive size={13}/>}</button>
              <button onClick={e=>{e.stopPropagation();del(p.id);}} className="p-1.5 rounded-lg hover:bg-muted text-red-500"><Trash2 size={13}/></button>
            </div>
          </div>
        ))}
      </div>

      {showModal&&<ProjectModal initial={editing||undefined} language={language as 'ar'|'en'}
        onClose={()=>{setShowModal(false);setEditing(null);}}
        onSave={async d=>{if(editing)await update(editing.id,d);else await create(d);}}/>}
      {detail&&<ProjectDetail project={detail} language={language as 'ar'|'en'}
        onClose={()=>setDetail(null)} onEdit={()=>{setEditing(detail);setDetail(null);setShowModal(true);}}
        onStartChat={startChat}/>}
    </div>
  );
}
