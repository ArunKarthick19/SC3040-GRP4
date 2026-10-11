import os
from dotenv import load_dotenv
from fastapi import Header, HTTPException
from supabase import create_client

load_dotenv()
supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.removeprefix("Bearer ")
    try:
        user = supabase.auth.get_user(token).user
    except Exception:
        raise HTTPException(401, "Invalid token")
    if not user:
        raise HTTPException(401, "Invalid token")
    return user