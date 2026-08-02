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

Do not use `firebase init hosting:github` for this repository. Its preview
channel setup requires roles that this live-only workflow does not use.

Authenticate Google Cloud CLI and select the project:

```sh
gcloud auth login
gcloud config set project parallel-time
```

Create a dedicated account and grant only the two roles required by this
static Hosting deployment:

```sh
PT_PROJECT_ID="parallel-time"
PT_SERVICE_ACCOUNT_ID="github-actions-hosting"
PT_SERVICE_ACCOUNT_EMAIL="${PT_SERVICE_ACCOUNT_ID}@${PT_PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts describe "${PT_SERVICE_ACCOUNT_EMAIL}" \
  --project "${PT_PROJECT_ID}" \
  || gcloud iam service-accounts create "${PT_SERVICE_ACCOUNT_ID}" \
    --project "${PT_PROJECT_ID}" \
    --display-name "GitHub Actions Firebase Hosting"

gcloud projects add-iam-policy-binding "${PT_PROJECT_ID}" \
  --member "serviceAccount:${PT_SERVICE_ACCOUNT_EMAIL}" \
  --role "roles/firebasehosting.admin" \
  --condition=None

gcloud projects add-iam-policy-binding "${PT_PROJECT_ID}" \
  --member "serviceAccount:${PT_SERVICE_ACCOUNT_EMAIL}" \
  --role "roles/serviceusage.apiKeysViewer" \
  --condition=None
```

Verify that only those roles are listed:

```sh
gcloud projects get-iam-policy "${PT_PROJECT_ID}" \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:${PT_SERVICE_ACCOUNT_EMAIL}" \
  --format="table(bindings.role)"
```

Create the JSON key in a temporary directory without printing it:

```sh
PT_KEY_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/parallel-time-gh-key.XXXXXX")"
PT_KEY_FILE="${PT_KEY_DIRECTORY}/service-account.json"

gcloud iam service-accounts keys create "${PT_KEY_FILE}" \
  --iam-account "${PT_SERVICE_ACCOUNT_EMAIL}" \
  --project "${PT_PROJECT_ID}"

pbcopy < "${PT_KEY_FILE}"
```

Open the repository's Actions Secrets settings, create
`FIREBASE_SERVICE_ACCOUNT_PARALLEL_TIME`, and paste the clipboard contents:

<https://github.com/koyunC/dariy-web/settings/secrets/actions/new>

## Firebase Web Config secrets

Load the ignored local environment file into the current shell. Copy each value
individually, create a GitHub Secret with the matching name, and paste it. These
commands do not print the values:

```sh
set -a
source frontend/.env.local
set +a

printf %s "${VITE_FIREBASE_API_KEY}" | pbcopy
printf %s "${VITE_FIREBASE_AUTH_DOMAIN}" | pbcopy
printf %s "${VITE_FIREBASE_PROJECT_ID}" | pbcopy
printf %s "${VITE_FIREBASE_STORAGE_BUCKET}" | pbcopy
printf %s "${VITE_FIREBASE_MESSAGING_SENDER_ID}" | pbcopy
printf %s "${VITE_FIREBASE_APP_ID}" | pbcopy
printf %s "${VITE_FIREBASE_MEASUREMENT_ID}" | pbcopy
```

Run only one `printf ... | pbcopy` line at a time and paste it into the Secret
with the same variable name before copying the next value.

After GitHub confirms the service-account Secret was saved, remove the local key
file. This unlink is not recoverable; the encrypted GitHub Secret remains:

```sh
rm -f "${PT_KEY_FILE}"
rmdir "${PT_KEY_DIRECTORY}"
unset PT_KEY_FILE PT_KEY_DIRECTORY
```

Do not delete the key from Google Cloud IAM while the workflow uses it. To
rotate the key, upload the replacement Secret first, verify a deployment, and
then revoke the old IAM key.

## Initial push

After all Secrets exist, publish `main` first so it becomes the production
branch, then publish the development branch:

```sh
git push origin main
git push -u origin chore/github-release-workflow
```

Create the `main` branch ruleset described above before merging the pull
request.

The workflow deploys with `channelId: live` only from `main`. It does not deploy
Firestore Rules, Functions, or Firestore data.
