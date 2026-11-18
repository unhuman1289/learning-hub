import { expect } from '@playwright/test';

export async function openLessonSummary(page) {
  const summary = page.getByRole('region', { name: 'Tổng kết bài' });
  const activeSheet = page.locator('.lesson-flow-window-page[data-active]');
  await expect(activeSheet).toBeVisible();
  while (!await summary.isVisible()) {
    const currentPage = await activeSheet.getAttribute('data-question-page');
    await page.locator('[data-turn-edge=right]:visible').tap();
    await expect(activeSheet).not.toHaveAttribute('data-question-page', currentPage ?? '');
    await expect(page.locator('html')).not.toHaveAttribute('data-lesson-turn');
    if (currentPage === null) await expect(activeSheet).toHaveAttribute('data-question-page', /\d+/);
  }
  return summary;
}
