// apps/web/e2e/editor.spec.ts
// Per docs/architecture/19-testing-strategy.md — E2E Flow Editor Tests

import { test, expect, type Page } from "@playwright/test";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Drag a node from the sidebar palette onto the React Flow canvas.
 * Uses Playwright's mouse API for a robust drag-and-drop.
 */
async function addNodeToCanvas(
  page: Page,
  nodeType: string,
  position: { x: number; y: number },
) {
  const paletteItem = page.locator(`[data-testid="palette-node-${nodeType}"]`);
  const canvas = page.locator('[data-testid="react-flow-canvas"]');

  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("Canvas bounding box not found");

  await paletteItem.hover();
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + position.x, canvasBox.y + position.y, {
    steps: 10,
  });
  await page.mouse.up();
}

/**
 * Create a minimal flow with a Program → Instruction → Account structure.
 */
async function createMinimalFlow(page: Page) {
  await addNodeToCanvas(page, "program", { x: 300, y: 150 });
  await addNodeToCanvas(page, "instruction", { x: 300, y: 300 });
  await addNodeToCanvas(page, "account", { x: 300, y: 450 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Flow Editor", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a test project editor.
    // The test-project slug is pre-seeded in the test DB via fixtures.
    await page.goto("/editor/test-project");
    await page.waitForSelector('[data-testid="react-flow-canvas"]', {
      timeout: 15_000,
    });
  });

  test("canvas renders on page load", async ({ page }) => {
    const canvas = page.locator('[data-testid="react-flow-canvas"]');
    await expect(canvas).toBeVisible();
  });

  test("node palette is visible on load", async ({ page }) => {
    const palette = page.locator('[data-testid="node-palette"]');
    await expect(palette).toBeVisible();
  });

  test("should add a program node via drag and drop", async ({ page }) => {
    await addNodeToCanvas(page, "program", { x: 300, y: 150 });

    const node = page.locator('[data-testid="flow-node-program"]');
    await expect(node).toBeVisible();
  });

  test("should add an instruction node via drag and drop", async ({ page }) => {
    await addNodeToCanvas(page, "instruction", { x: 300, y: 300 });

    const node = page.locator('[data-testid="flow-node-instruction"]');
    await expect(node).toBeVisible();
  });

  test("should connect program to instruction node", async ({ page }) => {
    await addNodeToCanvas(page, "program", { x: 200, y: 150 });
    await addNodeToCanvas(page, "instruction", { x: 200, y: 350 });

    const sourceHandle = page
      .locator('[data-testid="flow-node-program"] .react-flow__handle-bottom')
      .first();
    const targetHandle = page
      .locator('[data-testid="flow-node-instruction"] .react-flow__handle-top')
      .first();

    await sourceHandle.dragTo(targetHandle);

    const edges = page.locator(".react-flow__edge");
    await expect(edges).toHaveCount(1);
  });

  test("should generate code preview in real-time", async ({ page }) => {
    await createMinimalFlow(page);

    // Open the code preview panel via keyboard shortcut
    await page.keyboard.press("Control+1");

    const codePanel = page.locator('[data-testid="code-preview"]');
    await expect(codePanel).toBeVisible({ timeout: 5_000 });
    await expect(codePanel).toContainText("declare_id!");
  });

  test("should open and close node inspector panel", async ({ page }) => {
    await addNodeToCanvas(page, "program", { x: 300, y: 150 });

    // Click the program node to open the inspector
    await page.locator('[data-testid="flow-node-program"]').click();

    const inspector = page.locator('[data-testid="node-inspector"]');
    await expect(inspector).toBeVisible();

    // Press Escape to close
    await page.keyboard.press("Escape");
    await expect(inspector).not.toBeVisible();
  });

  test("should save and restore project", async ({ page }) => {
    await createMinimalFlow(page);

    // Save the project
    await page.keyboard.press("Control+s");
    const saveStatus = page.locator('[data-testid="save-status"]');
    await expect(saveStatus).toContainText("Saved", { timeout: 5_000 });

    // Reload the page
    await page.reload();
    await page.waitForSelector('[data-testid="react-flow-canvas"]', {
      timeout: 15_000,
    });

    // Verify nodes are restored (program + instruction + account = 3)
    const nodes = page.locator(".react-flow__node");
    await expect(nodes).toHaveCount(3);
  });

  test("should show audit score panel after flow is built", async ({
    page,
  }) => {
    await createMinimalFlow(page);

    const auditPanel = page.locator('[data-testid="audit-score"]');
    await expect(auditPanel).toBeVisible({ timeout: 5_000 });
    // Score should be a number between 0 and 100
    const scoreText = await auditPanel.textContent();
    const score = parseInt(scoreText ?? "0", 10);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test("undo/redo works after adding nodes", async ({ page }) => {
    await addNodeToCanvas(page, "program", { x: 300, y: 150 });

    let nodes = page.locator(".react-flow__node");
    await expect(nodes).toHaveCount(1);

    // Undo — node should disappear
    await page.keyboard.press("Control+z");
    await expect(nodes).toHaveCount(0);

    // Redo — node should reappear
    await page.keyboard.press("Control+y");
    await expect(nodes).toHaveCount(1);
  });

  test("framework toggle switches between Anchor and Pinocchio", async ({
    page,
  }) => {
    const toggle = page.locator('[data-testid="framework-toggle"]');
    await expect(toggle).toBeVisible();

    // Default should be Anchor
    await expect(toggle).toContainText("Anchor");

    // Toggle to Pinocchio
    await toggle.click();
    await expect(toggle).toContainText("Pinocchio");

    // Toggle back to Anchor
    await toggle.click();
    await expect(toggle).toContainText("Anchor");
  });
});
