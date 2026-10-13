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
python train_locations.py   # writes models/location_stats.json
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

## Supabase setup (auth)
`supabase/auth_setup.sql` creates a `profiles` table for usernames plus functions for username login and email-free password reset. Run it once in **Supabase → SQL Editor**.
    I type username -> run the find_account_email query through the api -> returns email -> logins email+password 