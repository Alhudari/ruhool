/**
 * Code Fixer — validates and fixes Remotion code before rendering.
 * Catches common issues that cause esbuild to fail.
 */

export function fixRemotionCode(code: string): { fixed: string; issues: string[] } {
  const issues: string[] = [];
  let fixed = code.trim();

  // 1. Remove duplicate imports
  const importLines = new Map<string, string>();
  const nonImportLines: string[] = [];
  for (const line of fixed.split('\n')) {
    const importMatch = line.match(/^import\s+.*from\s+['"](.+)['"]/);
    if (importMatch) {
      const mod = importMatch[1];
      if (importLines.has(mod)) {
        // Merge imports
        const existing = importLines.get(mod)!;
        const existingNames = existing.match(/\{([^}]+)\}/)?.[1] || '';
        const newNames = line.match(/\{([^}]+)\}/)?.[1] || '';
        if (existingNames && newNames) {
          const allNames = [...new Set([...existingNames.split(','), ...newNames.split(',')].map(n => n.trim()).filter(Boolean))];
          importLines.set(mod, `import { ${allNames.join(', ')} } from '${mod}';`);
          issues.push(`Merged duplicate import from '${mod}'`);
        }
      } else {
        importLines.set(mod, line);
      }
    } else {
      nonImportLines.push(line);
    }
  }
  fixed = [...importLines.values(), '', ...nonImportLines].join('\n');

  // 2. Ensure React import
  if (!fixed.includes("from 'react'") && !fixed.includes('from "react"')) {
    fixed = `import React from 'react';\n` + fixed;
    issues.push('Added missing React import');
  }

  // 3. Ensure remotion import
  if (!fixed.includes("from 'remotion'") && !fixed.includes('from "remotion"')) {
    fixed = `import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from 'remotion';\n` + fixed;
    issues.push('Added missing remotion import');
  }

  // 4. Check balanced braces
  let braces = 0, parens = 0;
  for (const ch of fixed) {
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '(') parens++;
    if (ch === ')') parens--;
  }

  // Fix unbalanced braces by adding missing closings
  if (braces > 0) {
    for (let i = 0; i < braces; i++) fixed += '\n}';
    issues.push(`Added ${braces} missing closing braces`);
  }
  if (parens > 0) {
    for (let i = 0; i < parens; i++) fixed += '\n)';
    issues.push(`Added ${parens} missing closing parentheses`);
  }

  // 5. Remove duplicate component declarations (keep the LAST one)
  const compDeclarations = [...fixed.matchAll(/^(const|function)\s+([A-Z]\w+)/gm)];
  const declCounts = new Map<string, number>();
  for (const m of compDeclarations) {
    declCounts.set(m[2], (declCounts.get(m[2]) || 0) + 1);
  }
  for (const [name, count] of declCounts) {
    if (count > 1) {
      // Keep only the last declaration block — remove earlier ones
      // Find all positions, keep the last
      const regex = new RegExp(`(const|function)\\s+${name}[\\s\\S]*?(?=\\n(?:const|function|export|import|$))`, 'g');
      const matches = [...fixed.matchAll(regex)];
      if (matches.length > 1) {
        // Remove all but last
        for (let i = 0; i < matches.length - 1; i++) {
          fixed = fixed.replace(matches[i][0], `// removed duplicate ${name}`);
        }
        issues.push(`Removed ${count - 1} duplicate declaration(s) of ${name}`);
      }
    }
  }

  // 6. Remove duplicate export defaults (keep last)
  const exportDefaults = [...fixed.matchAll(/export\s+default\s+\w+\s*;?/g)];
  if (exportDefaults.length > 1) {
    for (let i = 0; i < exportDefaults.length - 1; i++) {
      fixed = fixed.replace(exportDefaults[i][0], '// removed duplicate export');
    }
    issues.push(`Removed ${exportDefaults.length - 1} duplicate export default(s)`);
  }

  // 7. Ensure export default exists
  if (!/export\s+default/.test(fixed)) {
    const comps = [...fixed.matchAll(/(?:const|function)\s+([A-Z]\w+)/g)];
    if (comps.length > 0) {
      const last = comps[comps.length - 1][1];
      fixed += `\nexport default ${last};\n`;
      issues.push(`Added export default ${last}`);
    }
  }

  // 6. Remove any registerRoot calls (we add our own in entry)
  if (fixed.includes('registerRoot')) {
    fixed = fixed.replace(/.*registerRoot.*\n?/g, '');
    issues.push('Removed registerRoot (handled by entry)');
  }

  // 7. Remove Composition import/usage (handled by entry)
  fixed = fixed.replace(/,?\s*Composition\s*,?/g, (match) => {
    if (match.trim() === 'Composition') return '';
    return match.replace('Composition', '').replace(/,\s*,/g, ',').replace(/{\s*,/g, '{').replace(/,\s*}/g, '}');
  });

  return { fixed, issues };
}
