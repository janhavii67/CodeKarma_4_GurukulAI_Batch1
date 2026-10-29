# Isolated synthetic machine Tutor demo

This demo uses four fictional registry rows and synthetic source-review text for CT-SCAN 11, MRI, ECG, and Xray. Every machine, knowledge title, and citation is marked `SYNTHETIC DEMO DATA — NOT FOR REAL MACHINE OPERATION`. The sample text contains no real device, clinical, operating, maintenance, repair, tolerance, or safety instructions.

The seed writes only to `backend/data/synthetic_demo/gurukul_synthetic_demo.db`. It creates a synthetic-only category, role/permission rows, three isolated login accounts, and the four synthetic machines. It intentionally creates **no knowledge items**. An Expert must preview and explicitly save a template as a draft in Knowledge Capture. Submission, independent peer review, publication, and indexing remain separate actions in the existing workflow.

## Create or repeat the seed

Open PowerShell in `backend` and set the three demo passwords using values kept in a local password manager. The values are read only when an account is first created; rerunning the seed does not overwrite existing account passwords.

```powershell
$env:ENVIRONMENT = 'synthetic-demo'
$env:GURUKUL_SYNTHETIC_DEMO = '1'
$demoPassword = Read-Host 'Synthetic demo author password' -AsSecureString
$env:SYNTHETIC_DEMO_AUTHOR_PASSWORD = [System.Net.NetworkCredential]::new('', $demoPassword).Password
$demoPassword = Read-Host 'Synthetic demo peer reviewer password' -AsSecureString
$env:SYNTHETIC_DEMO_REVIEWER_PASSWORD = [System.Net.NetworkCredential]::new('', $demoPassword).Password
$demoPassword = Read-Host 'Synthetic demo trainee password' -AsSecureString
$env:SYNTHETIC_DEMO_TRAINEE_PASSWORD = [System.Net.NetworkCredential]::new('', $demoPassword).Password
.\.venv\Scripts\python.exe .\scripts\seed_synthetic_machine_demo.py seed
```

The command is repeatable. Existing rows with unexpected values cause an error; the seed never updates them. It does not call the general development seed.

## Run the application against the isolated database

Keep the same PowerShell session and set the application database URL explicitly before starting the API. Keep the LLM mock selected so the demo makes no external provider calls.

```powershell
$env:DATABASE_URL = 'sqlite:///C:/Users/sonaw/GurukulAI/backend/data/synthetic_demo/gurukul_synthetic_demo.db'
$env:ASSISTANT_LLM_PROVIDER = 'mock'
$env:LLM_PROVIDER = 'mock'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

In another terminal, start the existing frontend with `npm run dev` from `frontend`. Sign in with `synthetic.author@demo.local` to create and submit a draft, then sign in separately as `synthetic.reviewer@demo.local` to approve it. Use `synthetic.trainee@demo.local` for Tutor retrieval and published-library checks. Passwords are the ones entered during the initial seed.

In Knowledge Capture, choose a machine whose code begins `SYNTH-DEMO-`, select **Preview synthetic example**, inspect it, and explicitly choose **Save synthetic draft**. This only saves a marked draft. The author can then submit through the ordinary review action. A different Expert account must approve it. The existing review flow performs publication and indexing. In the Tutor, select the matching synthetic machine and use either sample question; the page and citation remain visibly synthetic.

## Reset only the isolated demo

Stop the API first, keep `ENVIRONMENT` and `GURUKUL_SYNTHETIC_DEMO` set as above, then run:

```powershell
.\.venv\Scripts\python.exe .\scripts\seed_synthetic_machine_demo.py reset
```

Reset refuses a missing marker, an unexpected path, or a non-SQLite target. It deletes only the fixed, marker-verified synthetic demo database file after the explicit `reset` command. It cannot target the shared `gurukul_dev.db` or a configured production database.
