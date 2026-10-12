from typing import Literal

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import affordability
from auth import get_current_user
from recommender import FLAT_TYPES, model_year, recommend_locations, town_affordability, town_blocks

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


class BuyerProfile(BaseModel):
    monthly_income: float = Field(gt=0, description="Gross monthly household income")
    cash_savings: float = Field(ge=0)
    cpf_oa: float = Field(ge=0, description="Combined CPF Ordinary Account balance")
    age: int = Field(ge=21, le=100, description="Age of the oldest buyer")
    flat_type: Literal[tuple(FLAT_TYPES)]
    other_debts: float = Field(0, ge=0, description="Other monthly loan repayments, e.g. car loan")
    applicant_type: Literal["family", "single"] = "family"


@app.post("/api/buyer/recommendations")
def buyer_recommendations(profile: BuyerProfile):
    result = affordability.calculate(
        income=profile.monthly_income,
        cash=profile.cash_savings,
        cpf_oa=profile.cpf_oa,
        age=profile.age,
        other_debts=profile.other_debts,
        applicant_type=profile.applicant_type,
    )

    # Search towns using the best budget across the two loan types
    budgets = [r["max_purchase_price"] for r in result.values() if r["eligible"]]
    budget = max(budgets) if budgets else profile.cash_savings + profile.cpf_oa
    result["budget"] = round(budget)
    result["locations"] = recommend_locations(budget, profile.flat_type)
    result["locations_year"] = model_year()
    result["town_map"] = town_affordability(budget, profile.flat_type)
    return result


@app.get("/api/buyer/town-blocks")
def buyer_town_blocks(town: str, flat_type: Literal[tuple(FLAT_TYPES)]):
    return town_blocks(town, flat_type)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", reload=True)
