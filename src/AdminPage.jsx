import React, { useState, useEffect, useCallback, useRef } from "react";
import { Lock, CheckCircle2, XCircle, Trash2, Plus, Loader2, Image, ShieldCheck } from "lucide-react";
import { supabase } from "./supabaseClient";
import { FALLBACK_NUTRIENTS } from "./data";

const ADMIN_CODE = import.meta.env.VITE_ADMIN_CODE;
const SESSION_KEY = "stack-check-admin-unlocked";

function emptyNewRow() {
  return { nutrientId: FALLBACK_NUTRIENTS[0].id, amount: "" };
}

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");

  const [nutrients, setNutrients] = useState(FALLBACK_NUTRIENTS);
  const [brands, setBrands] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const [newLabel, setNewLabel] = useState("");
  const [newRows, setNewRows] = useState([emptyNewRow()]);
  const [newPhotoFile, setNewPhotoFile] = useState(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const photoInputRef = useRef(null);

  const nutrientMeta = (id) => nutrients.find((n) => n.id === id);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [{ data: nutRows }, { data: brandRows, error: brandErr }, { data: itemRows }] = await Promise.all([
      supabase.from("nutrients").select("*"),
      supabase.rpc("admin_list_brands"),
      supabase.rpc("admin_list_brand_items"),
    ]);
    if (nutRows?.length) setNutrients(nutRows);
    if (!brandErr) setBrands(brandRows || []);
    setItems(itemRows || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (unlocked) load();
  }, [unlocked, load]);

  function checkCode(e) {
    e.preventDefault();
    if (!ADMIN_CODE) {
      setCodeError("VITE_ADMIN_CODE isn't set — add it to your environment variables first.");
      return;
    }
    if (codeInput === ADMIN_CODE) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setUnlocked(true);
    } else {
      setCodeError("That code doesn't match.");
    }
  }

  async function setStatus(id, status) {
    setBusyId(id);
    await supabase.rpc("admin_set_brand_status", { p_id: id, p_status: status });
    await load();
    setBusyId(null);
  }

  async function deleteBrand(id) {
    if (!confirm("Delete this brand and its ingredient data? This can't be undone.")) return;
    setBusyId(id);
    await supabase.rpc("admin_delete_brand", { p_id: id });
    await load();
    setBusyId(null);
  }

  function updateNewRow(idx, patch) {
    setNewRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addNewRow() {
    setNewRows((rows) => [...rows, emptyNewRow()]);
  }
  function removeNewRow(idx) {
    setNewRows((rows) => rows.filter((_, i) => i !== idx));
  }
  function pickPhoto(file) {
    setNewPhotoFile(file);
    setNewPhotoPreview(URL.createObjectURL(file));
  }

  async function saveNewBrand() {
    const validRows = newRows.filter((r) => r.nutrientId && parseFloat(r.amount) > 0);
    if (!newLabel.trim() || validRows.length === 0) {
      setSaveError("Add a name and at least one ingredient amount.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const brandId = crypto.randomUUID();
      let photoPath = null;
      if (newPhotoFile) {
        photoPath = `admin/${brandId}.jpg`;
        const { error: upErr } = await supabase.storage.from("brand-photos").upload(photoPath, newPhotoFile);
        if (upErr) throw upErr;
      }
      const { error } = await supabase.rpc("admin_add_brand", {
        p_id: brandId,
        p_label: newLabel.trim(),
        p_photo_path: photoPath,
        p_items: validRows.map((r) => ({ nutrientId: r.nutrientId, amount: parseFloat(r.amount) })),
      });
      if (error) throw error;
      setNewLabel("");
      setNewRows([emptyNewRow()]);
      setNewPhotoFile(null);
      setNewPhotoPreview(null);
      await load();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function photoUrl(path) {
    if (!path || !supabase) return null;
    return supabase.storage.from("brand-photos").getPublicUrl(path).data.publicUrl;
  }

  const styles = {
    page: { background: "#1C2321", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#F4EFE1", padding: "40px 20px 96px" },
    wrap: { maxWidth: 880, margin: "0 auto" },
    card: { background: "#F4EFE1", borderRadius: 10, padding: 18, color: "#1C2321" },
    label: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 1.5, color: "#8A8478" },
    input: { background: "#fff", border: "1px solid rgba(28,35,33,0.15)", borderRadius: 6, padding: "8px 10px", fontSize: 14, color: "#1C2321" },
    btn: { display: "flex", alignItems: "center", gap: 6, border: "none", borderRadius: 6, padding: "8px 12px", fontSize: 13, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace" },
  };

  if (!supabase) {
    return (
      <div style={styles.page}>
        <div style={styles.wrap}>
          <p>Supabase isn't configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment first.</p>
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div style={{ ...styles.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <form onSubmit={checkCode} style={{ ...styles.card, width: 320, textAlign: "center" }}>
          <Lock size={22} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Admin access</div>
          <input
            type="password"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="Passcode"
            style={{ ...styles.input, width: "100%", boxSizing: "border-box", marginBottom: 10 }}
            autoFocus
          />
          <button type="submit" style={{ ...styles.btn, background: "#1C2321", color: "#F4EFE1", width: "100%", justifyContent: "center" }}>
            Unlock
          </button>
          {codeError && <div style={{ color: "#C1543C", fontSize: 12, marginTop: 8 }}>{codeError}</div>}
        </form>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <ShieldCheck size={16} color="#E8A33D" />
          <span style={styles.label}>ADMIN — BRAND CATALOG</span>
        </div>
        <h1 style={{ fontFamily: "'Zilla Slab', serif", fontSize: 32, marginBottom: 24 }}>Manage brands</h1>

        {/* Add new brand */}
        <div style={{ ...styles.card, marginBottom: 32 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Add a brand directly (goes in as approved)</div>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder='e.g. "Our Kirkland Multivitamin"'
            style={{ ...styles.input, width: "100%", boxSizing: "border-box", marginBottom: 10 }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            {newRows.map((row, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select value={row.nutrientId} onChange={(e) => updateNewRow(idx, { nutrientId: e.target.value })} style={{ ...styles.input, flex: 1, minWidth: 140 }}>
                  {nutrients.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
                <input type="number" min="0" value={row.amount} onChange={(e) => updateNewRow(idx, { amount: e.target.value })} placeholder="0" style={{ ...styles.input, width: 80 }} />
                <span style={{ fontSize: 12, color: "#8A8478", width: 30 }}>{nutrientMeta(row.nutrientId)?.unit}</span>
                {newRows.length > 1 && (
                  <button onClick={() => removeNewRow(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8478" }}>
                    <XCircle size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={addNewRow} style={{ ...styles.btn, background: "none", color: "#1C2321", opacity: 0.75 }}>
              <Plus size={14} /> Add ingredient
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPhoto(f); e.target.value = ""; }} />
            <button onClick={() => photoInputRef.current?.click()} style={{ ...styles.btn, background: "#fff", border: "1px solid rgba(28,35,33,0.15)" }}>
              <Image size={14} /> {newPhotoFile ? "Photo selected" : "Add photo (optional)"}
            </button>
            {newPhotoPreview && <img src={newPhotoPreview} alt="" style={{ width: 32, height: 32, borderRadius: 5, objectFit: "cover" }} />}
            <button onClick={saveNewBrand} disabled={saving} style={{ ...styles.btn, background: "#1C2321", color: "#F4EFE1", marginLeft: "auto" }}>
              {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Save brand
            </button>
          </div>
          {saveError && <div style={{ color: "#C1543C", fontSize: 12, marginTop: 8 }}>{saveError}</div>}
        </div>

        {/* Brand list */}
        {loading ? (
          <Loader2 size={22} className="spin" color="#E8A33D" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {brands.map((b) => {
              const brandItems = items.filter((it) => it.brand_id === b.id);
              const isPending = b.status === "pending";
              const url = photoUrl(b.photo_path);
              return (
                <div key={b.id} style={{ ...styles.card, borderLeft: `5px solid ${isPending ? "#E8A33D" : "#7A9B76"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 12 }}>
                      {url && <img src={url} alt="" style={{ width: 56, height: 56, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />}
                      <div>
                        <div style={{ fontFamily: "'Zilla Slab', serif", fontWeight: 700, fontSize: 16 }}>{b.label}</div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: isPending ? "#8A6B3D" : "#5C7A58", letterSpacing: 0.5 }}>
                          {isPending ? "PENDING REVIEW" : "APPROVED"}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {isPending && (
                        <button onClick={() => setStatus(b.id, "approved")} disabled={busyId === b.id} style={{ ...styles.btn, background: "#7A9B76", color: "#fff" }}>
                          <CheckCircle2 size={14} /> Approve
                        </button>
                      )}
                      {!isPending && (
                        <button onClick={() => setStatus(b.id, "pending")} disabled={busyId === b.id} style={{ ...styles.btn, background: "#fff", border: "1px solid rgba(28,35,33,0.15)" }}>
                          Unpublish
                        </button>
                      )}
                      <button onClick={() => deleteBrand(b.id)} disabled={busyId === b.id} style={{ ...styles.btn, background: "#fff", border: "1px solid rgba(193,84,60,0.4)", color: "#C1543C" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {brandItems.map((it) => (
                      <span key={it.id} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, background: "rgba(28,35,33,0.06)", borderRadius: 5, padding: "3px 8px" }}>
                        {nutrientMeta(it.nutrient_id)?.name || it.nutrient_id}: {it.amount}{nutrientMeta(it.nutrient_id)?.unit}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            {brands.length === 0 && <p style={{ color: "#A9AFA6" }}>No brands yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
