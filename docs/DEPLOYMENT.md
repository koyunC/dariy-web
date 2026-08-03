# 部署與 Preview 操作

目前的部署策略是：分支與 Pull Request 只做品質檢查；正式 Firebase Hosting live channel 不會因為 push 或 merge 自動更新，必須手動觸發 GitHub Actions。開發期間的 Preview 使用本機 Firebase CLI 建立，避免公開 PR 工作流程取得 Firebase service-account secret。

## 開發分支

每個功能都從最新的 `origin/main` 建立分支：

```bash
git fetch --prune origin
git switch -c feat/<feature-name> origin/main
```

推送後 GitHub Actions 會執行：

- `npm test`
- `npm run lint`
- `npm run build`

## 建立 Firebase Preview channel

先確認本機已登入 Firebase CLI，且帳號具有 `parallel-time` 的 Hosting deploy 權限。第一次使用：

```bash
firebase login
firebase use parallel-time
```

在功能分支根目錄執行：

```bash
npm --prefix frontend run build
firebase hosting:channel:deploy dev-<your-name> \
  --project parallel-time \
  --expires 7d
```

`frontend/.env.local` 會由 Vite 讀取；不要把它提交到 Git，也不要把內容貼到對話或文件。Firebase CLI 完成後會輸出 Preview URL。相同 channel ID 再次部署會更新同一個 Preview channel。

刪除不再使用的 Preview channel：

```bash
firebase hosting:channel:delete dev-<your-name> --project parallel-time
```

## 手動部署正式 live channel

正式部署需要：

1. 先將功能透過 PR 合併到 `main`。
2. 確認 `main` 的 CI 已成功。
3. 開啟 GitHub repository 的 **Actions**。
4. 選擇 **Test and deploy Firebase Hosting**。
5. 點擊 **Run workflow**。
6. 選擇 `main` 分支。
7. 將 `deploy_production` 設為 `true`。
8. 執行 workflow 並確認 `Deploy production` 成功。

不勾選 `deploy_production` 時，workflow 不會更新正式 Hosting live channel。

## 重要資料風險

目前 Preview 與正式站都連到 Firebase project `parallel-time`，因此 Preview 的登入、讀取與寫入都會使用同一個 Firestore。直到 Firestore Rules 限制為兩個 Google UID 前，不要公開 Preview URL，也不要在 Preview 建立不希望進入正式資料庫的紀錄。

## 登入測試

使用 Preview URL 時，在網址後保留身份參數：

```text
?user=cloud
?user=stone
```

首次登入請使用 Google popup；若瀏覽器阻擋 popup，前端會退回 redirect。登入成功後可在頁面「連線診斷」查看 UID。清除網站資料或使用無痕視窗，可避免舊的 Firebase Auth session 影響測試。
