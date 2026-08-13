# Desk Code Agent 桌面版快速上手

Desk Code Agent 會從空白、僅限本機的工作區開始。它不會預先載入範例 repo、不會自動啟動模型，也不會假裝已執行任務。

## 1. 打開本機 repo

1. 在開始頁按 **Choose local folder**。
2. 選擇一個已存在的 Git repository 根目錄，或其內部任一資料夾。
3. 檢視畫面顯示的 repo 名稱、repo 自行提供的 branch 與 HEAD metadata、manifest 及有限範圍的檔案清單。工作樹狀態會明確顯示為「基於安全考量未檢查」。

這個檢查不會啟動 Git 程序；只會有限讀取 `.git/HEAD`、ref metadata，並建立會略過 symlink 與固定 generated directories 的有限檔案清單。分支與 HEAD 是 repo 自行提供的不可信 metadata；Desk 不會驗證對應的 Git object。它不會上傳、複製或修改原始碼，也不會 clone、checkout、執行 hook、建立 lock、比較工作樹內容或呼叫模型。因 repo config 與 filter 都是不可信任資料，Desk 不會宣稱工作樹是 clean 或 dirty；畫面也不會顯示電腦上的完整絕對路徑。

v0.2.0 會刻意拒絕使用 `.git` indirection 的 linked worktree 與 submodule checkout。請改選 `.git` 為本機實體目錄的主要 checkout。

如果 repo 目前只在 GitHub，請先用 Git 或 GitHub Desktop clone 到電腦，再回到 Desk 選擇本機資料夾。這個版本不提供 GitHub URL clone。

## 2. 理解目前功能邊界

選擇成功後，Repository 頁只會顯示實際觀察到的唯讀資料。

目前桌面版尚未把「使用者選擇的 repo」連接到語意索引與任務執行 runtime，因此 **Run** 會保持停用。這是刻意的誠實狀態，不會拿範例事件冒充成對你的 repo 所做的分析。

Repository mutation 仍為 `DISABLED`。

## 3. 使用明確標示的導覽 Demo

按 **Try guided demo** 可以查看完整產品流程。所有 demo 畫面都會持續顯示：

`DEMO DATA · NO REPOSITORY ACCESSED · ZERO MODEL CALLS`

你可以隨時按 **Exit demo** 回到空白工作區。Demo 的 evidence、events、changes、verification 與 history 不會混入真實 repo 狀態。

## 4. 調整閱讀體驗

在 **Settings → Appearance** 可以選擇：

- 跟隨系統、深色或淺色主題；
- Comfortable 或 Compact 間距；
- 100%、110% 或 125% 介面文字；
- Reduced motion，或跟隨作業系統動畫設定。

## Windows 需求

- Windows 10/11 x64
- WebView2
- 若要先從 GitHub clone，需另行安裝 Git 或 GitHub Desktop；Desk 的本機 repo inspection 本身不會啟動 Git 程序

若電腦尚未安裝 WebView2，Windows 安裝程式可能會透過 Microsoft
bootstrapper 進行一次下載；repo inspection 本身不會建立應用程式網路連線。

安裝程式目前未簽章，Windows 可能顯示一般的未知發行者或信譽警告。Node、Rust、Visual Studio、模型權重與模型服務不會包含在安裝程式內。
