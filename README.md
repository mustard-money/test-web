# Mustard — end-to-end UI tests

Playwright tests that walk through Mustard the way a person would: sign up, fill in the profile,
add household members, income, investments and expenses, check the Home statement, plan a
scenario, ask the assistant for a change, then sign in on a second device and find everything
synced. The journey is `tests/journey.spec.ts`; its tests run in order and share one device.

Everything runs in Docker, against a throwaway stack:

| Container | What it is |
| --- | --- |
| `db` | Postgres, in memory (gone when the run ends) |
| `llm` | A stand-in AI model with scripted answers (`fake-llm/server.py`) |
| `api` | The backend, built from `../customer-data` |
| `web` | The production web app, built from `../website`, with `/api/` proxied to the backend |
| `tests` | Playwright + Chromium (this folder's `Dockerfile`) |

```bash
./run.sh                  # build the images, run every test, remove the stack
./run.sh --no-build       # reuse the images from the last run
./run.sh -g "assistant"   # extra arguments go to `playwright test`
```

Each test is recorded to `videos/<test name>.webm` (the second-device test adds
` (second device)`). The HTML report is in `playwright-report/`; failures also leave a
screenshot, trace and page snapshot in `test-results/`.

The images are built from the other repos' working copies, so run without `--no-build` after
changing the website or backend.

## Writing tests

`./run.sh --up` starts the stack without the tests, with the web app on
`http://localhost:18081`, and `npm install && npm test` here runs the tests from your machine
(`./run.sh --down` removes the stack). With Colima, publishing a new host port can fail (its SSH
port forwarder exits with 255); restart Colima, or just use `./run.sh`, which runs the tests inside
the Docker network and doesn't need the port.

Tips for this app:
- Screens stay mounted after you leave them, so the page holds hidden copies of forms and text.
  Find controls with `getByRole` (which skips hidden elements) and check text with `shown()`.
- Records on a section's overview page are links named "<name> <summary>"; use `listed()`.
- The stand-in model only knows the prompts in `fake-llm/server.py`; add a case there for new
  assistant tests.
- Keep `@playwright/test` in `package.json` and the image tag in `Dockerfile` on the same version.
