import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { scrollToElement } from "../scroll";
import { supabase } from "../supabaseClient";
import { logEvent } from "../audit";

const FLAT_TYPES = ["2 ROOM", "3 ROOM", "4 ROOM", "5 ROOM", "EXECUTIVE"];

const money = (n) => `$${Math.round(n).toLocaleString("en-SG")}`;

const titleCase = (text) => text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const MATCH_LABELS = {
  block: "Same block", street: "Same street", town: "Same town",
  town_flat_type: "Town and flat type only",
};
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_PHOTO_BYTES = 12 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ mime_type: file.type, data: reader.result.split(",")[1] });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}. Please select it again.`));
    reader.readAsDataURL(file);
  });
}

async function sellerRequest(path, options = {}) {
  const response = await fetch(`${import.meta.env.VITE_API_URL}${path}`, options);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The server did not return a valid response. Please try again.");
  }
  if (!response.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Check your flat details and try again.");
  }
  return data;
}

export default function SellerPage({ session }) {
  const [form, setForm] = useState({
    town: "",
    block: "",
    street: "",
    postal_code: "",
    flat_type: "4 ROOM",
    floor_area: "",
    remaining_lease: "",
    storey: "",
  });
  const [photos, setPhotos] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState(null);
  const [optionsError, setOptionsError] = useState("");
  const resultsRef = useRef(null);
  const photoInputRef = useRef(null);
  const broadEstimate = result?.match_level === "town_flat_type";
  const aiCompleted = result?.ai_status === "completed";

  useEffect(() => {
    let active = true;
    sellerRequest("/api/seller/options")
      .then((data) => { if (active) setOptions(data); })
      .catch((err) => {
        if (active) setOptionsError(`Could not load seller data. ${err.message}`);
      });
    return () => { active = false; };
  }, []);

  // Bring the valuation into view each time a new one arrives
  useEffect(() => {
    if (result && resultsRef.current) scrollToElement(resultsRef.current, 500);
  }, [result]);

  const update = (field) => (e) =>
    setForm({ ...form, [field]: e.target.value });

  function clearPhotos() {
    setPhotos([]);
    setError("");
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  function handlePhotos(e) {
    setError("");
    const selected = Array.from(e.target.files);
    if (selected.length > 6
      || selected.some((file) => !PHOTO_TYPES.includes(file.type) || file.size === 0 || file.size > MAX_PHOTO_BYTES)
      || selected.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_PHOTO_BYTES) {
      setError("Select up to 6 JPEG, PNG or WebP photos, no more than 4 MB each and 12 MB in total.");
      setPhotos([]);
      e.target.value = "";
      return;
    }
    setPhotos(selected);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const details = {
        town: form.town,
        block: form.block,
        street: form.street,
        flat_type: form.flat_type,
        floor_area: Number(form.floor_area),
        remaining_lease: Number(form.remaining_lease),
        storey: Number(form.storey),
      };
      const headers = { "Content-Type": "application/json" };
      if (photos.length) {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!currentSession) throw new Error("Please log in again to analyse photos.");
        headers.Authorization = `Bearer ${currentSession.access_token}`;
        details.photos = await Promise.all(photos.map(readPhoto));
      }
      const data = await sellerRequest(photos.length ? "/api/seller/valuation-with-photos" : "/api/seller/valuation", {
        method: "POST",
        headers,
        body: JSON.stringify(details),
      });
      setResult(data);
      logEvent(photos.length ? "valuation_photos" : "valuation", {
        town: details.town,
        block: details.block,
        street: details.street,
        flat_type: details.flat_type,
        photos: photos.length,
        estimate: data.estimated_value ?? data.base_valuation ?? null,
      });
    } catch (err) {
      setError(`Could not estimate your flat. ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar session={session} />

      <main className="section section-compact">
        <div className="container">
          <p>
            <Link to="/start">← Back</Link>
          </p>
          <div className="section-head">
            <span className="eyebrow">For sellers</span>
            <h2>What's your flat worth?</h2>
            <p>
              Enter your flat details for an estimate based on this year's sales.
              Optionally, add photos for AI-assisted condition assessment and valuation for your flat.
            </p>
          </div>

          <div className="buyer-layout">
            <form className="panel buyer-form seller-form" onSubmit={handleSubmit}>
              <div>
                <label>
                  <span>Town <span className="required-mark" aria-hidden="true">*</span></span>
                  <select value={form.town} onChange={update("town")} required disabled={!options}>
                    <option value="">{options ? "Choose a town" : "Loading towns..."}</option>
                    {options?.towns.map((town) => (
                      <option key={town} value={town}>{titleCase(town)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  <span>Block <span className="required-mark" aria-hidden="true">*</span></span>
                  <input
                    type="text"
                    value={form.block}
                    onChange={update("block")}
                    placeholder="910A"
                    required
                  />
                </label>
              </div>
              <div>
                <label>
                  <span>Street name <span className="required-mark" aria-hidden="true">*</span></span>
                  <input
                    type="text"
                    value={form.street}
                    onChange={update("street")}
                    placeholder="Hougang Ave 9"
                    required
                  />
                </label>
              </div>
              <div>
                <label>
                  <span>Postal code <span className="required-mark" aria-hidden="true">*</span></span>
                  <input
                    type="text"
                    value={form.postal_code}
                    onChange={update("postal_code")}
                    placeholder="530999"
                    pattern="[0-9]{6}"
                    required
                  />
                </label>
              </div>
              <div>
                <label>
                  <span>Flat type <span className="required-mark" aria-hidden="true">*</span></span>
                  <select value={form.flat_type} onChange={update("flat_type")} required>
                    {FLAT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.charAt(0) + t.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  <span>Floor area (sqm) <span className="required-mark" aria-hidden="true">*</span></span>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    step="any"
                    value={form.floor_area}
                    onChange={update("floor_area")}
                    placeholder="93"
                    required
                  />
                </label>
              </div>
              <div>
                <label>
                  <span>Remaining lease (years) <span className="required-mark" aria-hidden="true">*</span></span>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    step="any"
                    value={form.remaining_lease}
                    onChange={update("remaining_lease")}
                    placeholder="92"
                    required
                  />
                </label>
              </div>
              <div>
                <label>
                  <span>Storey <span className="required-mark" aria-hidden="true">*</span></span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={form.storey}
                    onChange={update("storey")}
                    placeholder="12"
                    required
                  />
                </label>
              </div>
              <div className="field-wide">
                <label>
                  Photos of your flat (Up to 6)
                  <input
                    type="file"
                    ref={photoInputRef}
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handlePhotos}
                    disabled={loading}
                  />
                </label>
                <p className="muted">
                  JPEG, PNG or WebP; up to 4 MB each and 12 MB total.
                </p>
                {photos.length > 0 && (
                  <div className="photo-selection">
                    <span className="muted">
                      {photos.length} photo{photos.length > 1 ? "s" : ""} selected
                    </span>
                    <button type="button" className="btn-outline" onClick={clearPhotos} disabled={loading}>
                      Clear photos
                    </button>
                  </div>
                )}
              </div>
              <div className="buyer-form-actions">
                {optionsError && <p className="alert alert-error">{optionsError}</p>}
                {error && <p className="alert alert-error">{error}</p>}
                <button type="submit" disabled={loading || !options}>
                  {loading ? (photos.length ? "Estimating value and analysing photos..." : "Finding comparable sales...") : "Value my flat"}
                </button>
              </div>
            </form>

            <div className="buyer-results">
              {!result ? (
                <div className="panel muted">
                  Fill in your flat details to see a base resale estimate.
                </div>
              ) : !result.available ? (
                <div className="panel" ref={resultsRef}>
                  <h3>Not enough comparable sales</h3>
                  <p>{result.reason}</p>
                </div>
              ) : (
                <>
                  <div className="panel budget-panel" ref={resultsRef}>
                    <div className="loan-sub">{aiCompleted
                      ? "AI Assisted resale estimate"
                      : (broadEstimate ? "Broad estimate by town and flat type" : "Estimated base resale value")}</div>
                    <div className="loan-amount">
                      {money(result.estimated_value ?? result.base_valuation)}
                    </div>
                  </div>
                  {result.ai_status === "unavailable" && (
                    <p className="alert alert-error" role="alert">
                      {result.ai_error} Showing the resale-data base estimate without a photo adjustment.
                    </p>
                  )}
                  {aiCompleted && (
                    <div className="panel">
                      <h3>Condition Assessment</h3>
                      <ul className="stat-list">
                        <li>
                          Condition rating
                          <strong>{result.condition_rating != null ? `${result.condition_rating} / 5` : "Unable to assess"}</strong>
                        </li>
                        <li>Photos analysed <strong>{result.photo_count}</strong></li>
                      </ul>
                      <p>{result.explanation}</p>
                      <ul>{result.observations.map((observation, index) => <li key={index}>{observation}</li>)}</ul>
                      <p className="muted">{result.limitations.join(" ")}</p>
                    </div>
                  )}
                  <div className="panel">
                    <h3>Comparable Units</h3>
                    <ul className="stat-list">
                      <li>
                        Comparison area
                        <strong>{MATCH_LABELS[result.match_level]} · {titleCase(result.town)}</strong>
                      </li>
                      <li>
                        Comparable sales used
                        <strong>{result.comparable_count}</strong>
                      </li>
                      <li>
                        Comparable sale prices
                        <strong>
                          {money(result.comparable_price_range.low)} – {money(result.comparable_price_range.high)}
                        </strong>
                      </li>
                    </ul>
                    <p className="muted">
                      {broadEstimate ? (
                        <>Not enough sales matched your flat's size, lease and storey. This estimate is the
                          median of all {result.comparable_count} {result.flat_type.toLowerCase()} sales
                          in {titleCase(result.town)} in {result.year}. It does not account for your
                          block, street, floor area, remaining lease or storey.</>
                      ) : (
                        <>The estimate is the median of up to 10 similar {result.flat_type.toLowerCase()} sales:
                          floor area within 10%, remaining lease within 5 years, and storey within 3 floors
                          of the recorded range. We expand from your block to your street or town when
                          fewer than 3 matching sales are available.</>
                      )}
                    </p>
                    {result.comparable_count > result.comparables.length && (
                      <p className="muted">
                        Showing {result.comparables.length} recent sales below. All {result.comparable_count} sales
                        were used for the estimate and sale-price range.
                      </p>
                    )}
                    <ul className="stat-list">
                      {result.comparables.map((sale, index) => (
                        <li key={`${sale.month}-${sale.block}-${index}`}>
                          <span>
                            Blk {sale.block} {titleCase(sale.street_name)} · {sale.month}<br />
                            {sale.floor_area_sqm} sqm · {sale.remaining_lease.toFixed(1)} yrs lease · storeys {sale.storey_range}
                          </span>
                          <strong>{money(sale.resale_price)}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="fine-print">
                    Estimate only, based on recorded sales in {result.year}. The sale-price range
                    shows the comparables' actual prices, not a guaranteed valuation range.
                    {aiCompleted
                      ? " Gemini's adjustment reflects only visible photo evidence. Hidden defects and actual market value cannot be established from photos; this is not a professional valuation."
                      : " Condition, renovations and photos are not included in this base estimate."}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
