import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Plus, X, AlertTriangle, CheckCircle2, Trash2, Pill, Camera, Search, Loader2, Info, Cloud, CloudOff, Image, Send, History } from "lucide-react";
import { supabase } from "./supabaseClient";
import { TIMING, FALLBACK_NUTRIENTS, FALLBACK_BRANDS, FALLBACK_INTERACTIONS } from "./data";
import { addSearchHistory, getRecentSearches } from "./history";

const CAP_COLORS = ["#E8A33D", "#7A9B76", "#C1543C", "#6E8FA6", "#B57EDC"];
let capIndex = 0;
const nextCap = () => CAP_COLORS[capIndex++ % CAP_COLORS.length];
let uid = 0;
const newId = () => `id-${uid++}`;

function emptyRow(defaultNutrientId) {
  return { id: newId(), nutrientId: defaultNutrientId, amount: "" };
}
function emptySupplement(defaultNutrientId) {
  return {
    id: newId(),
    name: "",
    cap: nextCap(),
    rows: [emptyRow(defaultNutrientId)],
    brandQuery: "",
    ocr: { status: "idle", text: "" },
    submission: { status: "idle", photoFile: null, photoPreview: null },
  };
}

let tesseractLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractLoading) return tesseractLoading;
  tesseractLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.4/tesseract.min.js";
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error("Could not load the scanner right now."));
    document.head.appendChild(script);
    setTimeout(() => reject(new Error("Scanner took too long to load.")), 15000);
  });
  return tesseractLoading;
}

export default function App() {
  const [nutrients, setNutrients] = useState(FALLBACK_NUTRIENTS);
  const [brands, setBrands] = useState(FALLBACK_BRANDS);
  const [interactions, setInteractions] = useState(FALLBACK_INTERACTIONS);
  const [dataSource, setDataSource] = useState("local"); // 'local' | 'supabase'
  const [syncStatus, setSyncStatus] = useState(supabase ? "connecting" : "offline"); // connecting | synced | offline | error
  const [userId, setUserId] = useState(null);
  const [supplements, setSupplements] = useState(() => [emptySupplement(FALLBACK_NUTRIENTS[0].id)]);
  const [loaded, setLoaded] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const fileInputRefs = useRef({});
  const photoInputRefs = useRef({});
  const saveTimer = useRef(null);

  const refreshHistory = useCallback(() => {
    getRecentSearches(8).then(setRecentSearches);
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const nutrientMeta = useCallback((id) => nutrients.find((n) => n.id === id), [nutrients]);

  // ---- Load reference data + user's saved stack from Supabase on mount ----
  useEffect(() => {
    if (!supabase) {
      setLoaded(true);
      return;
    }
    (async () => {
      try {
        const [{ data: nutRows, error: nutErr }, { data: brandRows }, { data: itemRows }, { data: interRows }] =
          await Promise.all([
            supabase.from("nutrients").select("*"),
            supabase.from("brands").select("*"),
            supabase.from("brand_items").select("*"),
            supabase.from("interactions").select("*"),
          ]);

        if (nutErr) throw nutErr;

        if (nutRows?.length) {
          setNutrients(nutRows);
          const brandsWithItems = (brandRows || []).map((b) => ({
            id: b.id,
            label: b.label,
            status: b.status || "approved",
            items: (itemRows || []).filter((it) => it.brand_id === b.id).map((it) => ({ nutrientId: it.nutrient_id, amount: it.amount })),
          }));
          setBrands(brandsWithItems);
          setInteractions((interRows || []).map((i) => ({ pair: [i.nutrient_a, i.nutrient_b], type: i.type, note: i.note })));
          setDataSource("supabase");
        }

        // Anonymous auth so we have a stable user id to save stacks against
        let { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const { data, error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
          session = data.session;
        }
        setUserId(session.user.id);

        const { data: stackRow } = await supabase
          .from("user_stacks")
          .select("data")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (stackRow?.data?.length) {
          setSupplements(
            stackRow.data.map((sup) => ({
              ...sup,
              id: newId(),
              rows: sup.rows.map((r) => ({ ...r, id: newId() })),
              ocr: { status: "idle", text: "" },
              submission: { status: "idle", photoFile: null, photoPreview: null },
            }))
          );
        }
        setSyncStatus("synced");
      } catch (err) {
        console.error("Supabase load failed, using local data:", err);
        setSyncStatus("error");
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // ---- Debounced save of the current stack whenever it changes ----
  useEffect(() => {
    if (!supabase || !userId || !loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const payload = supplements.map(({ name, cap, rows }) => ({
        name,
        cap,
        rows: rows.map(({ nutrientId, amount }) => ({ nutrientId, amount })),
      }));
      const { error } = await supabase.from("user_stacks").upsert({ user_id: userId, data: payload, updated_at: new Date().toISOString() });
      setSyncStatus(error ? "error" : "synced");
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [supplements, userId, loaded]);

  function updateSupplement(id, patch) {
    setSupplements((s) => s.map((sup) => (sup.id === id ? { ...sup, ...patch } : sup)));
  }
  function updateRow(supId, rowId, patch) {
    setSupplements((s) => s.map((sup) => (sup.id !== supId ? sup : { ...sup, rows: sup.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) })));
  }
  function addRow(supId) {
    setSupplements((s) => s.map((sup) => (sup.id === supId ? { ...sup, rows: [...sup.rows, emptyRow(nutrients[0].id)] } : sup)));
  }
  function removeRow(supId, rowId) {
    setSupplements((s) => s.map((sup) => (sup.id !== supId ? sup : { ...sup, rows: sup.rows.filter((r) => r.id !== rowId) })));
  }
  function addSupplement() {
    setSupplements((s) => [...s, emptySupplement(nutrients[0].id)]);
  }
  function removeSupplement(id) {
    setSupplements((s) => s.filter((sup) => sup.id !== id));
  }
  function applyBrand(supId, brand) {
    setSupplements((s) =>
      s.map((sup) =>
        sup.id !== supId ? sup : { ...sup, name: brand.label, rows: brand.items.map((it) => ({ id: newId(), nutrientId: it.nutrientId, amount: String(it.amount) })), brandQuery: "" }
      )
    );
    addSearchHistory(brand.label).then(refreshHistory);
  }

  function attachSubmissionPhoto(supId, file) {
    const preview = URL.createObjectURL(file);
    updateSupplement(supId, { submission: { status: "idle", photoFile: file, photoPreview: preview } });
  }

  async function submitAsBrand(supId) {
    const sup = supplements.find((s) => s.id === supId);
    if (!sup) return;
    const validRows = sup.rows.filter((r) => r.nutrientId && parseFloat(r.amount) > 0);
    if (!sup.name.trim() || validRows.length === 0) {
      updateSupplement(supId, { submission: { ...sup.submission, status: "error", error: "Add a name and at least one ingredient amount first." } });
      return;
    }
    if (!supabase || !userId) {
      updateSupplement(supId, { submission: { ...sup.submission, status: "error", error: "Not connected — this needs Supabase to be set up." } });
      return;
    }
    updateSupplement(supId, { submission: { ...sup.submission, status: "submitting" } });
    try {
      const brandId = crypto.randomUUID();
      let photoPath = null;

      if (sup.submission.photoFile) {
        photoPath = `${userId}/${brandId}.jpg`;
        const { error: uploadErr } = await supabase.storage.from("brand-photos").upload(photoPath, sup.submission.photoFile);
        if (uploadErr) throw uploadErr;
      }

      const { error: brandErr } = await supabase
        .from("brands")
        .insert({ id: brandId, label: sup.name.trim(), status: "pending", submitted_by: userId, photo_path: photoPath });
      if (brandErr) throw brandErr;

      const { error: itemsErr } = await supabase
        .from("brand_items")
        .insert(validRows.map((r) => ({ brand_id: brandId, nutrient_id: r.nutrientId, amount: parseFloat(r.amount) })));
      if (itemsErr) throw itemsErr;

      addSearchHistory(sup.name.trim()).then(refreshHistory);
      updateSupplement(supId, { submission: { status: "submitted", photoFile: null, photoPreview: sup.submission.photoPreview } });
    } catch (err) {
      updateSupplement(supId, { submission: { ...sup.submission, status: "error", error: err.message } });
    }
  }

  function parseLabelText(text) {
    const lines = text.split("\n");
    const found = [];
    lines.forEach((line) => {
      const lower = line.toLowerCase();
      for (const n of nutrients) {
        if ((n.synonyms || []).some((s) => lower.includes(s))) {
          const m = line.match(/([\d,.]+)\s*(mcg|mg|g|iu)/i);
          if (m) found.push({ nutrientId: n.id, amount: parseFloat(m[1].replace(/,/g, "")) });
          break;
        }
      }
    });
    return found;
  }

  async function scanLabel(supId, file) {
    updateSupplement(supId, { ocr: { status: "loading", text: "" } });
    try {
      const Tesseract = await loadTesseract();
      const result = await Tesseract.recognize(file, "eng");
      const text = result?.data?.text || "";
      const parsed = parseLabelText(text);
      if (parsed.length === 0) {
        updateSupplement(supId, { ocr: { status: "empty", text } });
        return;
      }
      setSupplements((s) =>
        s.map((sup) => (sup.id !== supId ? sup : { ...sup, rows: parsed.map((p) => ({ id: newId(), nutrientId: p.nutrientId, amount: String(p.amount) })), ocr: { status: "done", text } }))
      );
    } catch (err) {
      updateSupplement(supId, { ocr: { status: "error", text: err.message } });
    }
  }

  const totals = useMemo(() => {
    const map = {};
    supplements.forEach((sup) => {
      const label = sup.name.trim() || "Unnamed bottle";
      sup.rows.forEach((row) => {
        const amt = parseFloat(row.amount);
        if (!row.nutrientId || isNaN(amt) || amt <= 0) return;
        if (!map[row.nutrientId]) map[row.nutrientId] = { total: 0, sources: [] };
        map[row.nutrientId].total += amt;
        map[row.nutrientId].sources.push({ label, amt, cap: sup.cap });
      });
    });
    return map;
  }, [supplements]);

  const activeIds = new Set(Object.keys(totals));
  const flagged = Object.entries(totals).filter(([, v]) => v.sources.length > 1);
  const activeInteractions = interactions.filter((i) => activeIds.has(i.pair[0]) && activeIds.has(i.pair[1]));

  if (!loaded) {
    return (
      <div style={{ background: "#1C2321", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={28} color="#E8A33D" className="spin" />
      </div>
    );
  }

  return (
    <div style={{ background: "#1C2321", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .slab { font-family: 'Zilla Slab', serif; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        input, select { font-family: 'Inter', sans-serif; }
        ::selection { background: #E8A33D; color: #1C2321; }
        .label-card { position: relative; }
        .perforation { border-top: 2px dashed rgba(28,35,33,0.18); }
        input:focus, select:focus { outline: 2px solid #E8A33D; outline-offset: 1px; }
        button:focus-visible { outline: 2px solid #E8A33D; outline-offset: 2px; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "48px 20px 96px" }}>
        {/* Hero */}
        <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="mono" style={{ color: "#E8A33D", fontSize: 12, letterSpacing: 3 }}>RX — SUPPLEMENT STACK</div>
          <div className="mono" title={dataSource === "supabase" ? "Reference data + your stack loaded from Supabase" : "Using built-in data — Supabase not connected"} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: syncStatus === "synced" ? "#7A9B76" : syncStatus === "error" ? "#C1543C" : "#8A8478" }}>
            {syncStatus === "synced" ? <Cloud size={12} /> : <CloudOff size={12} />}
            {syncStatus === "synced" ? "Synced" : syncStatus === "connecting" ? "Connecting…" : syncStatus === "error" ? "Offline (local only)" : "Local only"}
          </div>
        </div>
        <h1 className="slab" style={{ color: "#F4EFE1", fontSize: 42, fontWeight: 700, lineHeight: 1.05, marginBottom: 12 }}>Stack Check</h1>
        <p style={{ color: "#A9AFA6", fontSize: 15, maxWidth: 500, lineHeight: 1.5, marginBottom: 40 }}>
          Read every bottle in your cabinet at once. Search a brand, scan a label, or type it in
          — then see where ingredients overlap or clash before your body finds out for you.
        </p>

        {/* Supplement label cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {supplements.map((sup, idx) => {
            const matches = sup.brandQuery.trim().length > 0
              ? brands.filter((b) => (b.status || "approved") === "approved" && b.label.toLowerCase().includes(sup.brandQuery.toLowerCase())).slice(0, 6)
              : [];
            return (
              <div key={sup.id} className="label-card" style={{ background: "#F4EFE1", borderRadius: 10, padding: "22px 22px 18px", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
                <div style={{ position: "absolute", top: -6, left: 20, right: 20, height: 10, borderRadius: "4px 4px 0 0", background: sup.cap }} />
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <Pill size={16} color={sup.cap} strokeWidth={2.5} />
                  <input value={sup.name} onChange={(e) => updateSupplement(sup.id, { name: e.target.value })} placeholder={`Bottle ${idx + 1} — e.g. "Daily Multivitamin"`} className="slab" style={{ flex: 1, background: "transparent", border: "none", borderBottom: "1px solid rgba(28,35,33,0.2)", fontSize: 18, fontWeight: 700, color: "#1C2321", padding: "4px 2px" }} />
                  {supplements.length > 1 && (
                    <button onClick={() => removeSupplement(sup.id)} aria-label="Remove bottle" style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8478", padding: 4 }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 14, position: "relative" }}>
                  <div style={{ flex: 1, position: "relative" }}>
                    <Search size={13} color="#8A8478" style={{ position: "absolute", left: 10, top: 10 }} />
                    <input value={sup.brandQuery} onChange={(e) => updateSupplement(sup.id, { brandQuery: e.target.value })} placeholder="Search a brand to autofill…" style={{ width: "100%", background: "#fff", border: "1px solid rgba(28,35,33,0.15)", borderRadius: 6, padding: "8px 10px 8px 30px", fontSize: 13, color: "#1C2321" }} />
                    {matches.length > 0 && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid rgba(28,35,33,0.15)", borderRadius: 6, marginTop: 4, zIndex: 10, boxShadow: "0 6px 16px rgba(0,0,0,0.15)" }}>
                        {matches.map((b) => (
                          <button key={b.id} onClick={() => applyBrand(sup.id, b)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: "#1C2321" }}>
                            {b.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input ref={(el) => (fileInputRefs.current[sup.id] = el)} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) scanLabel(sup.id, file); e.target.value = ""; }} />
                  <button onClick={() => fileInputRefs.current[sup.id]?.click()} disabled={sup.ocr.status === "loading"} className="mono" style={{ display: "flex", alignItems: "center", gap: 6, background: "#1C2321", color: "#F4EFE1", border: "none", borderRadius: 6, padding: "0 12px", fontSize: 12, cursor: "pointer" }}>
                    {sup.ocr.status === "loading" ? <Loader2 size={14} className="spin" /> : <Camera size={14} />}
                    Scan
                  </button>
                </div>

                {sup.brandQuery.trim().length === 0 && recentSearches.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14, marginTop: -6 }}>
                    <span className="mono" style={{ fontSize: 10, color: "#8A8478", display: "flex", alignItems: "center", gap: 3 }}>
                      <History size={11} /> RECENT:
                    </span>
                    {recentSearches.map((q) => (
                      <button
                        key={q}
                        onClick={() => updateSupplement(sup.id, { brandQuery: q })}
                        className="mono"
                        style={{ fontSize: 11, background: "rgba(28,35,33,0.06)", border: "none", borderRadius: 5, padding: "3px 8px", color: "#4A4238", cursor: "pointer" }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {sup.ocr.status === "empty" && <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: "#8A6B3D", marginBottom: 12 }}><Info size={13} style={{ marginTop: 1, flexShrink: 0 }} />Scanned the image but couldn't match any known ingredients — try a clearer photo, or enter manually below.</div>}
                {sup.ocr.status === "error" && <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: "#C1543C", marginBottom: 12 }}><AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} />Scan didn't go through ({sup.ocr.text}). You can still enter ingredients manually below.</div>}
                {sup.ocr.status === "done" && <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: "#5C7A58", marginBottom: 12 }}><CheckCircle2 size={13} style={{ marginTop: 1, flexShrink: 0 }} />Filled in from your photo — double-check the amounts against the label.</div>}

                <div className="perforation" style={{ paddingTop: 14 }}>
                  <div className="mono" style={{ fontSize: 11, letterSpacing: 1.5, color: "#8A8478", marginBottom: 8 }}>ACTIVE INGREDIENTS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {sup.rows.map((row) => (
                      <div key={row.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <select value={row.nutrientId} onChange={(e) => updateRow(sup.id, row.id, { nutrientId: e.target.value })} style={{ flex: 1, minWidth: 140, background: "#fff", border: "1px solid rgba(28,35,33,0.15)", borderRadius: 6, padding: "8px 10px", fontSize: 14, color: "#1C2321" }}>
                          {nutrients.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                        </select>
                        <input type="number" min="0" value={row.amount} onChange={(e) => updateRow(sup.id, row.id, { amount: e.target.value })} placeholder="0" className="mono" style={{ width: 76, background: "#fff", border: "1px solid rgba(28,35,33,0.15)", borderRadius: 6, padding: "8px 8px", fontSize: 14, color: "#1C2321" }} />
                        <span className="mono" style={{ fontSize: 12, color: "#8A8478", width: 30 }}>{nutrientMeta(row.nutrientId)?.unit}</span>
                        <span className="mono" title={nutrientMeta(row.nutrientId)?.reason} style={{ fontSize: 10, letterSpacing: 0.3, padding: "4px 7px", borderRadius: 5, color: "#fff", background: TIMING[nutrientMeta(row.nutrientId)?.timing]?.color, whiteSpace: "nowrap" }}>
                          {TIMING[nutrientMeta(row.nutrientId)?.timing]?.label}
                        </span>
                        {sup.rows.length > 1 && <button onClick={() => removeRow(sup.id, row.id)} aria-label="Remove ingredient" style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8478" }}><X size={15} /></button>}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => addRow(sup.id)} style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#1C2321", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: 0.75 }}>
                    <Plus size={14} /> Add ingredient
                  </button>

                  {supabase && (
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px dashed rgba(28,35,33,0.15)" }}>
                      {sup.submission.status === "submitted" ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: "#5C7A58" }}>
                          <CheckCircle2 size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                          Submitted for review — it'll appear in brand search for everyone once approved.
                        </div>
                      ) : (
                        <>
                          <div className="mono" style={{ fontSize: 10, letterSpacing: 1, color: "#8A8478", marginBottom: 8 }}>
                            NOT IN OUR BRAND LIST?
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <input
                              ref={(el) => (photoInputRefs.current[sup.id] = el)}
                              type="file"
                              accept="image/*"
                              capture="environment"
                              style={{ display: "none" }}
                              onChange={(e) => { const file = e.target.files?.[0]; if (file) attachSubmissionPhoto(sup.id, file); e.target.value = ""; }}
                            />
                            <button
                              onClick={() => photoInputRefs.current[sup.id]?.click()}
                              className="mono"
                              style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", color: "#1C2321", border: "1px solid rgba(28,35,33,0.15)", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}
                            >
                              <Image size={13} /> {sup.submission.photoFile ? "Photo attached" : "Add package photo (optional)"}
                            </button>
                            {sup.submission.photoPreview && (
                              <img src={sup.submission.photoPreview} alt="Package preview" style={{ width: 32, height: 32, borderRadius: 5, objectFit: "cover" }} />
                            )}
                            <button
                              onClick={() => submitAsBrand(sup.id)}
                              disabled={sup.submission.status === "submitting"}
                              className="mono"
                              style={{ display: "flex", alignItems: "center", gap: 6, background: "#1C2321", color: "#F4EFE1", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
                            >
                              {sup.submission.status === "submitting" ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
                              Save for others
                            </button>
                          </div>
                          {sup.submission.status === "error" && (
                            <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: "#C1543C", marginTop: 8 }}>
                              <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                              {sup.submission.error}
                            </div>
                          )}
                          <p style={{ fontSize: 11, color: "#8A8478", marginTop: 8, lineHeight: 1.5 }}>
                            Goes into a review queue before it's searchable by anyone else — not added instantly.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={addSupplement} className="slab" style={{ marginTop: 18, width: "100%", padding: "16px", borderRadius: 10, border: "2px dashed rgba(244,239,225,0.25)", background: "transparent", color: "#F4EFE1", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Plus size={18} /> Add another bottle
        </button>

        {/* Overlaps */}
        <div style={{ marginTop: 48 }}>
          <div className="mono" style={{ color: "#E8A33D", fontSize: 12, letterSpacing: 3, marginBottom: 10 }}>LABEL REVIEW</div>
          <h2 className="slab" style={{ color: "#F4EFE1", fontSize: 26, marginBottom: 16 }}>What overlaps</h2>
          {flagged.length === 0 ? (
            <div style={{ background: "rgba(122,155,118,0.12)", border: "1px solid rgba(122,155,118,0.35)", borderRadius: 10, padding: 20, color: "#B9CDB6", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <CheckCircle2 size={18} color="#7A9B76" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 14, lineHeight: 1.6 }}>No overlapping ingredients found across your bottles yet.</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {flagged.map(([nutrientId, data]) => {
                const meta = nutrientMeta(nutrientId);
                const isOver = meta?.ul != null && data.total > meta.ul;
                return (
                  <div key={nutrientId} style={{ background: "#F4EFE1", borderRadius: 10, padding: "16px 20px", borderLeft: `5px solid ${isOver ? "#C1543C" : "#E8A33D"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                      <span className="slab" style={{ fontSize: 17, fontWeight: 700, color: "#1C2321" }}>{meta.name}</span>
                      <span className="mono" style={{ fontSize: 14, color: "#1C2321" }}>{data.total.toLocaleString()} {meta.unit}{meta.ul != null && <span style={{ color: "#8A8478" }}> / {meta.ul.toLocaleString()} UL</span>}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: isOver ? 8 : 0 }}>
                      {data.sources.map((src, i) => (
                        <span key={i} className="mono" style={{ fontSize: 12, background: "rgba(28,35,33,0.06)", borderRadius: 5, padding: "3px 8px", color: "#4A4238", display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: src.cap, display: "inline-block" }} />
                          {src.label}: {src.amt} {meta.unit}
                        </span>
                      ))}
                    </div>
                    {isOver && <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#C1543C", fontSize: 13, fontWeight: 600 }}><AlertTriangle size={14} /> Combined total exceeds the tolerable upper limit</div>}
                  </div>
                );
              })}
            </div>
          )}
          <p style={{ marginTop: 20, fontSize: 12, color: "#6B7168", lineHeight: 1.6, maxWidth: 560 }}>
            Upper limits shown are general adult reference values, not medical guidance. Check with a pharmacist or doctor before changing your stack.
          </p>
        </div>

        {/* Interactions */}
        {activeInteractions.length > 0 && (
          <div style={{ marginTop: 40 }}>
            <div className="mono" style={{ color: "#E8A33D", fontSize: 12, letterSpacing: 3, marginBottom: 10 }}>CROSS-REACTIONS</div>
            <h2 className="slab" style={{ color: "#F4EFE1", fontSize: 26, marginBottom: 16 }}>How they interact</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeInteractions.map((i, idx) => {
                const a = nutrientMeta(i.pair[0]);
                const b = nutrientMeta(i.pair[1]);
                const isHelpful = i.type === "helpful";
                return (
                  <div key={idx} style={{ background: "#F4EFE1", borderRadius: 10, padding: "14px 18px", borderLeft: `5px solid ${isHelpful ? "#7A9B76" : "#C1543C"}` }}>
                    <div className="slab" style={{ fontSize: 15, fontWeight: 700, color: "#1C2321", marginBottom: 4 }}>{a?.name} + {b?.name}</div>
                    <div style={{ fontSize: 13, color: "#4A4238", lineHeight: 1.5 }}>{i.note}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timing guidance */}
        {Object.keys(totals).length > 0 && (
          <div style={{ marginTop: 40 }}>
            <div className="mono" style={{ color: "#E8A33D", fontSize: 12, letterSpacing: 3, marginBottom: 10 }}>DOSING INSTRUCTIONS</div>
            <h2 className="slab" style={{ color: "#F4EFE1", fontSize: 26, marginBottom: 16 }}>When to take each one</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.keys(totals).map((id) => nutrientMeta(id)).filter(Boolean).sort((a, b) => a.timing.localeCompare(b.timing)).map((meta) => (
                <div key={meta.id} style={{ background: "#F4EFE1", borderRadius: 10, padding: "14px 18px", display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span className="mono" style={{ fontSize: 10, letterSpacing: 0.3, padding: "5px 9px", borderRadius: 5, color: "#fff", background: TIMING[meta.timing].color, whiteSpace: "nowrap", flexShrink: 0, marginTop: 2 }}>{TIMING[meta.timing].label}</span>
                  <div>
                    <div className="slab" style={{ fontSize: 15, fontWeight: 700, color: "#1C2321" }}>{meta.name}</div>
                    <div style={{ fontSize: 13, color: "#4A4238", lineHeight: 1.5, marginTop: 2 }}>{meta.reason}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
