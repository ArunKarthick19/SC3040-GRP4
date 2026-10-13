import csv
import json
import os
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import seller_valuation
import train_locations

YEAR = date.today().year


def sale(price=500000, **changes):
    return {
        "month": f"{YEAR}-01", "block": "123A", "street_name": "EXAMPLE AVE 1",
        "floor_area_sqm": 90.0, "remaining_lease": 70.0,
        "storey_range": "10 TO 12", "storey_min": 10, "storey_max": 12,
        "resale_price": price, **changes,
    }


def model(sales):
    return {"year": YEAR, "flat_types": {"4 ROOM": {"BEDOK": sales}}}


def estimate(**changes):
    profile = {
        "town": "Bedok", "block": "123a", "street": " Example Avenue 1 ",
        "flat_type": "4 ROOM", "floor_area": 90.0, "remaining_lease": 70.0,
        "storey": 12, **changes,
    }
    return seller_valuation.estimate_price(**profile)


class TrainingTests(unittest.TestCase):
    def test_current_year_only_and_buyer_summary_preserved(self):
        rows = []
        for year, price in [(YEAR - 1, 100000), (YEAR, 400000),
                            (YEAR, 500000), (YEAR, 600000), (YEAR + 1, 900000)]:
            rows.append({
                "month": f"{year}-02", "town": "BEDOK", "flat_type": "4 ROOM",
                "block": "123A", "street_name": "EXAMPLE AVE 1",
                "floor_area_sqm": "90.5", "remaining_lease": "70 years 06 months",
                "storey_range": "10 TO 12", "resale_price": str(price),
            })
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "sales.csv"
            with source.open("w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
            buyer = train_locations.train(source, YEAR)
            seller = train_locations.train_seller(source, YEAR)
        self.assertEqual(buyer, {"4 ROOM": {"BEDOK": {
            "transactions": 3, "median_price": 500000, "typical_floor_area": 90,
            "typical_remaining_lease": 70, "prices": [400000, 500000, 600000],
            "blocks": [["123A", "EXAMPLE AVE 1", 500000, 3]],
        }}})
        transactions = seller["flat_types"]["4 ROOM"]["BEDOK"]
        self.assertEqual(seller["year"], YEAR)
        self.assertEqual([s["resale_price"] for s in transactions], [400000, 500000, 600000])
        self.assertEqual(transactions[0]["floor_area_sqm"], 90.5)
        self.assertEqual(transactions[0]["remaining_lease"], 70.5)
        self.assertEqual((transactions[0]["storey_min"], transactions[0]["storey_max"]), (10, 12))

    def test_no_current_year_sales_does_not_fall_back_to_older_year(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "sales.csv"
            source.write_text(f"month\n{YEAR - 1}-01\n")
            with self.assertRaises(SystemExit):
                train_locations.train_seller(source, YEAR)


class EstimateTests(unittest.TestCase):
    def test_block_median_and_address_normalisation(self):
        sales = [sale(400000), sale(500000), sale(600000), sale(900000, block="124")]
        with patch.object(seller_valuation, "_model", return_value=model(sales)):
            result = estimate()
        self.assertEqual(result["match_level"], "block")
        self.assertEqual(result["base_valuation"], 500000)
        self.assertEqual(result["comparable_count"], 3)
        self.assertEqual(result["comparable_price_range"], {"low": 400000, "high": 600000})

    def test_street_fallback_when_block_has_too_few_matches(self):
        sales = [sale(400000), sale(600000), sale(500000, block="124")]
        with patch.object(seller_valuation, "_model", return_value=model(sales)):
            result = estimate()
        self.assertEqual(result["match_level"], "street")
        self.assertEqual(result["base_valuation"], 500000)

    def test_town_fallback_when_street_has_too_few_matches(self):
        sales = [sale(400000), sale(500000, street_name="OTHER ST 2"),
                 sale(600000, street_name="OTHER ST 2")]
        with patch.object(seller_valuation, "_model", return_value=model(sales)):
            result = estimate()
        self.assertEqual(result["match_level"], "town")
        self.assertEqual(result["base_valuation"], 500000)

    def test_dissimilar_sales_other_towns_and_flat_types_are_excluded(self):
        sales = [sale(400000), sale(500000), sale(600000),
                 sale(900000, floor_area_sqm=110),
                 sale(900000, remaining_lease=80),
                 sale(900000, storey_min=19, storey_max=21)]
        dataset = model(sales)
        dataset["flat_types"]["5 ROOM"] = {"BEDOK": [sale(900000)] * 3}
        dataset["flat_types"]["4 ROOM"]["TAMPINES"] = [sale(900000)] * 3
        with patch.object(seller_valuation, "_model", return_value=dataset):
            result = estimate()
        self.assertEqual(result["comparable_count"], 3)
        self.assertEqual(result["base_valuation"], 500000)

    def test_similarity_boundaries_are_inclusive(self):
        sales = [sale(floor_area_sqm=99, remaining_lease=75, storey_min=15, storey_max=17)] * 3
        with patch.object(seller_valuation, "_model", return_value=model(sales)):
            self.assertTrue(estimate()["available"])

    def test_fewer_than_three_sales_produces_no_price(self):
        with patch.object(seller_valuation, "_model", return_value=model([sale()] * 2)):
            result = estimate()
        self.assertFalse(result["available"])
        self.assertIsNone(result["base_valuation"])
        self.assertEqual(result["comparable_count"], 2)

    def test_town_type_fallback_when_no_physical_details_match(self):
        dataset = model([sale(400000), sale(500000), sale(600000)])
        dataset["flat_types"]["5 ROOM"] = {"BEDOK": [sale(900000)] * 3}
        dataset["flat_types"]["4 ROOM"]["TAMPINES"] = [sale(900000)] * 3
        with patch.object(seller_valuation, "_model", return_value=dataset):
            result = estimate(floor_area=120, remaining_lease=40, storey=50)
        self.assertTrue(result["available"])
        self.assertEqual(result["match_level"], "town_flat_type")
        self.assertEqual(result["base_valuation"], 500000)
        self.assertEqual(result["comparable_count"], 3)

    def test_town_type_fallback_uses_all_prices_not_just_preview(self):
        sales = [sale(400000, month=f"{YEAR}-01")] * 11
        sales += [sale(900000, month=f"{YEAR}-02")] * 10
        with patch.object(seller_valuation, "_model", return_value=model(sales)):
            result = estimate(remaining_lease=40)
        self.assertEqual(result["base_valuation"], 400000)
        self.assertEqual(result["comparable_count"], 21)
        self.assertEqual(len(result["comparables"]), 10)
        self.assertTrue(all(s["resale_price"] == 900000 for s in result["comparables"]))
        self.assertEqual(result["comparable_price_range"], {"low": 400000, "high": 900000})

    def test_town_type_fallback_when_only_two_similar_sales_exist(self):
        sales = [sale(400000), sale(500000), sale(600000, remaining_lease=90)]
        with patch.object(seller_valuation, "_model", return_value=model(sales)):
            result = estimate()
        self.assertEqual(result["match_level"], "town_flat_type")
        self.assertEqual(result["comparable_count"], 3)
        self.assertEqual(result["base_valuation"], 500000)

    def test_closest_ten_are_used_and_newer_sales_break_ties(self):
        sales = [sale(400000, month=f"{YEAR}-{i:02d}") for i in range(1, 11)]
        sales += [sale(600000, month=f"{YEAR}-11"),
                  sale(900000, month=f"{YEAR}-12", floor_area_sqm=98)]
        with patch.object(seller_valuation, "_model", return_value=model(sales)):
            result = estimate()
        self.assertEqual(result["comparable_count"], 10)
        self.assertEqual(result["candidate_count"], 12)
        self.assertEqual(result["match_level"], "block")
        self.assertEqual(result["comparables"][0]["month"], f"{YEAR}-11")
        self.assertNotIn(900000, [s["resale_price"] for s in result["comparables"]])
        self.assertNotIn(f"{YEAR}-01", [s["month"] for s in result["comparables"]])

    def test_unknown_town_rejected_and_missing_flat_type_has_no_estimate(self):
        with patch.object(seller_valuation, "_model", return_value=model([sale()] * 3)):
            with self.assertRaises(ValueError):
                estimate(town="UNKNOWN")
            self.assertFalse(estimate(flat_type="2 ROOM")["available"])


class ModelLoadingTests(unittest.TestCase):
    def test_missing_stale_and_rebuilt_models(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "seller.json"
            with patch.object(seller_valuation, "SELLER_MODEL_PATH", path):
                seller_valuation._load_model.cache_clear()
                with self.assertRaises(seller_valuation.SellerDataUnavailable):
                    seller_valuation.seller_options()
                path.write_text(json.dumps({"year": YEAR - 1, "flat_types": {}}))
                with self.assertRaises(seller_valuation.SellerDataUnavailable):
                    seller_valuation.seller_options()
                old_mtime = path.stat().st_mtime_ns
                path.write_text(json.dumps(model([sale()] * 3)))
                os.utime(path, ns=(old_mtime + 1000000, old_mtime + 1000000))
                self.assertEqual(seller_valuation.seller_options(), {"year": YEAR, "towns": ["BEDOK"]})
                self.assertTrue(estimate()["available"])
        seller_valuation._load_model.cache_clear()


if __name__ == "__main__":
    unittest.main()
