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