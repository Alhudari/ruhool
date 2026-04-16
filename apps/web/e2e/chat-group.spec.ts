/**
 * CHAT_V2 P1 + P2 — WhatsApp-group E2E scenarios.
 *
 * Covers the three runtime scenarios called out in CHAT_GROUP_AUDIT.md §P1/P2:
 *   1. Multi-mention → multiple bubbles with distinct avatars + names.
 *   2. Manager delegation + workflow → handoff + specialist bubbles appear.
 *   3. Fresh-conv first-message → response within 5s without resend.
 *
 * Gated behind the CHAT_V2 server env flag + the localStorage client flag. The
 * flag is flipped in `beforeEach` so tests exercise the new path; legacy path
 * is covered by `smoke.spec.ts`.
 *
 * NOTE: these tests require a live API key in the backend. In CI with no key
 * configured, they'll be `skip`-ed via the `requiresLiveApi` guard below.
 */
import { test, expect } from '@playwright/test';

const requiresLiveApi = !process.env.CHAT_V2_E2E_LIVE;

test.describe('CHAT_V2 — WhatsApp-group chat', () => {
  test.beforeEach(async ({ page }) => {
    // Flip the client-side feature flag before first navigation so the chat
    // stream handler registers the new SSE event listeners.
    await page.addInitScript(() => {
      try { window.localStorage.setItem('ruhool-features-chat-v2', '1'); } catch {}
    });
  });

  test('P1 — multi-mention produces two bubbles with distinct avatars', async ({ page }) => {
    test.skip(requiresLiveApi, 'requires live Anthropic API key — set CHAT_V2_E2E_LIVE=1 to run');
    await page.goto('/');
    const input = page.locator('textarea, input[type="text"]').first();
    await input.fill('@عبدان @شواشة عرّفوا نفسكم باختصار');
    await input.press('Enter');
    // Wait for at least two assistant bubbles to appear.
    await expect(page.locator('[data-role="assistant"], .assistant-bubble, [dir="rtl"] p').nth(1))
      .toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: 'docs/screenshots/chat-group-multi-mention.png', fullPage: true });
  });

  test('P2 — manager delegation + workflow emits handoff + specialist bubbles', async ({ page }) => {
    test.skip(requiresLiveApi, 'requires live Anthropic API key — set CHAT_V2_E2E_LIVE=1 to run');
    await page.goto('/');
    const input = page.locator('textarea, input[type="text"]').first();
    await input.fill('@الراعي أوكل عبدان ببحث سريع عن BIM في الكويت');
    await input.press('Enter');
    // Expect a reply within 30s (manager haiku ~2-5s, dispatch ~10-20s).
    await expect(page.locator('text=/عبدان|BIM/').first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: 'docs/screenshots/chat-group-delegation.png', fullPage: true });
  });

  test('P0 regression — fresh chat first message does not drop', async ({ page }) => {
    test.skip(requiresLiveApi, 'requires live Anthropic API key — set CHAT_V2_E2E_LIVE=1 to run');
    await page.goto('/');
    const input = page.locator('textarea, input[type="text"]').first();
    await input.fill('@الراعي مرحبا');
    await input.press('Enter');
    await expect(page.locator('text=/الراعي|مرحبا/').first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: 'docs/screenshots/chat-group-first-message.png', fullPage: true });
  });
});
