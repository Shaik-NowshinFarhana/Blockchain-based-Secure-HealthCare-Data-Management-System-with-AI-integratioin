# Deploying the Blockchain Healthcare System on Railway

### A beginner's end-to-end guide

This guide takes you from "the code only runs on my laptop" to "anyone can open a link and use the app". It assumes you have never deployed anything before. Every step says what to click and why.

**Time needed:** about 90 minutes the first time.
**Cost:** Railway gives new accounts a one-time $5 free credit. After that it is $5 per month on the Hobby plan. You will need a card on file to move past the trial.

---

## Part 1: Understanding what you are deploying

### 1.1 The app is really four apps

Your repository `Blockchain_Based_Healthcaresystem` has four separate pieces in four folders:

| Folder | What it is | Language | Runs where after deploy |
|---|---|---|---|
| `contracts/` + root | Smart contracts (Hardhat) | Solidity | Already on the Sepolia blockchain. Nothing to deploy. |
| `frontend/` | The website users see | React + Vite | Railway service named `frontend` |
| `backend/` | The API that talks to MongoDB, Pinata and Resend | Node + Express | Railway service named `backend` |
| `Ai_Model/` | The disease prediction API | Python + FastAPI | Railway service named `ai` |

On Railway, each folder becomes its own **service**. A service is one running program with its own URL, its own settings and its own environment variables. All three services live inside one Railway **project**.

### 1.2 How they talk to each other

```
User's browser
    │
    ▼
frontend (React)  ──── calls ────►  backend (Express)  ────►  MongoDB Atlas
    │                                     │                    Pinata (IPFS)
    │                                     │                    Resend (email)
    └──────────── calls ────►  ai (FastAPI)
    │
    └──── MetaMask ────►  Sepolia blockchain
```

The browser calls the backend and the AI service directly. That is why both need public URLs, and why the backend must allow requests from the frontend's domain (this is called CORS).

### 1.3 Words you will see

- **Environment variable:** a named setting like `MONGO_URI` that the code reads at runtime. Secrets go here, never in code.
- **Root Directory:** tells Railway which folder of the repo a service should build from.
- **Build command:** what Railway runs to prepare the code, for example `npm run build`.
- **Start command:** what Railway runs to actually launch the program, for example `npm start`.
- **Healthcheck:** a URL Railway pings to confirm the service is alive.
- **Deploy:** Railway pulling your code from GitHub, building it, and starting it. Happens automatically on every push to `main`.

---

## Part 2: Before touching Railway, fix the code

Do these on your laptop, then push to GitHub. Railway deploys whatever is on `main`, so the code must be ready first.

### 2.1 URGENT: rotate the leaked MongoDB password

**Why:** the file `Ai_Model/live.py` has the full MongoDB connection string, including the password, committed to a public repo. Anyone on the internet can read or wipe your database. Deleting it from the file is not enough because git history keeps it forever. The password itself must change.

**Steps:**

1. Open https://cloud.mongodb.com and log in
2. Left sidebar: **Database Access**
3. Find the user `maheshkarri2109_db_user`, click **Edit**
4. Click **Edit Password**, then **Autogenerate Secure Password**. Copy it into a password manager or a private note. You will need it twice.
5. Click **Update User**

Now fix the code. Open `Ai_Model/live.py`. Line 7 looks like this:

```python
MONGO_URI = "mongodb+srv://maheshkarri2109_db_user:...@cluster0.l9mwhbx.mongodb.net/?appName=Cluster0"
```

Replace it with:

```python
import os
from dotenv import load_dotenv
load_dotenv()
MONGO_URI = os.environ["MONGO_URI"]
```

Then create a file `Ai_Model/.env` on your laptop only (it is gitignored and will never be uploaded):

```
MONGO_URI=mongodb+srv://maheshkarri2109_db_user:PASTE_NEW_PASSWORD@cluster0.l9mwhbx.mongodb.net/?appName=Cluster0
```

Also update the `MONGO_URI` line in your existing `backend/.env` with the new password.

### 2.2 Frontend: stop hardcoding localhost

**Why:** seven files say `const API = "http://localhost:5010/api"`. On your laptop that works. On the internet, `localhost` means the visitor's own computer, so every API call fails. We move the address into a variable that Railway fills in.

**Step A. Create a new file** `frontend/src/utils/api.js`:

```js
// Backend URLs come from Railway environment variables at build time.
// The fallbacks keep `npm run dev` working on your laptop with no .env file.
export const API    = import.meta.env.VITE_API_URL ?? "http://localhost:5010/api";
export const AI_API = import.meta.env.VITE_AI_URL  ?? "http://localhost:8000";
```

**Step B. Edit seven files.** In each, delete the old line and add the import in its place.

| File | Line to find | Delete it | Put this instead |
|---|---|---|---|
| `frontend/src/pages/AutoGate.jsx` | 5 | `const API = "http://localhost:5010/api";` | `import { API } from "../utils/api";` |
| `frontend/src/pages/AdminPanel.jsx` | 16 | `const API = "http://localhost:5010/api";` | `import { API } from "../utils/api";` |
| `frontend/src/pages/DoctorRegister.jsx` | 9 | `const API = "http://localhost:5010/api";` | `import { API } from "../utils/api";` |
| `frontend/src/pages/UserRegister.jsx` | 10 | `const API = "http://localhost:5010/api";` | `import { API } from "../utils/api";` |
| `frontend/src/pages/DoctorDashboard.jsx` | 8 | `const API = "http://localhost:5010/api";` | `import { API } from "../utils/api";` |
| `frontend/src/pages/UserDashboard.jsx` | 8 | `const API = "http://localhost:5010/api";` | `import { API } from "../utils/api";` |
| `frontend/src/pages/Aipredictionpage.jsx` | 4 | `const API = "http://localhost:8000";` | `import { AI_API as API } from "../utils/api";` |

Move the new import line up with the other `import` lines at the top of each file. Nothing else in those files changes, because the rest of the code still uses the name `API`.

**Mac shortcut** that does all seven edits at once. Run from inside the `frontend` folder:

```bash
sed -i '' 's#^const API = "http://localhost:5010/api";#import { API } from "../utils/api";#' \
  src/pages/AdminPanel.jsx src/pages/AutoGate.jsx src/pages/DoctorRegister.jsx \
  src/pages/UserRegister.jsx src/pages/DoctorDashboard.jsx src/pages/UserDashboard.jsx

sed -i '' 's#^const API = "http://localhost:8000";#import { AI_API as API } from "../utils/api";#' \
  src/pages/Aipredictionpage.jsx
```

**Step C. Add a static file server.** Vite builds the site into a folder called `dist/`. Railway needs a small program to serve those files.

```bash
cd frontend
npm install serve
```

Then open `frontend/package.json` and add one line to the `scripts` block:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "start": "serve -s dist -l $PORT"
},
```

The `-s` means single-page-app mode, so refreshing on `/user/dashboard` loads the app instead of a 404.

**Step D. Document the variables** in a new file `frontend/.env.example`. This file is safe to commit because the values are empty. It is a checklist for whoever deploys next.

```
VITE_API_URL=
VITE_AI_URL=
VITE_DOCTOR_CONTRACT=
VITE_MEDICAL_CONTRACT=
VITE_ADMIN_WALLET=
VITE_ADMIN_DERIVED_PUBKEY=
```

**Step E. Test the build.** Still inside `frontend`:

```bash
npm run build
```

The last line should say `✓ built in ...`. Yellow warnings about chunk size are fine.

### 2.3 Backend: CORS and a health check

Open `backend/src/server.js`. Find these two lines:

```js
app.use(cors());
app.use(express.json());
```

Replace with:

```js
// Only allow requests from our own frontend. Value comes from Railway variables.
const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(",");
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Railway pings this to know the server is up
app.get("/health", (_req, res) => res.json({ ok: true }));
```

Then remove a broken dependency. The `crypto` package on npm is an empty placeholder; Node already has crypto built in.

```bash
cd backend
npm uninstall crypto
```

Create `backend/.env.example`:

```
MONGO_URI=
PINATA_API_KEY=
PINATA_SECRET_API_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
ADMIN_PRIVATE_KEY=
CONTRACT_ADDRESS=
RPC_URL=
CORS_ORIGINS=http://localhost:5173
```

### 2.4 AI model: tell Railway what to install

Create `Ai_Model/requirements.txt`:

```
fastapi
uvicorn[standard]
pydantic
joblib
numpy
pandas
scikit-learn
xgboost
rapidfuzz
python-dotenv
```

Leave the `Ai_Model/models/*.pkl` files in the repo. They are the trained models. Without them the server would retrain on every start.

### 2.5 Tidy the gitignore

Open `.gitignore` at the repo root and add at the bottom:

```
.DS_Store
__pycache__/
*.pyc
```

### 2.6 Commit and push

From the repo root:

```bash
git add .
git status
```

Look at the list. You should NOT see any file ending in `.env`. If you do, stop and check your `.gitignore`. Then:

```bash
git commit -m "Prepare for Railway deployment"
git push origin main
```

---

## Part 3: Set up Railway

### 3.1 Create an account

1. Go to https://railway.com
2. Click **Login**, then **Login with GitHub**
3. Authorise Railway to see your repositories when asked

### 3.2 Create the project and first service

1. Click **New Project**
2. Choose **Deploy from GitHub repo**
3. Pick `Shaik-NowshinFarhana/Blockchain_Based_Healthcaresystem`. If it is not listed, click **Configure GitHub App** and grant access to that repo.
4. Railway creates a project with one service and starts building it. **The first build will fail.** That is expected, because Railway does not yet know which folder to build. Ignore it.

### 3.3 Add two more services from the same repo

You need three services total. On the project canvas:

1. Click **+ Create** (top right) or right-click on empty canvas
2. Choose **GitHub Repo**, then pick the same repository
3. Repeat once more

You now have three boxes on the canvas, all showing the repo name.

### 3.4 Name the services

**This matters.** Later we use the names to connect services to each other, so type them exactly.

For each box: click it, then click **Settings** (the tab at the top of the panel that opens). At the very top is the service name. Change them to:

- `backend`
- `ai`
- `frontend`

---

## Part 4: Configure the `backend` service

Click the `backend` box, then **Settings**.

### 4.1 Source

Scroll to **Source**. Click **Add Root Directory** and type:

```
/backend
```

Under **Watch Paths**, click **Add** and type:

```
/backend/**
```

Watch Paths mean "only redeploy this service when a file inside `backend/` changes". Without it, editing the frontend would rebuild the backend too.

### 4.2 Build and Deploy

Scroll to **Deploy**.

| Field | What to type |
|---|---|
| Custom Start Command | `npm start` |
| Healthcheck Path | `/health` |

Leave Build Command empty. Railway sees `package.json` and runs `npm ci` automatically.

### 4.3 Networking

Scroll to **Networking**. Click **Generate Domain**. Railway asks which port; accept the default. You get a URL like:

```
https://backend-production-a1b2.up.railway.app
```

### 4.4 Variables

Click the **Variables** tab. Click **New Variable** for each row. Or click **Raw Editor** and paste them all as `KEY=value` lines.

| Key | Value |
|---|---|
| `MONGO_URI` | Full Atlas connection string with the NEW password from 2.1 |
| `PINATA_API_KEY` | From https://app.pinata.cloud, API Keys |
| `PINATA_SECRET_API_KEY` | Same page |
| `RESEND_API_KEY` | From https://resend.com, API Keys |
| `RESEND_FROM_EMAIL` | The sender address you verified in Resend |
| `ADMIN_PRIVATE_KEY` | The admin wallet's private key (from your local `backend/.env`) |
| `CONTRACT_ADDRESS` | DoctorRegistry contract address on Sepolia |
| `RPC_URL` | Your Sepolia RPC URL from Alchemy or Infura |
| `CORS_ORIGINS` | `https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}` |

**Do not add `PORT`.** Railway sets it automatically and the code already reads it.

**About that last row.** `${{frontend.RAILWAY_PUBLIC_DOMAIN}}` is a Railway reference. It means "whatever the public domain of the service named `frontend` is". Type it exactly, with both sets of curly braces. Railway shows a small chain-link icon when it recognises it. This is why the service names had to be exact.

Click **Deploy** (a purple button appears at the top when there are unsaved changes).

### 4.5 Let Railway reach MongoDB

Atlas blocks all connections by default.

1. In https://cloud.mongodb.com, left sidebar: **Network Access**
2. Click **Add IP Address**
3. Click **Allow Access from Anywhere**, which fills in `0.0.0.0/0`
4. Click **Confirm**

Railway's outgoing IP addresses change, so allowing everywhere is the practical choice. Your database is still protected by the password.

### 4.6 Check it worked

Click the **Deployments** tab. Wait for the newest one to show a green **Active** badge, usually about 2 minutes. Click it and then **View Logs**. You want to see:

```
MongoDB Connected
Server running on port ...
```

Then open your backend URL plus `/health` in a browser:

```
https://backend-production-a1b2.up.railway.app/health
```

You should see `{"ok":true}`.

---

## Part 5: Configure the `ai` service

Click the `ai` box, then **Settings**.

### 5.1 Source

| Field | Value |
|---|---|
| Root Directory | `/Ai_Model` |
| Watch Paths | `/Ai_Model/**` |

### 5.2 Deploy

| Field | Value |
|---|---|
| Custom Start Command | `uvicorn app:app --host 0.0.0.0 --port $PORT` |
| Healthcheck Path | `/` |

Leave Build Command empty. Railway sees `requirements.txt` and runs `pip install` automatically.

`uvicorn` is the web server that runs FastAPI. `app:app` means "the variable named `app` inside `app.py`". `$PORT` is filled in by Railway.

### 5.3 Networking

**Generate Domain**, accept the default port. Note the URL.

### 5.4 Variables

None needed. `app.py` does not read any environment variables.

Click **Deploy**.

### 5.5 Check it worked

This build is the slowest, about 5 minutes, because XGBoost and scikit-learn are large downloads. When **Active**, open the URL in a browser. You should see:

```json
{"message":"API is running 🚀"}
```

**If the log shows the service crashing repeatedly with no clear error,** it ran out of memory loading the models. Go to **Settings**, scroll to **Resources**, and raise the memory limit to 1 GB.

---

## Part 6: Configure the `frontend` service

Click the `frontend` box, then **Settings**.

### 6.1 Source

| Field | Value |
|---|---|
| Root Directory | `/frontend` |
| Watch Paths | `/frontend/**` |

### 6.2 Build and Deploy

| Field | Value |
|---|---|
| Custom Build Command | `npm run build` |
| Custom Start Command | `npm start` |

Healthcheck Path can stay empty.

### 6.3 Networking

**Generate Domain**. This URL is your live website. Note it.

### 6.4 Variables

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://${{backend.RAILWAY_PUBLIC_DOMAIN}}/api` |
| `VITE_AI_URL` | `https://${{ai.RAILWAY_PUBLIC_DOMAIN}}` |
| `VITE_DOCTOR_CONTRACT` | Copy from your local `frontend/.env` |
| `VITE_MEDICAL_CONTRACT` | Copy from your local `frontend/.env` |
| `VITE_ADMIN_WALLET` | Copy from your local `frontend/.env` |
| `VITE_ADMIN_DERIVED_PUBKEY` | Copy from your local `frontend/.env` |

Note the `/api` at the end of the first one and no trailing slash on the second.

Click **Deploy**.

### 6.5 Something important about `VITE_` variables

Vite copies the values of `VITE_*` variables into the JavaScript **while building**. They are not read when the page loads. Two consequences:

- Railway makes variables available during the build, so this works.
- If you ever change a `VITE_*` value, the site keeps the old value until you rebuild. To rebuild: **Deployments** tab, three dots on the latest deployment, **Redeploy**.

### 6.6 Check it worked

When **Active**, open the frontend URL. You should see the app's landing page with a Connect Wallet button.

---

## Part 7: Test the whole thing

You need Chrome or Brave with the MetaMask extension installed and switched to the Sepolia test network.

1. Open the frontend URL
2. Press **F12** to open Developer Tools, click the **Network** tab
3. Click **Connect Wallet** and approve in MetaMask
4. Watch the Network tab. Requests should go to `backend-production-....up.railway.app`. If any go to `localhost`, Part 2.2 was missed or the frontend was not redeployed.
5. Every request should show status **200** or **201**. A red one means an error. Click it and read the **Response** tab.
6. Register as a user, then visit `/ai-prediction` and submit a prediction. That call goes to the `ai` service.
7. While on `/user/dashboard`, press F5 to refresh. The page should reload normally. A 404 means the `start` script in 2.2 Step C is missing `-s`.

If all seven pass, you are live.

---

## Part 8: After launch

### 8.1 Every push deploys

From now on, `git push origin main` redeploys whichever service's folder changed. You do not need to touch Railway again for code updates. Watch the **Deployments** tab if something looks off.

### 8.2 Keep costs down

Railway charges by memory and CPU used per minute. To stop paying while nobody uses the app:

1. Click the `backend` service, **Settings**, scroll to **Deploy**
2. Turn on **Serverless** (may be labelled **App Sleeping**)
3. Repeat for `ai`

The service stops after 10 minutes with no traffic and wakes on the next request in a few seconds. Do not enable this on `frontend`; a sleeping frontend makes the whole site feel broken.

### 8.3 Security

- Turn on two-factor authentication on GitHub, Railway and MongoDB Atlas. The backend holds an admin private key, so anyone who gets into your Railway account controls the admin wallet.
- Keep only Sepolia test ETH in that admin wallet. Never real funds.
- Never paste a real `.env` file into a chat, screenshot, or commit.

---

## Troubleshooting

| What you see | What it means | Fix |
|---|---|---|
| First build fails right after creating the project | Root Directory not set yet | Expected. Continue with Part 3.4 onward |
| `No start command could be found` on frontend | `start` script missing from `package.json` | Part 2.2 Step C |
| Frontend loads a blank white page | `dist/` was never built | Set Build Command to `npm run build` (Part 6.2) |
| Frontend requests go to `localhost` | Old hardcoded URLs, or frontend not rebuilt after adding variables | Part 2.2 Step B, then Redeploy |
| `VITE_API_URL` shows literally as `${{backend...}}` in the browser | A service is not named exactly `backend` | Rename in Settings, then Redeploy frontend |
| Browser console: `blocked by CORS policy` | `CORS_ORIGINS` does not match the frontend URL | Check the reference in Part 4.4, then redeploy backend |
| Backend log: `MongoServerSelectionError` | Atlas is blocking Railway's IP | Part 4.5 |
| Backend log: `bad auth : authentication failed` | Old password in `MONGO_URI` | Use the new password from Part 2.1 |
| `ai` service restarts in a loop | Out of memory | Raise memory limit (Part 5.5) |
| Contract call fails: `invalid address` or `undefined` | A `VITE_*_CONTRACT` variable is blank | Part 6.4, then Redeploy |
| Refreshing any page gives 404 | `serve` missing the `-s` flag | Part 2.2 Step C |
| All three services rebuild on every push | Watch Paths not set | Parts 4.1, 5.1, 6.1 |
| Deploys stopped and a banner mentions credits | Trial credit used up | Upgrade to Hobby plan under **Account Settings**, then **Plans** |

---

## Every file you touched

| Action | File |
|---|---|
| Edit | `Ai_Model/live.py` (line 7) |
| Create, never commit | `Ai_Model/.env` |
| Create | `Ai_Model/requirements.txt` |
| Create | `frontend/src/utils/api.js` |
| Edit | `frontend/src/pages/AutoGate.jsx` (line 5) |
| Edit | `frontend/src/pages/AdminPanel.jsx` (line 16) |
| Edit | `frontend/src/pages/DoctorRegister.jsx` (line 9) |
| Edit | `frontend/src/pages/UserRegister.jsx` (line 10) |
| Edit | `frontend/src/pages/DoctorDashboard.jsx` (line 8) |
| Edit | `frontend/src/pages/UserDashboard.jsx` (line 8) |
| Edit | `frontend/src/pages/Aipredictionpage.jsx` (line 4) |
| Edit | `frontend/package.json` (add `serve` dependency and `start` script) |
| Create | `frontend/.env.example` |
| Edit | `backend/src/server.js` (CORS and `/health`) |
| Edit | `backend/package.json` (remove `crypto`, via `npm uninstall`) |
| Create | `backend/.env.example` |
| Edit | `.gitignore` (add 3 lines) |
