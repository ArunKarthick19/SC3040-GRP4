# Flatly

## Frontend
```
cd FE
npm install
copy .env.example .env   # fill in keys*
npm run dev               # http://localhost:5173
```

## Backend
```
cd BE
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # fill in keys*
python main.py OR uvicorn main:app --reload?            # http://localhost:8000/docs
```

### Town recommendations
Built from `ResaleflatpricesbasedonregistrationdatefromJan2017onwards.csv` (repo root), using only the current year's sales. Re-run after downloading a newer CSV:
```
cd BE
python train_locations.py   # writes buyer location_stats.json and seller seller_comparables.json
python geocode_blocks.py    # block coordinates for the heat map, ~2 h first time (OneMap rate limit), resumes if stopped
```

### Price model (suggested flat types)
A gradient boosting model (scikit-learn) trained on every resale since 2017 predicts a flat's price from town, flat type, floor area, remaining lease, storey and month. It's tested on the latest 6 months of sales (results in `models/price_model_metrics.json`). Retrain after a new CSV (~1 min):
```
cd BE
python train_price_model.py   # writes models/price_model.joblib
```

### Location check (nearest MRT / bus stops)
`build_transport.py` downloads every MRT/LRT station and bus stop from OneMap into `models/transport.json` (~10 min). Already done; re-run only if stations or stops change. Addresses are looked up live through OneMap.

`build_town_boundaries.py` makes `FE/public/sg_towns.geojson` (town outlines for the heat map). Already done; only re-run if URA boundaries change.

### Seller base estimates
The same training command also saves individual **current-year** transactions to
`BE/models/seller_comparables.json`. The buyer file and recommendation logic are unchanged.

`POST /api/seller/valuation` takes `town`, `block`, `street`, `flat_type`,
`floor_area` (sqm), `remaining_lease` (years) and `storey` (an exact floor number).
`GET /api/seller/options` supplies the available towns and data year.

The estimator matches the same town and flat type, floor area within 10%, lease
within 5 years and storey within 3 floors of each sale's recorded storey range.
It looks for at least 3 matches in the same block, then street, then town. The
median price of the closest 10 matches (or all matches if fewer) becomes the base
estimate. Equal similarity scores prefer newer sales. If fewer than 3 sales match
the physical details, a broad fallback uses the median of **all** current-year
sales of that flat type in that town, ignoring block, street, size, lease and
storey. The seller page labels this explicitly. The fallback returns up to 10
recent sales as a preview; its median, count and price range use the full group.
If the entire town/flat-type group has fewer than 3 sales, an insufficient-data
result is returned. The response includes sale prices, match scope and year.

The seller page uses this estimate. Postal codes are not present in
the CSV and are not used for matching. A stale seller dataset is rejected until
the current year's data is rebuilt. Seller data reloads after retraining; restart
the backend to refresh the buyer's existing cached statistics.

### Gemini photo condition assessment
Set `GEMINI_API_KEY` in **BE/.env** and restart the backend. `GOOGLE_API_KEY` is
also supported; `GOOGLE_MAPS_API_KEY` is not used for Gemini. Optional
`GEMINI_MODEL` overrides the default `gemini-3.5-flash-lite`. The existing `httpx`
dependency calls Google's REST API; no additional dependencies are required.

When photos are selected, the seller page calls
`POST /api/seller/valuation-with-photos` with the property fields plus `photos`
(`mime_type` and base64 `data`) and a Supabase Bearer token. The backend computes
the base estimate itself, includes its year/comparison basis and the property
details in the prompt, and attaches every selected photo as inline image data.
Gemini returns a structured condition assessment and final SGD value. The backend
validates the response and derives `condition_adjustment = estimated_value -
base_valuation`. The page shows the final price as **AI Assisted resale estimate**,
followed by a **Condition Assessment** with Gemini's 1–5 condition rating, photo
count, analysis, observations and limitations. The scale runs from 1 (very poor)
to 5 (excellent). Unassessable photos have a null rating rather than an invented score.

Photos are optional: without them the existing base estimate is displayed.
Up to 6 JPEG/PNG/WebP photos are accepted, at most 4 MB each and 12 MB total.
Photos are sent to Google for analysis and are not saved by this backend. If
Gemini is unavailable, rejects the request or returns an invalid result, the
response retains the base estimate and explains the failure (`ai_status` is
`unavailable`). Unassessable photos retain the base value with zero adjustment.
Insufficient resale data skips Gemini rather than inventing a starting price.

API references: [image input](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding),
[structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).

Backend regression checks:
```
BE/venv/bin/python -m unittest discover -s BE/tests -v
```

## Supabase setup (audit trail and admin)
`supabase/audit_setup.sql` (run after `auth_setup.sql`) adds an `audit_log` table and an admin flag. The account whose username is **admin123** is the admin: sign up with username `admin123`, password `admin123` and any email, and it's marked as admin automatically. Only the admin can read the log, at **Profile menu → Audit trail** (`/admin`). Logged events: sign-up, login, logout, buyer searches, saved searches and flats, valuations (with or without photos), and profile and password changes.

## Supabase setup (auth)
`supabase/auth_setup.sql` creates a `profiles` table for usernames plus functions for username login and email-free password reset. Run it once in **Supabase → SQL Editor**.
    I type username -> run the find_account_email query through the api -> returns email -> logins email+password
