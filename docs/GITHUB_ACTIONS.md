# GitHub Actions deployment setup

The workflow in `.github/workflows/firebase-hosting.yml` runs on every push. It
tests, lints, and builds the frontend before deploying only Firebase Hosting to
the `parallel-time` live channel.

## Required repository setup

1. Create or select the GitHub repository and add it as this local repository's
   `origin` remote.
2. Add the following repository or `production` environment secrets without
   committing their values:

   - `FIREBASE_SERVICE_ACCOUNT_PARALLEL_TIME`
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_MEASUREMENT_ID` (optional)

   The `VITE_FIREBASE_*` values are the same values used by
   `frontend/.env.local`. Do not commit that file or paste its values into the
   workflow.
3. Set `VITE_FIREBASE_PROJECT_ID` to `parallel-time`.
4. Push the committed workflow. The first run should finish the test, lint, and
   build steps before deploying.

## Firebase service account

Firebase recommends generating the Hosting deployment service account and
uploading it as an encrypted GitHub secret with:

```sh
npx firebase-tools init hosting:github
```

Run this only after the GitHub remote exists and you have admin access to that
repository. Keep the existing workflow when prompted, and ensure the generated
service-account secret is named `FIREBASE_SERVICE_ACCOUNT_PARALLEL_TIME`.

The workflow deploys with `channelId: live`. It does not deploy Firestore Rules,
Functions, or Firestore data.
