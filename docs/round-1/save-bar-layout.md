# Round 1 — SaveBar layout padding strategy

## Problem

`SaveBar` is `position: fixed; bottom: 0;` and floats over the page content.
On short forms, that's invisible. On long forms, the floating bar **covers
the last field** when the user scrolls to the end.

## Options considered

| Option                                  | Pros                             | Cons                                                                  |
|-----------------------------------------|----------------------------------|-----------------------------------------------------------------------|
| Hardcode `pb-24` on every settings form | simple                           | easy to forget; silent when someone copies a form                     |
| `SaveBar` inserts a sibling spacer `<div>` | one site of change               | spacer is not inside form flow; doesn't stretch on resize             |
| Export `useSaveBarHeight()` hook        | form opts in; responsive         | needs a `<div className="h-…" />` at the bottom of each form          |

## Chosen: `useSaveBarHeight()` hook

Rationale:

- Each form explicitly reserves bottom padding that matches the current
  SaveBar height, so the last field is always clear.
- The hook measures the actual rendered bar once and on resize, so if the
  bar grows (error message, retry button) the spacer grows with it.
- It's opt-in: existing forms that were never long enough to hit this
  don't have to change.

## API

```tsx
import { SaveBar, useSaveBarHeight } from '@/components/settings/save-bar';

export function MyForm() {
  const saveBarPad = useSaveBarHeight();
  // …
  return (
    <form>
      {/* fields */}
      <div style={{ height: saveBarPad }} aria-hidden="true" />
      <SaveBar … />
    </form>
  );
}
```

When `dirty` is false the bar is not rendered, and `useSaveBarHeight()`
returns `0` so no spacer is drawn.

## Accessibility

The spacer is `aria-hidden="true"` — it adds no semantic content. Focus
order is unaffected because `tabIndex` is not set and there is no
focusable child.
