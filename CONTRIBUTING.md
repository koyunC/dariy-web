# Development workflow

`main` is the production branch. Do not develop or commit directly on `main`.

## Branch flow

1. Update local `main` from `origin/main`.
2. Create a branch using one of these prefixes:
   - `feat/` for features
   - `fix/` for bug fixes
   - `chore/` for tooling, CI, and maintenance
3. Make and verify changes on that branch.
4. Push the branch and open a pull request targeting `main`.
5. Merge only after the `Quality checks` job passes.

Every branch push runs tests, lint, and a production build. Only a successful
push to `main`, normally created by merging a pull request, deploys the Firebase
Hosting live channel.

Never commit `frontend/.env.local`, service-account JSON, Firebase credentials,
or GitHub Secret values.
