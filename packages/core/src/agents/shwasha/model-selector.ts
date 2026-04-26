// Shwasha model selection.
// Hybrid routing: default to Claude; when `localAvailable` is true, prefer
// local Ollama for vision / personal writing / embeddings. The flag is now
// controlled by the Shwasha settings (store.shwashaSettings.ollamaEnabled);
// env var OLLAMA_ENABLED stays as a boot-time fallback.

export type ShwashaTask =
  | 'analyze_page'
  | 'refine_analysis'
  | 'vision_hard'
  | 'vision_normal'
  | 'personal_writing'
  | 'quick_chat'
  | 'embedding'
  | 'chapter_analysis'
  | 'clippings_analysis'
  | 'library_search';

export interface ModelChoice {
  provider: string;
  model: string;
}

export interface ModelSelectOpts {
  deep?: boolean;
  localAvailable?: boolean;
}

export function selectShwashaModel(task: ShwashaTask, opts?: ModelSelectOpts): ModelChoice {
  const localAvailable = opts?.localAvailable ?? process.env.OLLAMA_ENABLED === 'true';

  switch (task) {
    case 'analyze_page':
      return { provider: 'claude', model: 'claude-sonnet-4-6' };

    case 'refine_analysis':
      return opts?.deep
        ? { provider: 'claude', model: 'claude-opus-4-7' }
        : { provider: 'claude', model: 'claude-sonnet-4-6' };

    case 'vision_hard':
      return { provider: 'claude', model: 'claude-opus-4-7' };

    case 'vision_normal':
      return localAvailable
        ? { provider: 'ollama', model: 'qwen2.5-vl:32b' }
        : { provider: 'claude', model: 'claude-sonnet-4-6' };

    case 'personal_writing':
      return localAvailable
        ? { provider: 'ollama', model: 'gemma3:12b' }
        : { provider: 'claude', model: 'claude-sonnet-4-6' };

    case 'quick_chat':
      return { provider: 'claude', model: 'claude-haiku-4-5' };

    case 'embedding':
      return localAvailable
        ? { provider: 'ollama', model: 'nomic-embed-text' }
        : { provider: 'openai', model: 'text-embedding-3-small' };

    case 'chapter_analysis':
      return { provider: 'claude', model: 'claude-sonnet-4-6' };

    case 'clippings_analysis':
      return { provider: 'claude', model: 'claude-sonnet-4-6' };

    case 'library_search':
      return { provider: 'claude', model: 'claude-sonnet-4-6' };

    default: {
      // Exhaustiveness guard.
      const _exhaustive: never = task;
      throw new Error(`Unknown Shwasha task: ${String(_exhaustive)}`);
    }
  }
}
