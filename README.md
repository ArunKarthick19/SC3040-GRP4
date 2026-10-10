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

## Supabase setup (auth)
`supabase/auth_setup.sql` creates a `profiles` table for usernames plus functions for username login and email-free password reset. Run it once in **Supabase → SQL Editor**.
    I type username -> run the get_email_by_username query through the api -> returns email -> logins email+password 