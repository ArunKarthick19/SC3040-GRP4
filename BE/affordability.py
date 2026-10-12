"""Buyer affordability: max HDB loan, max bank loan and monthly repayments.

All policy numbers live in RULES so they can be updated in one place when
HDB / MAS change them. Figures are as understood in Oct 2026; verify against
hdb.gov.sg and mas.gov.sg before relying on them.
"""

RULES = {
    "max_age_at_loan_end": 65,  # tenure is capped so the loan ends by this age
    "msr": 0.30,  # Mortgage Servicing Ratio: max share of income for the housing loan
    "tdsr": 0.55,  # Total Debt Servicing Ratio: max share of income for all debts (bank loans)
    "hdb": {
        "interest_rate": 0.026,  # 0.1% above the CPF OA rate
        "assessment_rate": 0.030,  # floor rate HDB uses to work out how much you can borrow
        "ltv": 0.75,
        "max_tenure_years": 25,
        "income_ceiling": {"family": 14000, "single": 7000},
    },
    "bank": {
        "interest_rate": 0.030,  # assumed market rate, banks vary
        "assessment_rate": 0.040,  # MAS medium-term interest rate floor
        "ltv": 0.75,
        "max_tenure_years": 30,
        "min_cash_downpayment": 0.05,  # at least 5% of the price must be cash
    },
}


def monthly_payment(principal, annual_rate, years):
    r, n = annual_rate / 12, years * 12
    if principal <= 0 or n <= 0:
        return 0.0
    return principal * r / (1 - (1 + r) ** -n)


def max_principal(monthly, annual_rate, years):
    """Largest loan a given monthly payment can service."""
    r, n = annual_rate / 12, years * 12
    if monthly <= 0 or n <= 0:
        return 0.0
    return monthly * (1 - (1 + r) ** -n) / r


def _loan_option(rules, tenure, max_monthly, cash, cpf_oa):
    """Works out the most expensive flat this loan type can fund.

    Price is limited by three things: the loan you can service plus your funds,
    your funds covering the downpayment (1 - LTV), and for bank loans the
    minimum cash part of the downpayment.
    """
    funds = cash + cpf_oa
    loan_cap = max_principal(max_monthly, rules["assessment_rate"], tenure)

    price_limits = [funds + loan_cap, funds / (1 - rules["ltv"])]
    if "min_cash_downpayment" in rules:
        price_limits.append(cash / rules["min_cash_downpayment"])
    max_price = min(price_limits)

    loan = min(loan_cap, rules["ltv"] * max_price, max_price - funds)
    loan = max(loan, 0)
    monthly = monthly_payment(loan, rules["interest_rate"], tenure)

    return {
        "eligible": True,
        "reason": None,
        "max_loan": round(loan),
        "max_purchase_price": round(max_price),
        "downpayment": round(max_price - loan),
        "monthly_instalment": round(monthly),
        "tenure_years": tenure,
        "interest_rate": rules["interest_rate"],
        "total_interest": round(monthly * tenure * 12 - loan),
    }


def _not_eligible(reason):
    return {"eligible": False, "reason": reason}


def calculate(income, cash, cpf_oa, age, other_debts=0, applicant_type="family"):
    years_left = RULES["max_age_at_loan_end"] - age
    if years_left < 5:
        msg = f"Loan must end by age {RULES['max_age_at_loan_end']}, which leaves too short a tenure"
        return {"hdb_loan": _not_eligible(msg), "bank_loan": _not_eligible(msg)}

    # HDB loan: only the MSR applies
    hdb = RULES["hdb"]
    ceiling = hdb["income_ceiling"][applicant_type]
    if income > ceiling:
        hdb_result = _not_eligible(f"Monthly household income is above the ${ceiling:,} HDB loan ceiling")
    else:
        tenure = min(hdb["max_tenure_years"], years_left)
        hdb_result = _loan_option(hdb, tenure, RULES["msr"] * income, cash, cpf_oa)

    # Bank loan: both MSR and TDSR (after existing debts) apply
    bank = RULES["bank"]
    bank_monthly = min(RULES["msr"] * income, RULES["tdsr"] * income - other_debts)
    if bank_monthly <= 0:
        bank_result = _not_eligible("Existing debt repayments already use up the 55% TDSR limit")
    else:
        tenure = min(bank["max_tenure_years"], years_left)
        bank_result = _loan_option(bank, tenure, bank_monthly, cash, cpf_oa)

    return {"hdb_loan": hdb_result, "bank_loan": bank_result}
