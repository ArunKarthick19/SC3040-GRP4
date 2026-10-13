from typing import Literal

import httpx
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import affordability
import location
import price_model
from auth import get_current_user
from recommender import FLAT_TYPES, model_year, recommend_locations, suggest_flat_types, town_affordability, town_blocks

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
    result["flat_types"] = suggest_flat_types(budget)
    result["price_model"] = price_model.metrics()  # accuracy, shown alongside the suggestions
    # Every flat type's town map, so the suggestions map can switch between them
    result["town_maps"] = {ft: town_affordability(budget, ft) for ft in FLAT_TYPES}
    return result


@app.get("/api/location")
def location_check(block: str = "", street: str = "", postal: str = ""):
    """Address and nearest MRT/LRT stations and bus stops, from a postal code or block + street."""
    postal, block, street = postal.strip(), block.strip(), street.strip()
    if postal:
        if not (postal.isdigit() and len(postal) == 6):
            raise HTTPException(422, "Postal code must be 6 digits")
        query = postal
    elif block and street:
        query = f"{block} {street}"
    else:
        raise HTTPException(422, "Enter a postal code, or a block and street name")

    try:
        result = location.analyse(query, block or None)
    except httpx.HTTPError:
        raise HTTPException(502, "Couldn't reach OneMap to look up the address. Try again shortly.")
    except RuntimeError as err:
        raise HTTPException(503, str(err))
    if result is None:
        raise HTTPException(404, "Couldn't find that address. Check the block and street name, or try the postal code.")
    return result


@app.get("/api/buyer/town-blocks")
def buyer_town_blocks(town: str, flat_type: Literal[tuple(FLAT_TYPES)]):
    result = town_blocks(town, flat_type)
    location.add_nearest(result["blocks"])  # nearest MRT and bus stop, drawn on the map on hover
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", reload=True)
