# Deploying Throw Shoes at Boss to Google Cloud Platform

These steps deploy the Node.js API and the Vite frontend as two Cloud Run
services. You can adapt the same images for other hosting options.

## 0. Prerequisites

- Google Cloud project with billing enabled
- `gcloud` CLI authenticated (`gcloud auth login`) and project selected:
  ```bash
  gcloud config set project <PROJECT_ID>
  ```
- Artifact Registry (or Container Registry) enabled
- Cloud Run API enabled:
  ```bash
  gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
  ```

All commands below are run from the `throw-shoes/` folder.

## 1. Build & Deploy the backend (API + Python tooling)

```bash
REGION=asia-south1               # choose your preferred Cloud Run region
PROJECT_ID=$(gcloud config get-value project)
BACKEND_IMAGE=asia-south1-docker.pkg.dev/$PROJECT_ID/throw-shoes/throw-shoes-api

gcloud artifacts repositories create throw-shoes \
  --repository-format=docker \
  --location=$REGION --description="Throw Shoes images" || true

gcloud builds submit \
  --region=$REGION \
  --tag $BACKEND_IMAGE \
  -f Dockerfile.backend

gcloud run deploy throw-shoes-api \
  --image $BACKEND_IMAGE \
  --platform=managed \
  --region=$REGION \
  --allow-unauthenticated
```

Note the HTTPS URL that Cloud Run outputs (e.g. `https://throw-shoes-api-xxxx.a.run.app`).

## 2. Build & Deploy the frontend

The frontend needs to know where the API lives _at build time_. Pass the Cloud
Run API URL (with `/api` suffix) via the `VITE_API_BASE_URL` build argument.

```bash
FRONTEND_IMAGE=asia-south1-docker.pkg.dev/$PROJECT_ID/throw-shoes/throw-shoes-web
API_BASE=https://throw-shoes-api-xxxx.a.run.app/api    # replace with actual URL

gcloud builds submit \
  --region=$REGION \
  --tag $FRONTEND_IMAGE \
  --build-arg VITE_API_BASE_URL=$API_BASE \
  -f Dockerfile.frontend

gcloud run deploy throw-shoes-web \
  --image $FRONTEND_IMAGE \
  --platform=managed \
  --region=$REGION \
  --allow-unauthenticated
```

The resulting Cloud Run URL hosts the compiled SPA. All API calls target the
backend URL baked into `VITE_API_BASE_URL`.

## 3. Optional: custom domain & HTTPS

Use `gcloud run domain-mappings` or Cloud Load Balancing to point a custom
domain at the frontend service, then update `API_BASE` if you later expose the
API under the same domain (e.g. `https://api.example.com/api`).

## 4. Local production test run

You can locally verify the containers before pushing:

```bash
# Backend
docker build -f Dockerfile.backend -t throw-shoes-api .
docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -v "$(pwd)/server/data:/app/server/data" \
  throw-shoes-api

# Frontend (pointing to local backend)
docker build -f Dockerfile.frontend \
  --build-arg VITE_API_BASE_URL=http://localhost:8080/api \
  -t throw-shoes-web .
docker run --rm -p 5173:8080 throw-shoes-web
```

## 5. Environment recap

- `VITE_API_BASE_URL` – compile-time base URL for the browser to reach the API.
- Backend listens on `$PORT` (Cloud Run injects this); defaults to `4000`
  locally via `npm run dev:server`.

With both services deployed, share the frontend URL. Uploading bosses and
leaderboard interactions will hit the Cloud Run API in real time.
