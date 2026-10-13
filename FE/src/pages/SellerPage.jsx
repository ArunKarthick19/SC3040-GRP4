import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";

const FLAT_TYPES = ["2 ROOM", "3 ROOM", "4 ROOM", "5 ROOM", "EXECUTIVE"];

const money = (n) => `$${Math.round(n).toLocaleString("en-SG")}`;

const HARDCODED_RESULT = {
  base_valuation: 598000,
  condition_label: "Well kept",
  condition_adjustment: 14000,
  estimated_value: 612000,
  remaining_lease: 92,
};

export default function SellerPage({ session }) {
  const [form, setForm] = useState({
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

  const update = (field) => (e) =>
    setForm({ ...form, [field]: e.target.value });

  function handlePhotos(e) {
    setPhotos(Array.from(e.target.files).slice(0, 6));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (photos.length === 0) {
      setError("Please upload at least one photo of your flat.");
      return;
    }
    setLoading(true);
    // faking the delay
    await new Promise((r) => setTimeout(r, 1500));
    setResult({
      ...HARDCODED_RESULT,
      flatType: form.flat_type,
      remaining_lease:
        Number(form.remaining_lease) || HARDCODED_RESULT.remaining_lease,
    });
    setLoading(false);
  }

  return (
    <>
      <Navbar session={session} />

      <main className="section">
        <div className="container">
          <p>
            <Link to="/start">← Back</Link>
          </p>
          <div className="section-head">
            <span className="eyebrow">For sellers</span>
            <h2>What's your flat worth?</h2>
            <p>
              Tell us where your flat is, its type, and upload a few photos for
              a condition-adjusted valuation.
            </p>
          </div>

          <div className="buyer-layout">
            <form className="panel" onSubmit={handleSubmit}>
              <div>
                <label>
                  Block
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
                  Street name
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
                  Postal code
                  <input
                    type="text"
                    value={form.postal_code}
                    onChange={update("postal_code")}
                    placeholder="530999"
                    required
                  />
                </label>
              </div>
              <div>
                <label>
                  Flat type
                  <select value={form.flat_type} onChange={update("flat_type")}>
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
                  Floor area (sqm)
                  <input
                    type="number"
                    min="1"
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
                  Remaining lease (years)
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={form.remaining_lease}
                    onChange={update("remaining_lease")}
                    placeholder="92"
                    required
                  />
                </label>
              </div>
              <div>
                <label>
                  Storey
                  <input
                    type="text"
                    value={form.storey}
                    onChange={update("storey")}
                    placeholder=""
                    required
                  />
                </label>
              </div>
              <div>
                <label>
                  Photos of your flat (up to 6)
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotos}
                  />
                </label>
                {photos.length > 0 && (
                  <p className="muted">
                    {photos.length} photo{photos.length > 1 ? "s" : ""} selected
                  </p>
                )}
              </div>
              {error && <p className="alert alert-error">{error}</p>}
              <button type="submit" disabled={loading}>
                {loading ? "Analysing photos..." : "Value my flat"}
              </button>
            </form>

            <div className="buyer-results">
              {!result ? (
                <div className="panel muted">
                  Fill in your flat details and upload photos to see your
                  valuation.
                </div>
              ) : (
                <>
                  <p className="alert alert-success">
                    Photos uploaded successfully. Valuation ready.
                  </p>
                  <div className="panel budget-panel">
                    <div className="loan-sub">Estimated resale value</div>
                    <div className="loan-amount">
                      {money(result.estimated_value)}
                    </div>
                    <div className="loan-sub">
                      {result.remaining_lease} years lease left
                    </div>
                  </div>
                  <div className="panel">
                    <h3>How we got there</h3>
                    <ul className="stat-list">
                      <li>
                        Base valuation{" "}
                        <strong>{money(result.base_valuation)}</strong>
                      </li>
                      <li>
                        Condition from {photos.length} photo
                        {photos.length > 1 ? "s" : ""}{" "}
                        <span className="tag tag-success">
                          {result.condition_label}
                        </span>
                      </li>
                      <li>
                        Condition adjustment{" "}
                        <strong className="up">
                          +{money(result.condition_adjustment)}
                        </strong>
                      </li>
                    </ul>
                  </div>
                  <p className="fine-print">
                    Estimate only. The condition adjustment is based on the
                    photos you uploaded and does not account for renovations,
                    defects not shown, or market timing.
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
