# GitHub Actions deployment setup

The workflow in `.github/workflows/firebase-hosting.yml` runs quality checks on
every branch push and every pull request targeting `main`. It deploys Firebase
Hosting to the `parallel-time` live channel only after a push reaches `main` and
all quality checks pass.

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
4. Enable a branch ruleset for `main` in GitHub:

   - Require a pull request before merging.
   - Require the `Quality checks` status check.
   - Require the branch to be up to date before merging.
   - Block force pushes and branch deletion.

5. Push a development branch and open a pull request. The workflow will test,
   lint, and build it without deploying. Merging the reviewed PR into `main`
   triggers the live Hosting deployment.

## Firebase service account

Firebase recommends generating the Hosting deployment service account and
uploading it as an encrypted GitHub secret with:

```sh
npx firebase-tools init hosting:github
```

Run this only after the GitHub remote exists and you have admin access to that
repository. Keep the existing workflow when prompted, and ensure the generated
service-account secret is named `FIREBASE_SERVICE_ACCOUNT_PARALLEL_TIME`.

The workflow deploys with `channelId: live` only from `main`. It does not deploy
Firestore Rules, Functions, or Firestore data.
