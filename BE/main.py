from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from auth import get_current_user

app = FastAPI(title="Flatly API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Flatly BE okay"}

@app.get("/me")
def me(user=Depends(get_current_user)):
    return {"id": user.id, "email": user.email}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", reload=True)