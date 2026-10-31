import { expect, test } from "./fixtures";

test.describe("スモーク: 主要画面フロー", () => {
  test("ホームが表示され、計画・設定へ遷移できる", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("My Trip");
    await expect(page.getByRole("button", { name: "旅をはじめる" })).toBeEnabled();
    await expect(page.getByText("まだ旅の記録がありません")).toBeVisible();

    await page.getByRole("link", { name: "計画をたてる →" }).click();
    await expect(page).toHaveURL(/#\/plans$/);
    await expect(page.getByRole("heading", { name: "旅の計画" })).toBeVisible();

    await page.getByRole("button", { name: "ホームへ戻る" }).click();
    await page.getByRole("button", { name: "設定" }).click();
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByRole("heading", { name: "設定" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /スポット名を自動取得する/ })).toBeChecked();
  });

  test("旅をはじめる → 記録中 → 終了 → 旅詳細・一覧に残る", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "旅をはじめる" }).click();

    await expect(page).toHaveURL(/#\/recording$/);
    await expect(page.getByText("記録中", { exact: true })).toBeVisible();
    await expect(page.getByLabel("経過時間")).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    await expect(page.getByText("移動距離")).toBeVisible();

    // 終了確認ダイアログ: 「続ける」で閉じられる
    await page.getByRole("button", { name: "■ 旅を終了する" }).click();
    const dialog = page.getByRole("dialog", { name: "旅を終了しますか?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "続ける" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "■ 旅を終了する" }).click();
    await dialog.getByRole("button", { name: "終了する" }).click();

    await expect(page).toHaveURL(/#\/trips\/[^/]+$/);
    await expect(page.getByRole("heading", { name: "タイムライン" })).toBeVisible();
    await expect(page.getByText("所要時間")).toBeVisible();

    // 旅のタイトル編集
    await page.getByRole("button", { name: "編集" }).click();
    const edit = page.getByRole("dialog", { name: "旅を編集" });
    await edit.getByLabel("タイトル").fill("E2E 鎌倉さんぽ");
    await edit.getByRole("button", { name: "保存" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E 鎌倉さんぽ");

    // 一覧・ホームに反映される
    await page.getByRole("button", { name: "旅一覧へ戻る" }).click();
    await expect(page.getByRole("link", { name: /E2E 鎌倉さんぽ/ })).toBeVisible();
    await page.getByRole("button", { name: "ホームへ戻る" }).click();
    await expect(page.getByRole("link", { name: /E2E 鎌倉さんぽ/ })).toBeVisible();

    // リロードしても残る(IndexedDB 永続化)
    await page.reload();
    await expect(page.getByRole("link", { name: /E2E 鎌倉さんぽ/ })).toBeVisible();
  });

  test("旅の計画をつくり、場所検索(モック)で行きたい場所を追加できる", async ({ page }) => {
    await page.goto("/#/plans");
    await page.getByRole("button", { name: "新しい計画をつくる" }).click();

    await expect(page).toHaveURL(/#\/plans\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("新しい旅の計画");
    await expect(page.getByText("行きたい場所を追加して、旅のしおりをつくりましょう。")).toBeVisible();

    await page.getByRole("searchbox", { name: "行きたい場所を検索" }).fill("鶴岡八幡宮");
    await page.getByRole("button", { name: "検索", exact: true }).click();
    await page.getByRole("button", { name: /鶴岡八幡宮/ }).first().click();

    await expect(page.getByRole("button", { name: "鶴岡八幡宮 を上へ移動" })).toBeVisible();

    await page.getByRole("button", { name: "計画一覧へ戻る" }).click();
    await expect(page.getByRole("link", { name: /新しい旅の計画/ })).toContainText("行きたい場所 1件");
  });

  test("設定: 全データ削除の確認ダイアログが動く", async ({ page }) => {
    await page.goto("/#/settings");
    await page.getByRole("button", { name: "すべてのデータを削除" }).click();
    const dialog = page.getByRole("dialog", { name: "すべて削除しますか?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "削除する" }).click();
    await expect(page.getByRole("status")).toHaveText("すべてのデータを削除しました。");
  });
});
