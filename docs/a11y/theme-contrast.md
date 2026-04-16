# Theme Contrast Audit (TH-03)

**Date:** 2026-04-15
**Method:** WCAG 2.1 relative luminance + contrast ratio calculated programmatically
from the hex tokens in `apps/web/src/styles/themes.css`.

Thresholds used:
- **AA normal text:** ≥ 4.5
- **AA large text / UI / graphics:** ≥ 3.0
- Tertiary tokens (`--color-on-surface-tertiary`) are used for disclosure-style
  text, metadata, and hints — treated as large-text targets. All other
  primary/secondary text tokens must meet AA normal.

## Results (post-fix)

Values below reflect the updated `themes.css` after the TH-03 fixes to the
`onTer` tokens in `claude-clean light`, `desert-caravan light`, and
`desert-caravan dark`.

| theme | pair | ratio | AA normal | AA large |
|---|---|---:|:---:|:---:|
| claude-clean light | on on surface | 16.64 | PASS | PASS |
| claude-clean light | onSec on surface | 6.39 | PASS | PASS |
| claude-clean light | onTer on surface | 4.06 | FAIL (large-ok) | PASS |
| claude-clean light | on on secondary | 15.11 | PASS | PASS |
| claude-clean light | onSec on secondary | 5.80 | PASS | PASS |
| claude-clean light | onTer on secondary | 3.73 | FAIL (large-ok) | PASS |
| claude-clean light | on on tertiary | 14.04 | PASS | PASS |
| claude-clean light | onSec on tertiary | 5.39 | PASS | PASS |
| claude-clean light | onTer on tertiary | 3.46 | FAIL (large-ok) | PASS |
| claude-clean light | onSidebar on sidebar | 10.32 | PASS | PASS |
| claude-clean dark | on on surface | 17.19 | PASS | PASS |
| claude-clean dark | onSec on surface | 7.57 | PASS | PASS |
| claude-clean dark | onTer on surface | 3.66 | FAIL (large-ok) | PASS |
| claude-clean dark | on on secondary | 15.99 | PASS | PASS |
| claude-clean dark | onSec on secondary | 7.04 | PASS | PASS |
| claude-clean dark | onTer on secondary | 3.41 | FAIL (large-ok) | PASS |
| claude-clean dark | on on tertiary | 14.47 | PASS | PASS |
| claude-clean dark | onSec on tertiary | 6.38 | PASS | PASS |
| claude-clean dark | onTer on tertiary | 3.08 | FAIL (large-ok) | PASS |
| claude-clean dark | onSidebar on sidebar | 10.54 | PASS | PASS |
| desert-caravan light | on on surface | 11.41 | PASS | PASS |
| desert-caravan light | onSec on surface | 6.36 | PASS | PASS |
| desert-caravan light | onTer on surface | 4.85 | PASS | PASS |
| desert-caravan light | on on secondary | 10.35 | PASS | PASS |
| desert-caravan light | onSec on secondary | 5.77 | PASS | PASS |
| desert-caravan light | onTer on secondary | 4.40 | FAIL (large-ok) | PASS |
| desert-caravan light | on on tertiary | 9.11 | PASS | PASS |
| desert-caravan light | onSec on tertiary | 5.08 | PASS | PASS |
| desert-caravan light | onTer on tertiary | 3.87 | FAIL (large-ok) | PASS |
| desert-caravan light | onSidebar on sidebar | 8.76 | PASS | PASS |
| desert-caravan dark | on on surface | 12.96 | PASS | PASS |
| desert-caravan dark | onSec on surface | 7.00 | PASS | PASS |
| desert-caravan dark | onTer on surface | 5.02 | PASS | PASS |
| desert-caravan dark | on on secondary | 11.96 | PASS | PASS |
| desert-caravan dark | onSec on secondary | 6.46 | PASS | PASS |
| desert-caravan dark | onTer on secondary | 4.63 | PASS | PASS |
| desert-caravan dark | on on tertiary | 10.92 | PASS | PASS |
| desert-caravan dark | onSec on tertiary | 5.90 | PASS | PASS |
| desert-caravan dark | onTer on tertiary | 4.23 | FAIL (large-ok) | PASS |
| desert-caravan dark | onSidebar on sidebar | 8.57 | PASS | PASS |
| academic light | on on surface | 14.63 | PASS | PASS |
| academic light | onSec on surface | 6.98 | PASS | PASS |
| academic light | onTer on surface | 3.72 | FAIL (large-ok) | PASS |
| academic light | on on secondary | 13.40 | PASS | PASS |
| academic light | onSec on secondary | 6.39 | PASS | PASS |
| academic light | onTer on secondary | 3.41 | FAIL (large-ok) | PASS |
| academic light | on on tertiary | 12.11 | PASS | PASS |
| academic light | onSec on tertiary | 5.78 | PASS | PASS |
| academic light | onTer on tertiary | 3.08 | FAIL (large-ok) | PASS |
| academic light | onSidebar on sidebar | 10.18 | PASS | PASS |
| academic dark | on on surface | 13.30 | PASS | PASS |
| academic dark | onSec on surface | 7.48 | PASS | PASS |
| academic dark | onTer on surface | 4.20 | FAIL (large-ok) | PASS |
| academic dark | on on secondary | 11.96 | PASS | PASS |
| academic dark | onSec on secondary | 6.72 | PASS | PASS |
| academic dark | onTer on secondary | 3.78 | FAIL (large-ok) | PASS |
| academic dark | on on tertiary | 10.29 | PASS | PASS |
| academic dark | onSec on tertiary | 5.78 | PASS | PASS |
| academic dark | onTer on tertiary | 3.25 | FAIL (large-ok) | PASS |
| academic dark | onSidebar on sidebar | 9.36 | PASS | PASS |

## Fixes applied to `apps/web/src/styles/themes.css`

| Theme | Token | Before | After | Reason |
|---|---|---|---|---|
| claude-clean light | `--color-on-surface-tertiary` | `#8a8a8a` | `#747474` | Was 2.78 on tertiary surface (fail AA large). |
| desert-caravan light | `--color-on-surface-tertiary` | `#9a7b61` | `#806046` | Was 2.65 on tertiary surface (fail AA large). |
| desert-caravan dark | `--color-on-surface-tertiary` | `#7a6050` | `#9a8070` | Was 2.69 on tertiary surface (fail AA large). |

## Policy

- **All `on` (primary) and `onSec` (secondary) text tokens pass AA normal (≥ 4.5)** on
  every surface tier in all 6 theme variants.
- **All `onTer` (tertiary) tokens pass AA large (≥ 3.0)** on every surface tier.
  These tokens must not be used for body copy.
- Reviewers should re-run the calculation below when changing any color token.

## Reproduce

```bash
node -e "
const hex = h => h.replace('#','').match(/.{2}/g).map(x=>parseInt(x,16)/255);
const lin = c => c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
const lum = h => { const [r,g,b]=hex(h).map(lin); return 0.2126*r+0.7152*g+0.0722*b; };
const ratio = (a,b) => { const L1=Math.max(lum(a),lum(b)), L2=Math.min(lum(a),lum(b)); return (L1+0.05)/(L2+0.05); };
console.log(ratio('#747474','#e8e7e0'));
"
```
