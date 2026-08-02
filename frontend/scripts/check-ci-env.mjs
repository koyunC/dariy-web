const requiredVariables = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

const missingVariables = requiredVariables.filter(
  (variable) => !process.env[variable],
);

if (missingVariables.length > 0) {
  throw new Error(
    `Missing required GitHub Actions secrets: ${missingVariables.join(", ")}`,
  );
}

if (process.env.VITE_FIREBASE_PROJECT_ID !== "parallel-time") {
  throw new Error("VITE_FIREBASE_PROJECT_ID must be parallel-time");
}

console.log("Firebase CI environment is configured for parallel-time.");
