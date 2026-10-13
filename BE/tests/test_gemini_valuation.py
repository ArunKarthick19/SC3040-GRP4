import base64
import json
import os
import sys
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
import gemini_valuation as gemini

PHOTO = gemini.SellerPhoto(mime_type="image/png", data=base64.b64encode(b"\x89PNG\r\n\x1a\nfixture").decode())
BASE = {
    "base_valuation": 500000, "year": 2026, "match_level": "town_flat_type",
    "comparable_count": 112, "comparable_price_range": {"low": 400000, "high": 600000},
}
ASSESSMENT = {
    "can_assess_condition": True, "estimated_value": 520000,
    "condition_label": "Well kept", "explanation": "Well-maintained finishes support a small premium.",
    "condition_rating": 4,
    "observations": ["Clean flooring."], "limitations": ["Hidden defects cannot be assessed."],
}


def response_body(assessment=ASSESSMENT):
    return {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": json.dumps(assessment)}]}}]}


@contextmanager
def mock_gemini(handler):
    client_class = httpx.AsyncClient
    transport = httpx.MockTransport(handler)
    with patch.object(gemini.httpx, "AsyncClient", side_effect=lambda **kwargs: client_class(transport=transport, **kwargs)):
        yield


class PhotoTests(unittest.TestCase):
    def test_image_parts_contain_the_original_photo(self):
        self.assertEqual(gemini.photo_parts([PHOTO]), [{"inline_data": {"mime_type": "image/png", "data": PHOTO.data}}])

    def test_empty_too_many_malformed_or_mislabelled_photos_rejected(self):
        bad_data = gemini.SellerPhoto(mime_type="image/png", data="!!!!")
        bad_mime = gemini.SellerPhoto(mime_type="image/jpeg", data=PHOTO.data)
        for photos in ([], [PHOTO] * 7, [bad_data], [bad_mime]):
            with self.subTest(count=len(photos)), self.assertRaises(ValueError):
                gemini.photo_parts(photos)

    def test_individual_and_total_size_limits(self):
        with patch.object(gemini, "MAX_PHOTO_BYTES", 8):
            with self.assertRaises(ValueError):
                gemini.photo_parts([PHOTO])
        with patch.object(gemini, "MAX_TOTAL_PHOTO_BYTES", 20):
            with self.assertRaises(ValueError):
                gemini.photo_parts([PHOTO, PHOTO])


class GeminiTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"GEMINI_API_KEY": "test-only-key", "GOOGLE_API_KEY": "", "GEMINI_MODEL": "gemini-test-model"})
        self.env.start()
        self.addCleanup(self.env.stop)

    async def test_baseline_prompt_and_multiple_images_sent_and_price_adjustment_computed(self):
        def handler(request):
            self.assertEqual(request.headers["x-goog-api-key"], "test-only-key")
            self.assertTrue(str(request.url).endswith("/gemini-test-model:generateContent"))
            payload = json.loads(request.content)
            parts = payload["contents"][0]["parts"]
            context = json.loads(parts[0]["text"].split("\n", 1)[1])
            self.assertEqual(context["base_valuation"], 500000)
            self.assertTrue(context["broad_town_estimate"])
            self.assertEqual(context["property_details"]["town"], "SENGKANG")
            self.assertEqual(context["photo_count"], 2)
            self.assertEqual(parts[1]["inline_data"]["data"], PHOTO.data)
            self.assertEqual(parts[2]["inline_data"]["data"], PHOTO.data)
            self.assertNotIn("test-only-key", request.content.decode())
            self.assertEqual(payload["generationConfig"]["responseFormat"]["text"]["mimeType"], "APPLICATION_JSON")
            return httpx.Response(200, json=response_body())
        with mock_gemini(handler):
            result = await gemini.assess_condition({"town": "SENGKANG"}, BASE, gemini.photo_parts([PHOTO, PHOTO]))
        self.assertEqual(result["estimated_value"], 520000)
        self.assertEqual(result["condition_adjustment"], 20000)
        self.assertEqual(result["photo_count"], 2)
        self.assertEqual(result["condition_rating"], 4)

    async def test_unassessable_photos_cannot_change_the_base_price(self):
        assessment = {**ASSESSMENT, "can_assess_condition": False, "estimated_value": 900000}
        with mock_gemini(lambda request: httpx.Response(200, json=response_body(assessment))):
            result = await gemini.assess_condition({}, BASE, gemini.photo_parts([PHOTO]))
        self.assertEqual(result["estimated_value"], BASE["base_valuation"])
        self.assertEqual(result["condition_adjustment"], 0)
        self.assertEqual(result["condition_label"], "Unable to assess")
        self.assertIsNone(result["condition_rating"])

    async def test_negative_adjustment(self):
        assessment = {**ASSESSMENT, "estimated_value": 470000, "condition_label": "Needs renovation"}
        with mock_gemini(lambda request: httpx.Response(200, json=response_body(assessment))):
            result = await gemini.assess_condition({}, BASE, gemini.photo_parts([PHOTO]))
        self.assertEqual(result["condition_adjustment"], -30000)

    async def test_missing_key_has_clear_error_without_a_network_request(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "", "GOOGLE_API_KEY": ""}):
            with self.assertRaisesRegex(gemini.GeminiUnavailable, "Set GEMINI_API_KEY"):
                await gemini.assess_condition({}, BASE, gemini.photo_parts([PHOTO]))

    async def test_provider_failures_are_safe_and_do_not_expose_raw_errors(self):
        for status in (400, 401, 403, 404, 429, 500):
            with self.subTest(status=status):
                with mock_gemini(lambda request: httpx.Response(status, json={"error": "test-only-key secret upstream details"})):
                    with self.assertRaises(gemini.GeminiUnavailable) as error:
                        await gemini.assess_condition({}, BASE, gemini.photo_parts([PHOTO]))
                self.assertNotIn("test-only-key", str(error.exception))

    async def test_timeout_is_reported(self):
        def handler(request):
            raise httpx.ReadTimeout("timeout", request=request)
        with mock_gemini(handler):
            with self.assertRaisesRegex(gemini.GeminiUnavailable, "timed out"):
                await gemini.assess_condition({}, BASE, gemini.photo_parts([PHOTO]))

    async def test_blocked_incomplete_malformed_and_invalid_prices_are_rejected(self):
        responses = [
            {"promptFeedback": {"blockReason": "SAFETY"}},
            {"candidates": [{"finishReason": "MAX_TOKENS"}]},
            {"candidates": ["invalid"]},
            response_body({**ASSESSMENT, "estimated_value": -1}),
            response_body({**ASSESSMENT, "estimated_value": "520000"}),
            response_body({**ASSESSMENT, "estimated_value": 1000000001}),
            response_body({**ASSESSMENT, "condition_rating": 0}),
            response_body({**ASSESSMENT, "condition_rating": 6}),
            response_body({**ASSESSMENT, "condition_rating": 3.5}),
            response_body({**ASSESSMENT, "condition_rating": None}),
            {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "not JSON"}]}}]},
        ]
        for body in responses:
            with self.subTest(body=body), mock_gemini(lambda request: httpx.Response(200, json=body)):
                with self.assertRaises(gemini.GeminiUnavailable):
                    await gemini.assess_condition({}, BASE, gemini.photo_parts([PHOTO]))


class EndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Endpoint tests never need real Supabase credentials or network access.
        with patch.dict(os.environ, {"SUPABASE_URL": "https://example.supabase.co", "SUPABASE_SERVICE_KEY": "test-service-key"}):
            import main
        from fastapi.testclient import TestClient
        cls.main = main
        cls.client = TestClient(main.app)

    def setUp(self):
        self.profile = {
            "town": "SENGKANG", "block": "204A", "street": "COMPASSVALE DR",
            "flat_type": "3 ROOM", "floor_area": 120, "remaining_lease": 40, "storey": 12,
            "photos": [PHOTO.model_dump()], "base_valuation": 99999999,
        }
        self.base = {**BASE, "available": True, "comparables": []}
        self.main.app.dependency_overrides[self.main.get_current_user] = lambda: object()
        self.addCleanup(self.main.app.dependency_overrides.clear)

    def test_photo_endpoint_requires_authentication(self):
        self.main.app.dependency_overrides.clear()
        with patch.object(self.main.gemini_valuation, "assess_condition", new_callable=AsyncMock) as assessment:
            response = self.client.post("/api/seller/valuation-with-photos", json=self.profile)
        self.assertEqual(response.status_code, 401)
        assessment.assert_not_awaited()

    def test_server_base_and_images_forwarded_and_final_value_returned(self):
        outcome = {**ASSESSMENT, "condition_adjustment": 20000, "photo_count": 1}
        with patch.object(self.main.seller_valuation, "estimate_price", return_value=self.base), \
             patch.object(self.main.gemini_valuation, "assess_condition", new_callable=AsyncMock, return_value=outcome) as assessment:
            response = self.client.post("/api/seller/valuation-with-photos", json=self.profile)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["estimated_value"], 520000)
        self.assertEqual(response.json()["base_valuation"], 500000)
        self.assertEqual(response.json()["ai_status"], "completed")
        self.assertEqual(response.json()["condition_rating"], 4)
        details, base, parts = assessment.await_args.args
        self.assertNotIn("photos", details)
        self.assertNotIn("base_valuation", details)
        self.assertEqual(base["base_valuation"], 500000)
        self.assertEqual(parts[0]["inline_data"]["data"], PHOTO.data)

    def test_failed_ai_preserves_base_and_explains_failure(self):
        with patch.object(self.main.seller_valuation, "estimate_price", return_value=self.base), \
             patch.object(self.main.gemini_valuation, "assess_condition", new_callable=AsyncMock,
                          side_effect=gemini.GeminiUnavailable("Gemini quota exceeded")):
            response = self.client.post("/api/seller/valuation-with-photos", json=self.profile)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["ai_status"], "unavailable")
        self.assertEqual(result["estimated_value"], 500000)
        self.assertEqual(result["ai_error"], "Gemini quota exceeded")
        self.assertNotIn("condition_adjustment", result)

    def test_missing_base_or_invalid_photos_do_not_call_gemini(self):
        with patch.object(self.main.seller_valuation, "estimate_price", return_value={"available": False, "reason": "No sales"}), \
             patch.object(self.main.gemini_valuation, "assess_condition", new_callable=AsyncMock) as assessment:
            response = self.client.post("/api/seller/valuation-with-photos", json=self.profile)
            self.assertEqual(response.json()["ai_status"], "not_requested")
            response = self.client.post("/api/seller/valuation-with-photos", json={**self.profile, "photos": []})
            self.assertEqual(response.status_code, 422)
            response = self.client.post("/api/seller/valuation-with-photos", json={**self.profile, "photos": [{"mime_type": "image/png", "data": "!!!!"}]})
            self.assertEqual(response.status_code, 422)
        assessment.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
