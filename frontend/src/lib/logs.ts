import {
  Timestamp,
  collection,
  getDocs,
  type DocumentData,
} from "firebase/firestore";

import { db, firestoreDatabaseId } from "./firebase";

export type TimeCapsuleLog = {
  id: string;
  actionId: string;
  content: string;
  createdAt: number | null;
  time: string;
  timeMilliseconds: number | null;
  updatedAt: string | null;
  user: string;
  isLegacy: boolean;
  issues: string[];
  raw: DocumentData;
};

export type SkippedDocument = {
  id: string;
  reasons: string[];
};

export type LogReadDiagnostics = {
  projectId: string | undefined;
  databaseId: string;
  snapshotSize: number;
  retainedCount: number;
  skippedDocuments: SkippedDocument[];
};

export type TimeCapsuleLogResult = {
  logs: TimeCapsuleLog[];
  diagnostics: LogReadDiagnostics;
};

function describeType(value: unknown): string {
  if (value instanceof Timestamp) return "Firestore Timestamp";
  if (value instanceof Date) return "Date";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function formatDate(value: Date): string {
  return value.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });
}

function parseDateLike(
  value: unknown,
  field: string,
  issues: string[],
): { display: string; milliseconds: number | null } {
  if (value instanceof Timestamp) {
    return {
      display: formatDate(value.toDate()),
      milliseconds: value.toMillis(),
    };
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { display: formatDate(value), milliseconds: value.getTime() };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return { display: formatDate(new Date(value)), milliseconds: value };
  }

  if (typeof value === "string") {
    const numericValue = Number(value);
    const parsedMilliseconds = Number.isFinite(numericValue)
      ? numericValue
      : Date.parse(value);

    return {
      display: value,
      milliseconds: Number.isNaN(parsedMilliseconds)
        ? null
        : parsedMilliseconds,
    };
  }

  issues.push(`${field} has unsupported type ${describeType(value)}`);
  return { display: "（未知時間）", milliseconds: null };
}

function parseText(
  value: unknown,
  field: string,
  issues: string[],
): string {
  if (typeof value === "string") return value;

  issues.push(`${field} has unsupported type ${describeType(value)}`);

  if (value === null || value === undefined) return `（缺少 ${field}）`;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return `（無法顯示的 ${field}）`;
}

function parseUser(value: unknown, issues: string[]): string {
  const user = parseText(value, "user", issues);

  if (typeof value === "string" && value !== "cloud" && value !== "stone") {
    issues.push(`user has unknown value ${JSON.stringify(value)}`);
  }

  return user;
}

function parseDocument(id: string, data: DocumentData): TimeCapsuleLog {
  const issues: string[] = [];
  const time = parseDateLike(data.time, "time", issues);
  const createdAt = parseDateLike(data.createdAt, "createdAt", issues);
  const updatedAt =
    data.updatedAt === undefined
      ? null
      : parseDateLike(data.updatedAt, "updatedAt", issues).display;

  return {
    id,
    actionId: parseText(data.actionId, "actionId", issues),
    content: parseText(data.content, "content", issues),
    createdAt: createdAt.milliseconds,
    time: time.display,
    timeMilliseconds: time.milliseconds,
    updatedAt,
    user: parseUser(data.user, issues),
    isLegacy: issues.length > 0,
    issues,
    raw: data,
  };
}

export async function getTimeCapsuleLogs(): Promise<TimeCapsuleLogResult> {
  // Keep this first-stage query deliberately raw: no orderBy, validation, or
  // filtering. Historical documents may contain several Firestore field types.
  const snapshot = await getDocs(collection(db, "time_capsule_logs"));

  console.log("projectId", db.app.options.projectId);
  console.log("databaseId", firestoreDatabaseId);
  console.log("document count", snapshot.size);

  snapshot.docs.forEach((document) => {
    console.log(document.id, document.data());
  });

  const logs = snapshot.docs.map((document) =>
    parseDocument(document.id, document.data()),
  );
  const skippedDocuments: SkippedDocument[] = [];
  const legacyDocuments = logs.filter((log) => log.isLegacy);

  console.log("parsed document count", logs.length);
  console.log("skipped documents", skippedDocuments);

  legacyDocuments.forEach((log) => {
    console.warn(`Legacy document retained: ${log.id}`, log.issues, log.raw);
  });

  return {
    logs,
    diagnostics: {
      projectId: db.app.options.projectId,
      databaseId: firestoreDatabaseId,
      snapshotSize: snapshot.size,
      retainedCount: logs.length,
      skippedDocuments,
    },
  };
}
