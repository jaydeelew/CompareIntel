/**
 * Layout audit: a display equation that is the first child of a list item
 * must start on the marker's line (bug 20). Mid-item displays keep their
 * top margin (bug 13). Bounding boxes come from a real Playwright render
 * with base.css + results.css loaded.
 */
import { expect, test } from "@playwright/test";
import { waitForHarnessRender } from "./test-helpers";
import { BUG_CASES } from "../frontend/src/utils/__tests__/renderingAudit/catalog";
import { loadBugSection } from "../frontend/src/utils/__tests__/renderingAudit/section";

async function renderSection(
  page: import("@playwright/test").Page,
  modelId: string,
  content: string,
) {
  await page.goto("/");
  await page.waitForFunction(
    () =>
      (document.body?.textContent || "").includes("Waiting for render request"),
    { timeout: 25000 },
  );
  await page.evaluate(
    ({ modelId, content }) => {
      window.postMessage({ type: "render", modelId, content }, "*");
    },
    { modelId, content },
  );
  await waitForHarnessRender(page);
}

type MarkerLayout = {
  listStylePosition: string;
  firstChildDisplays: Array<{
    id: string;
    gap: number;
    liTop: number;
    eqTop: number;
  }>;
  midItemDisplays: Array<{ id: string; marginTop: number }>;
};

test.describe("list-item display math shares the marker line", () => {
  test("bug 20 first-child display starts on the bullet line", async ({
    page,
  }) => {
    const bug = BUG_CASES.find((c) => c.id === "20-list-prefixed-closer");
    expect(bug, "catalog has 20-list-prefixed-closer").toBeTruthy();
    const { section } = loadBugSection(bug!);
    await page.setViewportSize({ width: 960, height: 1200 });
    await renderSection(page, bug!.modelId, section);

    const layout = await page.evaluate((): MarkerLayout => {
      const root = document.querySelector(
        ".latex-content",
      ) as HTMLElement | null;
      const ul = root?.querySelector("ul");
      const firstChildDisplays: MarkerLayout["firstChildDisplays"] = [];
      const midItemDisplays: MarkerLayout["midItemDisplays"] = [];
      if (!root) {
        return { listStylePosition: "", firstChildDisplays, midItemDisplays };
      }
      for (const li of Array.from(root.querySelectorAll("li"))) {
        const first = li.firstElementChild as HTMLElement | null;
        const displays = Array.from(
          li.querySelectorAll(":scope > .katex-display"),
        ) as HTMLElement[];
        for (const eq of displays) {
          if (first === eq) {
            const liBox = li.getBoundingClientRect();
            const eqBox = eq.getBoundingClientRect();
            firstChildDisplays.push({
              id: (eq.textContent || "").slice(0, 40),
              gap: eqBox.top - liBox.top,
              liTop: liBox.top,
              eqTop: eqBox.top,
            });
          } else {
            midItemDisplays.push({
              id: (eq.textContent || "").slice(0, 40),
              marginTop: parseFloat(getComputedStyle(eq).marginTop) || 0,
            });
          }
        }
      }
      return {
        listStylePosition: ul ? getComputedStyle(ul).listStylePosition : "",
        firstChildDisplays,
        midItemDisplays,
      };
    });

    expect(layout.listStylePosition).toBe("outside");
    expect(
      layout.firstChildDisplays.length,
      "bug 20 has a first-child display",
    ).toBeGreaterThan(0);
    for (const row of layout.firstChildDisplays) {
      expect(
        row.gap,
        `first-child display must start on the marker line (gap=${row.gap})`,
      ).toBeLessThan(8);
    }
  });

  test("every audited section: first-child display on marker line; mid-item keeps margin", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 960, height: 8000 });
    for (const bug of BUG_CASES) {
      const { section } = loadBugSection(bug);
      await renderSection(page, bug.modelId, section);
      const layout = await page.evaluate((): MarkerLayout => {
        const root = document.querySelector(
          ".latex-content",
        ) as HTMLElement | null;
        const list = root?.querySelector("ul, ol");
        const firstChildDisplays: MarkerLayout["firstChildDisplays"] = [];
        const midItemDisplays: MarkerLayout["midItemDisplays"] = [];
        if (!root) {
          return { listStylePosition: "", firstChildDisplays, midItemDisplays };
        }
        for (const li of Array.from(root.querySelectorAll("li"))) {
          let first = li.firstElementChild as HTMLElement | null;
          if (
            first?.tagName === "BR" &&
            first.nextElementSibling?.classList.contains("katex-display")
          ) {
            first = first.nextElementSibling as HTMLElement;
          }
          const displays = Array.from(
            li.querySelectorAll(
              ":scope > .katex-display, :scope > p:first-child > .katex-display:first-child",
            ),
          ) as HTMLElement[];
          for (const eq of displays) {
            const isFirst =
              first === eq ||
              (first?.tagName === "P" && first.firstElementChild === eq);
            if (isFirst) {
              const liBox = li.getBoundingClientRect();
              const eqBox = eq.getBoundingClientRect();
              firstChildDisplays.push({
                id: `${eqBox.top}-${eqBox.left}`,
                gap: eqBox.top - liBox.top,
                liTop: liBox.top,
                eqTop: eqBox.top,
              });
            } else if (eq.parentElement === li) {
              midItemDisplays.push({
                id: `${eq.getBoundingClientRect().top}`,
                marginTop: parseFloat(getComputedStyle(eq).marginTop) || 0,
              });
            }
          }
        }
        return {
          listStylePosition: list
            ? getComputedStyle(list).listStylePosition
            : "",
          firstChildDisplays,
          midItemDisplays,
        };
      });

      if (layout.listStylePosition) {
        expect(layout.listStylePosition, `${bug.id} list-style-position`).toBe(
          "outside",
        );
      }
      for (const row of layout.firstChildDisplays) {
        expect(
          row.gap,
          `${bug.id}: first-child display must start on the marker line (gap=${row.gap})`,
        ).toBeLessThan(8);
      }
      for (const row of layout.midItemDisplays) {
        expect(
          row.marginTop,
          `${bug.id}: mid-item display must keep its top margin (bug 13)`,
        ).toBeGreaterThanOrEqual(12);
      }
    }
  });
});
