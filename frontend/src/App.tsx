import { useEffect, useState } from "react";

import { ensureAnonymousAuth } from "./lib/auth";
import {
  getTimeCapsuleLogs,
  type LogReadDiagnostics,
  type TimeCapsuleLog,
} from "./lib/logs";

function App() {
  const [logs, setLogs] = useState<TimeCapsuleLog[]>([]);
  const [uid, setUid] = useState("");
  const [diagnostics, setDiagnostics] =
    useState<LogReadDiagnostics | null>(null);
  const [status, setStatus] = useState("正在登入 Firebase…");
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function initialize() {
      try {
        const user = await ensureAnonymousAuth();
        console.log("anonymous auth succeeded", user.isAnonymous);
        console.log("current UID", user.uid);

        if (!isActive) return;

        setUid(user.uid);

        setStatus("正在讀取 Firestore…");

        const result = await getTimeCapsuleLogs();

        if (!isActive) return;

        setLogs(result.logs);
        setDiagnostics(result.diagnostics);
        setStatus(
          `Firestore 原始 ${result.diagnostics.snapshotSize} 筆，解析後保留 ${result.diagnostics.retainedCount} 筆`,
        );
      } catch (caughtError) {
        console.error(caughtError);

        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "發生未知錯誤";

        if (isActive) {
          setError(message);
          setStatus("初始化失敗");
        }
      }
    }

    void initialize();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <main>
      <h1>Parallel Time</h1>
      <p>{status}</p>

      <dl>
        <dt>匿名登入</dt>
        <dd>{uid ? "成功" : "等待中"}</dd>
        <dt>目前 UID</dt>
        <dd>{uid || "—"}</dd>
        <dt>實際 projectId</dt>
        <dd>{diagnostics?.projectId ?? "—"}</dd>
        <dt>Firestore database</dt>
        <dd>{diagnostics?.databaseId ?? "—"}</dd>
        <dt>Firestore snapshot.size</dt>
        <dd>{diagnostics?.snapshotSize ?? "—"}</dd>
        <dt>經過型別解析後保留</dt>
        <dd>{diagnostics?.retainedCount ?? "—"}</dd>
        <dt>被略過文件</dt>
        <dd>
          {diagnostics
            ? `${diagnostics.skippedDocuments.length} 筆`
            : "—"}
        </dd>
      </dl>

      {diagnostics && diagnostics.skippedDocuments.length > 0 && (
        <ul>
          {diagnostics.skippedDocuments.map((document) => (
            <li key={document.id}>
              {document.id}: {document.reasons.join("；")}
            </li>
          ))}
        </ul>
      )}

      {diagnostics && (
        <p>原始文件資料與舊格式標記請見瀏覽器 console。</p>
      )}

      {error && (
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {error}
        </pre>
      )}

      <ul>
        {logs.slice(0, 20).map((log) => (
          <li key={log.id}>
            <strong>{log.user}</strong>
            {" — "}
            {log.content}
            {" — "}
            {log.time}
            {log.isLegacy && ` — 舊格式：${log.issues.join("；")}`}
          </li>
        ))}
      </ul>
    </main>
  );
}

export default App;
