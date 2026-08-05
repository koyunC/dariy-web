# Deployment and Preview Workflow

The current deployment policy is:

- Branches and pull requests run quality checks only.
- A push or merge to `main` does not update the Firebase Hosting live channel.
- Production deployment is started manually from GitHub Actions.
- Development previews are deployed locally with the Firebase CLI.

This keeps Firebase service-account credentials out of public pull-request workflows.

## Development branches

Create every feature branch from the latest `origin/main`:

```bash
git fetch --prune origin
git switch -c feat/<feature-name> origin/main
```

After pushing a branch, GitHub Actions runs:

- `npm test`
- `npm run lint`
- `npm run build`

Do not develop directly on `main`.

## Deploy a Firebase Preview channel

Sign in to the Firebase CLI with an account that has Hosting deployment access to `parallel-time`:

```bash
firebase login
firebase use parallel-time
```

From the repository root, deploy a named channel:

```bash
npm --prefix frontend run build
firebase hosting:channel:deploy <deploy-name> \
  --project parallel-time \
  --expires 3d
```

The Vite build reads the local `frontend/.env.local` file. Never commit that file or paste its contents into chat or documentation. Firebase CLI prints the Preview URL when the deployment finishes. Deploying the same channel ID updates the existing Preview channel.

Delete an unused Preview channel with:

```bash
firebase hosting:channel:delete <deploy-name> --project parallel-time
```

## Manually deploy the production live channel

Before deploying production:

1. Merge the feature through a pull request into `main`.
2. Confirm that the `main` CI run has passed.
3. Open the repository's **Actions** tab on GitHub.
4. Select **Test and deploy Firebase Hosting**.
5. Click **Run workflow**.
6. Select the `main` branch.
7. Set `deploy_production` to `true`.
8. Start the workflow and confirm that **Deploy production** succeeds.

Leaving `deploy_production` unchecked means the workflow will not update the live Hosting channel.

## Data and authentication risk

Preview and production currently use the same Firebase project, `parallel-time`. Authentication, reads, and writes from a Preview therefore use the same Firestore database. Until Firestore Rules restrict access to the two approved Google UIDs, do not share Preview URLs or create records that should not enter the production database.

## Google sign-in testing

Keep the identity query parameter on the Preview URL:

```text
?user=cloud
?user=stone
```

The login button uses Google popup authentication and falls back to redirect when popups are blocked. After signing in, open the connection diagnostics section to verify the Firebase UID and email. Clear site data or use a private browser window to avoid an old Firebase Auth session affecting the test.

## Repository visibility

Changing the GitHub repository from public to private does not change Firebase Hosting, Firebase Authentication, or the public accessibility of a Firebase Preview URL. It does change GitHub access and Actions billing:

- Collaborators must be explicitly granted repository access.
- GitHub-hosted Actions minutes for private repositories use the account plan quota; GitHub Free currently includes 2,000 minutes per month.
- Fork pull requests from outside collaborators have restricted token and secret access and may require approval.
- Firebase Preview URLs remain reachable by anyone who has the URL, so repository privacy does not protect Preview data.
