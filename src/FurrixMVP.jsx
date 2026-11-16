import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "./lib/supabase.mjs";
import { useAuth } from "./hooks/useAuth.ts";
import { useMyPet } from "./hooks/useMyPet.ts";
import { validatePhotoFile } from "./services/petPhotos.ts";

// ═══════════════════════════════════════════════════════════════════════════
// FURRIX — MVP (banc d'essai temporaire : l'interface cible reste Furrix.jsx)
// 8 fonctionnalités seulement : auth, profil animal, swipe, matching, liste
// de matchs, chat texte, filtre espèce+rayon, géoloc approximative (ville).
// Tout le reste (véto, assurance, marketplace, communauté, événements,
// PawPoints, Premium, push, boost, vérif, vidéo, IA) est volontairement
// absent — voir Furrix_Scoping_MVP.md pour la justification produit.
// ═══════════════════════════════════════════════════════════════════════════

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────
const T = {
  coral: "#1F7A5C", coralBg: "#E8F3EE",
  navy: "#1E2420", navyL: "#2C342E",
  cream: "#FAF8F4", warm: "#F3F0EA",
  white: "#FFFFFF",
  rose: "#C0564A",
  g1: "#F4F2ED", g2: "#E6E2DA", g3: "#76726A", g4: "#4A463F",
  line: "#E6E2DA",
};

const SP = [
  { id: "all", l: "Tous" },
  { id: "chien", l: "Chiens" },
  { id: "chat", l: "Chats" },
  { id: "lapin", l: "Lapins" },
  { id: "oiseau", l: "Oiseaux" },
  { id: "reptile", l: "Reptiles" },
  { id: "rongeur", l: "Rongeurs" },
  { id: "cheval", l: "Chevaux" },
];

const PURPOSE = [
  { id: "reproduction", l: "Reproduction" },
  { id: "balade", l: "Balade" },
  { id: "social", l: "Socialisation" },
];

// ─── DONNÉES DE DÉMO (à remplacer par Supabase) ────────────────────────────
const DEMO_ANIMALS = [
  { id: 1, name: "Luna", sp: "chien", br: "Golden Retriever", age: "2 ans", gn: "♀", city: "Lille", dist: 1.2, bi: "Adore les longues balades en forêt.", purpose: "balade", c: "#C8924E", ph: "https://images.unsplash.com/photo-1552053831-71594a27632d?w=600&h=700&fit=crop" },
  { id: 2, name: "Rocky", sp: "chien", br: "Labrador Noir", age: "3 ans", gn: "♂", city: "Lille", dist: 2.5, bi: "Champion de rapport de balle.", purpose: "social", c: "#5E7A9E", ph: "https://images.unsplash.com/photo-1605897472359-85e4b94d685d?w=600&h=700&fit=crop" },
  { id: 3, name: "Mimi", sp: "chat", br: "British Shorthair", age: "1 an", gn: "♀", city: "Roubaix", dist: 8.1, bi: "Câline mais indépendante.", purpose: "reproduction", c: "#8B72A8", ph: "https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=600&h=700&fit=crop" },
  { id: 4, name: "Simba", sp: "chat", br: "Maine Coon", age: "4 ans", gn: "♂", city: "Tourcoing", dist: 11.4, bi: "Gros nounours, calme et affectueux.", purpose: "reproduction", c: "#C98A6E", ph: "https://images.unsplash.com/photo-1533743983669-94fa5c4338ec?w=600&h=700&fit=crop" },
  { id: 5, name: "Caramel", sp: "lapin", br: "Bélier Français", age: "1 an", gn: "♀", city: "Villeneuve-d'Ascq", dist: 6.3, bi: "Curieuse et très sociable.", purpose: "social", c: "#C77A52", ph: "https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?w=600&h=700&fit=crop" },
  { id: 6, name: "Oscar", sp: "chien", br: "Beagle", age: "5 ans", gn: "♂", city: "Lille", dist: 3.7, bi: "Nez increvable, toujours partant.", purpose: "balade", c: "#4E9E78", ph: "https://images.unsplash.com/photo-1505628346881-b72b27e84530?w=600&h=700&fit=crop" },
  { id: 7, name: "Cannelle", sp: "chat", br: "Européen roux", age: "2 ans", gn: "♀", city: "Lambersart", dist: 4.9, bi: "Joueuse, aime les plumeaux.", purpose: "social", c: "#B57A44", ph: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=700&fit=crop" },
  { id: 8, name: "Zeus", sp: "chien", br: "Berger Australien", age: "1 an", gn: "♂", city: "Marcq-en-Barœul", dist: 5.5, bi: "Très énergique, sportif dans l'âme.", purpose: "reproduction", c: "#6B6B70", ph: "https://images.unsplash.com/photo-1568572933382-74d440642117?w=600&h=700&fit=crop" },
];

// ─── ICÔNES SVG (stroke, style Lucide) ─────────────────────────────────────
const Ic = ({ d, s = 18, sw = 1.8, fill = "none", c = "currentColor" }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{d}</svg>
);
const ICON = {
  discover: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  heart: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  messages: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />,
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  camera: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" /><circle cx="12" cy="13" r="4" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
};

// ─── ILLUSTRATIONS ANIMALES (fallback si pas de photo) ─────────────────────
const PAWS = {
  chien: <><path d="M30 38c-7 0-13-5-13-13 0-3 1-6 2-8-2-4-2-9-1-12 4 1 7 4 9 7 2-1 4-1 6-1s4 0 6 1c2-3 5-6 9-7 1 3 1 8-1 12 1 2 2 5 2 8 0 8-6 13-13 13z" fill="currentColor" opacity="0.12" /><circle cx="25" cy="30" r="1.8" fill="currentColor" /><circle cx="35" cy="30" r="1.8" fill="currentColor" /><path d="M30 34c-1.5 0-2.5 1-2.5 2M30 34c1.5 0 2.5 1 2.5 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></>,
  chat: <><path d="M18 18c2-4 4-6 5-6s2 4 2 7c2-1 3-1 5-1s3 0 5 1c0-3 1-7 2-7s3 2 5 6c2 3 3 7 3 11 0 8-7 13-15 13s-15-5-15-13c0-4 1-8 3-11z" fill="currentColor" opacity="0.12" /><circle cx="25" cy="29" r="1.6" fill="currentColor" /><circle cx="35" cy="29" r="1.6" fill="currentColor" /></>,
  lapin: <><ellipse cx="23" cy="16" rx="3" ry="9" fill="currentColor" opacity="0.12" /><ellipse cx="37" cy="16" rx="3" ry="9" fill="currentColor" opacity="0.12" /><circle cx="30" cy="34" r="11" fill="currentColor" opacity="0.12" /><circle cx="26" cy="32" r="1.6" fill="currentColor" /><circle cx="34" cy="32" r="1.6" fill="currentColor" /></>,
  oiseau: <><path d="M30 16c8 0 14 6 14 14 0 7-5 13-14 13s-14-6-14-13c0-8 6-14 14-14z" fill="currentColor" opacity="0.12" /><circle cx="27" cy="28" r="1.8" fill="currentColor" /></>,
  reptile: <><ellipse cx="30" cy="32" rx="14" ry="10" fill="currentColor" opacity="0.12" /><circle cx="24" cy="30" r="1.6" fill="currentColor" /><circle cx="36" cy="30" r="1.6" fill="currentColor" /></>,
  rongeur: <><circle cx="30" cy="34" r="11" fill="currentColor" opacity="0.12" /><circle cx="26" cy="33" r="1.5" fill="currentColor" /><circle cx="34" cy="33" r="1.5" fill="currentColor" /></>,
  cheval: <><path d="M22 14c-3 2-5 6-5 11l-2 14c0 5 6 8 15 8s15-3 15-8l-2-14c0-5-2-9-5-11-2 3-4 5-8 5s-6-2-8-5z" fill="currentColor" opacity="0.12" /><circle cx="25" cy="32" r="1.6" fill="currentColor" /><circle cx="35" cy="32" r="1.6" fill="currentColor" /></>,
};
const PetPhoto = ({ animal, size = 48, round = true }) =>
  animal && animal.ph ? (
    <img src={animal.ph} alt={animal.name || ""} style={{ width: size, height: size, objectFit: "cover", borderRadius: round ? "50%" : 12, flexShrink: 0, background: (animal.c || "#ccc") + "22" }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: round ? "50%" : 12, background: (animal ? animal.c : "#888") + "1A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size * 0.7} height={size * 0.7} viewBox="8 8 44 40" style={{ color: animal ? animal.c : "#888" }}>{PAWS[animal ? animal.sp : "chien"] || PAWS.chien}</svg>
    </div>
  );

// ─── HELPERS DESIGN ─────────────────────────────────────────────────────────
const btn = (bg = T.coral, full = false, sm = false) => ({ background: bg, color: T.white, border: "1px solid transparent", borderRadius: 8, padding: sm ? "8px 16px" : full ? "13px" : "10px 20px", fontWeight: 600, fontSize: sm ? 13 : 14, cursor: "pointer", fontFamily: "'Inter',sans-serif", width: full ? "100%" : "auto" });
const gh = (c = T.navy) => ({ ...btn(T.white, false, false), border: `1px solid ${T.line}`, color: c });
const cd = (mb = 10) => ({ background: T.white, borderRadius: 10, padding: 14, border: `1px solid ${T.line}`, marginBottom: mb });

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{display:none}
  body,#root{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pop{0%{transform:scale(0.94);opacity:0}100%{transform:scale(1);opacity:1}}
  .fade{animation:fadeUp 0.25s ease both}.pop{animation:pop 0.2s ease both}
  input,textarea,select{font-family:'Inter',sans-serif}
  input:focus,textarea:focus{outline:none;border-color:${T.coral}!important;box-shadow:0 0 0 3px rgba(31,122,92,0.12)}
  button{font-family:'Inter',sans-serif;transition:transform 0.12s,opacity 0.12s}
  button:active{transform:scale(0.97);opacity:0.9}
`;

// ─── ÉCRANS D'ATTENTE / ERREUR (même habillage que l'écran d'auth) ───────────
const Splash = ({ text, children }) => (
  <div style={{ minHeight: "100vh", background: T.navy, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 28, textAlign: "center" }}>
    <style>{CSS}</style>
    <div style={{ width: 60, height: 60, borderRadius: 16, background: "linear-gradient(135deg,#1F7A5C,#2E9E72)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
      <svg width="34" height="34" viewBox="8 8 44 40" style={{ color: "white" }}>{PAWS.chien}</svg>
    </div>
    <p role="status" style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, marginBottom: children ? 18 : 0 }}>{text}</p>
    {children}
  </div>
);
const FieldErr = ({ msg, dark = false }) => msg ? <div role="alert" style={{ color: dark ? "#F2A69C" : T.rose, fontSize: 12, fontWeight: 500, marginTop: 4 }}>{msg}</div> : null;

// ─── MOTEUR DE MATCHING (simplifié : espèce + purpose + distance) ──────────
function computeScore(myPet, candidate) {
  if (!myPet.species) return 50;
  let score = 0;
  score += myPet.species === candidate.sp ? 45 : 0;
  score += myPet.purpose === candidate.purpose ? 30 : 10;
  const distScore = Math.max(0, 25 - candidate.dist * 2);
  score += distScore;
  return Math.min(99, Math.round(score));
}
function buildPool(animals, myPet, filt) {
  return animals
    .filter(a => filt.species === "all" || a.sp === filt.species)
    .filter(a => a.dist <= filt.radius)
    .map(a => ({ ...a, co: computeScore(myPet, a) }))
    .sort((a, b) => b.co - a.co);
}

// ─── APP ─────────────────────────────────────────────────────────────────
export default function FurrixMVP() {
  // Auth : Supabase si configuré (VITE_SUPABASE_*), sinon mode démonstration local.
  const live = isSupabaseConfigured;
  const auth = useAuth(supabase);
  const [demoUser, setDemoUser] = useState(null);
  const user = live ? auth.user : demoUser;
  const [authMode, setAuthMode] = useState("signup");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });

  // Profil animal (création + édition, un animal par compte dans le MVP)
  const petStore = useMyPet(supabase, live && auth.user ? auth.user.id : null);
  const [demoPet, setDemoPet] = useState(null);
  const myPet = live ? (petStore.pet ? { ...petStore.pet, ph: petStore.photoUrl } : null) : demoPet;
  const EMPTY_PET = { name: "", species: "chien", breed: "", age: "", gender: "♂", city: "", bio: "", purpose: "balade" };
  const [petForm, setPetForm] = useState(EMPTY_PET);
  const [editingPet, setEditingPet] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const photoInput = useRef(null);
  const [demoErrors, setDemoErrors] = useState({});
  const petErrors = live ? petStore.fieldErrors : demoErrors;
  const saving = live && petStore.saving;

  // Navigation (3 sections seulement)
  const [tab, setTab] = useState("discover");

  // Swipe
  const [filt, setFilt] = useState({ species: "all", radius: 15 });
  const [passedIds, setPassedIds] = useState([]);
  const [ci, setCi] = useState(0);
  const [matches, setMatches] = useState([]);
  const [showMatch, setShowMatch] = useState(null);
  const cardRef = useRef(null);
  const dragging = useRef(false);
  const start = useRef({ x: 0, y: 0 });

  const pool = useMemo(() => buildPool(DEMO_ANIMALS, myPet || {}, filt).filter(a => !passedIds.includes(a.id)), [filt, passedIds, myPet]);
  const current = pool[ci] || null;

  // Chat
  const [chatWith, setChatWith] = useState(null);
  const [chatMsgs, setChatMsgs] = useState({});
  const [msgInput, setMsgInput] = useState("");

  const [toast, setToast] = useState(null);
  const sT = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  // ── Auth handlers ──
  const handleAuth = async () => {
    if (!live) {
      if (!authForm.email || !authForm.password) { sT("Remplis les deux champs"); return; }
      setDemoUser({ email: authForm.email });
      return;
    }
    if (auth.pending) return;
    const ok = await auth.submit(authMode, authForm);
    if (ok) setAuthForm(f => ({ ...f, password: "" }));
  };
  const switchAuthMode = (mode) => { setAuthMode(mode); auth.clearMessages(); };

  const handleLogout = async () => {
    if (live) {
      const ok = await auth.signOut();
      if (!ok) { sT(auth.error || "Déconnexion impossible, réessaie."); return; }
    } else { setDemoUser(null); setDemoPet(null); }
    setTab("discover"); setEditingPet(false); setPetForm(EMPTY_PET); setPhoto(null);
    setAuthForm({ email: "", password: "" }); setMatches([]); setChatWith(null); setPassedIds([]);
  };

  // ── Photo du profil animal ──
  const setPhoto = (file) => {
    setPhotoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return file ? URL.createObjectURL(file) : null; });
    setPhotoFile(file);
  };
  const onPickPhoto = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const problem = validatePhotoFile(file);
    if (problem) { sT(problem); return; }
    setPhoto(file);
  };

  // ── Création / édition du profil animal ──
  const startEditPet = () => {
    setPetForm({ name: myPet.name || "", species: myPet.species || "chien", breed: myPet.breed || "", age: myPet.age || "", gender: myPet.gender || "♂", city: myPet.city || "", bio: myPet.bio || "", purpose: myPet.purpose || "balade" });
    setPhoto(null);
    setEditingPet(true);
  };
  const cancelEditPet = () => { setEditingPet(false); setPhoto(null); setDemoErrors({}); };
  const handleSavePet = async () => {
    const wasEditing = editingPet;
    if (!live) {
      const errs = {};
      if (!petForm.name.trim()) errs.name = "Le nom est requis";
      if (!petForm.breed.trim()) errs.breed = "La race est requise";
      if (!petForm.city.trim()) errs.city = "La ville est requise";
      setDemoErrors(errs);
      if (Object.keys(errs).length) return;
      setDemoPet({ ...petForm, ph: photoPreview || (demoPet && demoPet.ph) || null });
      setPhotoFile(null); setPhotoPreview(null); setEditingPet(false);
      sT(wasEditing ? "Profil mis à jour" : "Profil créé !");
      return;
    }
    if (saving) return;
    const r = await petStore.save(petForm, photoFile);
    if (!r.ok) return;
    setPhoto(null);
    setEditingPet(false);
    sT(r.warning || (wasEditing ? "Profil mis à jour" : "Profil créé !"));
  };

  // ── Swipe engine ──
  const setCardTf = (x, rot, ov) => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = `translate(${x}px,0) rotate(${rot}deg)`;
    const likeEl = cardRef.current.querySelector('[data-ov="like"]');
    const nopeEl = cardRef.current.querySelector('[data-ov="nope"]');
    if (likeEl) likeEl.style.opacity = ov > 0 ? Math.min(ov / 80, 1) : 0;
    if (nopeEl) nopeEl.style.opacity = ov < 0 ? Math.min(-ov / 80, 1) : 0;
  };
  const snapBack = () => { if (cardRef.current) { cardRef.current.style.transition = "transform 0.25s ease"; setCardTf(0, 0, 0); setTimeout(() => { if (cardRef.current) cardRef.current.style.transition = ""; }, 250); } };
  const commitSwipe = (dir) => {
    if (!current) return;
    if (dir === "right") {
      // like réciproque simulé (dans le vrai produit : RPC swipe_and_match)
      const isMatch = Math.random() > 0.4;
      if (isMatch) {
        setMatches(m => [...m, current]);
        setChatMsgs(c => ({ ...c, [current.id]: [] }));
        setShowMatch(current);
      } else sT(`Like envoyé à ${current.name}`);
    }
    setPassedIds(p => [...p, current.id]);
    setCi(0);
  };
  const flyOut = (dir) => {
    if (!cardRef.current || !current) return;
    const x = dir === "right" ? 500 : -500;
    cardRef.current.style.transition = "transform 0.3s ease";
    setCardTf(x, dir === "right" ? 20 : -20, dir === "right" ? 999 : -999);
    setTimeout(() => { commitSwipe(dir); if (cardRef.current) cardRef.current.style.transition = ""; }, 280);
  };
  const onDown = (e) => { dragging.current = true; start.current = { x: e.clientX ?? e.touches[0].clientX, y: 0 }; };
  const onMove = (e) => {
    if (!dragging.current) return;
    const x = (e.clientX ?? e.touches[0].clientX) - start.current.x;
    setCardTf(x, x / 20, x);
  };
  const onUp = (e) => {
    if (!dragging.current) return;
    dragging.current = false;
    const x = (e.clientX ?? (e.changedTouches && e.changedTouches[0].clientX)) - start.current.x;
    if (x > 100) flyOut("right"); else if (x < -100) flyOut("left"); else snapBack();
  };

  // ── Chat ──
  const sendMsg = () => {
    if (!msgInput.trim() || !chatWith) return;
    setChatMsgs(c => ({ ...c, [chatWith.id]: [...(c[chatWith.id] || []), { from: "me", text: msgInput, t: Date.now() }] }));
    setMsgInput("");
    // Réponse simulée (démo — à remplacer par Supabase Realtime)
    setTimeout(() => {
      setChatMsgs(c => ({ ...c, [chatWith.id]: [...(c[chatWith.id] || []), { from: "them", text: "Avec plaisir, on se dit où et quand ? 🐾", t: Date.now() }] }));
    }, 1200);
  };

  // ══════════════════════════ RENDER ══════════════════════════

  // ── Restauration de session ──
  if (live && auth.status === "loading") return <Splash text="Chargement…" />;

  // ── Écran 1 : Auth ──
  if (!user) {
    return (
      <div style={{ minHeight: "100vh", background: T.navy, display: "flex", flexDirection: "column", justifyContent: "center", padding: 28 }}>
        <style>{CSS}</style>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: "linear-gradient(135deg,#1F7A5C,#2E9E72)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="34" height="34" viewBox="8 8 44 40" style={{ color: "white" }}>{PAWS.chien}</svg>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "white", letterSpacing: "-0.02em" }}>Furrix</div>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, marginTop: 6 }}>Trouve un compagnon pour ton animal</p>
        </div>
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 22, border: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 18, background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: 3 }}>
            <button onClick={() => switchAuthMode("signup")} style={{ flex: 1, padding: 9, borderRadius: 6, border: "none", background: authMode === "signup" ? T.coral : "transparent", color: "white", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Inscription</button>
            <button onClick={() => switchAuthMode("login")} style={{ flex: 1, padding: 9, borderRadius: 6, border: "none", background: authMode === "login" ? T.coral : "transparent", color: "white", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Connexion</button>
          </div>
          <input value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} placeholder="Email" type="email" autoComplete="email" aria-invalid={!!auth.fieldErrors.email} style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "2px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "13px 16px", fontSize: 14, color: "white", marginBottom: auth.fieldErrors.email ? 0 : 10 }} />
          <div style={{ marginBottom: auth.fieldErrors.email ? 10 : 0 }}><FieldErr msg={auth.fieldErrors.email} dark /></div>
          <input value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} placeholder="Mot de passe" type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} onKeyDown={e => e.key === "Enter" && handleAuth()} aria-invalid={!!auth.fieldErrors.password} style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "2px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "13px 16px", fontSize: 14, color: "white", marginBottom: auth.fieldErrors.password ? 0 : 16 }} />
          <div style={{ marginBottom: auth.fieldErrors.password ? 16 : 0 }}><FieldErr msg={auth.fieldErrors.password} dark /></div>
          {auth.error && <div role="alert" style={{ color: "#F2A69C", fontSize: 13, marginBottom: 12 }}>{auth.error}</div>}
          {auth.notice && <div role="status" style={{ color: "#9FD8BF", fontSize: 13, marginBottom: 12 }}>{auth.notice}</div>}
          <button onClick={handleAuth} disabled={auth.pending} style={{ ...btn(T.coral, true), opacity: auth.pending ? 0.6 : 1, cursor: auth.pending ? "wait" : "pointer" }}>{auth.pending ? "Patiente…" : authMode === "signup" ? "Créer mon compte" : "Se connecter"}</button>
          {!live && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11.5, textAlign: "center", marginTop: 12 }}>Mode démonstration : aucune donnée n'est envoyée.</div>}
        </div>
        {toast && <div style={{ position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)", background: T.navy, color: "white", padding: "11px 20px", borderRadius: 50, fontSize: 13, fontWeight: 600, boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }}>{toast}</div>}
      </div>
    );
  }

  // ── Chargement / erreur du profil animal ──
  if (live && (petStore.status === "idle" || petStore.status === "loading")) return <Splash text="Chargement du profil…" />;
  if (live && petStore.status === "error") {
    return (
      <Splash text={petStore.error || "Impossible de charger le profil."}>
        <button onClick={petStore.reload} style={{ ...btn(T.coral), marginBottom: 10 }}>Réessayer</button>
        <button onClick={handleLogout} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>Se déconnecter</button>
      </Splash>
    );
  }

  // ── Écran 2 : Création / édition du profil animal (un seul écran, pas d'étapes) ──
  if (!myPet || editingPet) {
    const shownPhoto = photoPreview || (myPet && myPet.ph);
    return (
      <div style={{ minHeight: "100vh", background: T.cream, padding: "40px 22px" }}>
        <style>{CSS}</style>
        <div style={{ fontSize: 26, fontWeight: 700, color: T.navy, marginBottom: 4 }}>{editingPet ? "Modifier le profil" : "Le profil de ton animal"}</div>
        <p style={{ color: T.g3, fontSize: 14, marginBottom: 22 }}>Juste l'essentiel pour commencer à matcher.</p>

        <div style={{ ...cd(14), display: "flex", flexDirection: "column", alignItems: "center" }}>
          <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickPhoto} style={{ display: "none" }} />
          <div role="button" tabIndex={0} aria-label="Choisir une photo" onClick={() => photoInput.current && photoInput.current.click()} onKeyDown={e => (e.key === "Enter" || e.key === " ") && photoInput.current && photoInput.current.click()} style={{ width: 84, height: 84, borderRadius: "50%", background: T.g1, display: "flex", alignItems: "center", justifyContent: "center", border: `2px dashed ${T.g2}`, cursor: "pointer", overflow: "hidden" }}>
            {shownPhoto ? <img src={shownPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Ic d={ICON.camera} s={26} c={T.g3} />}
          </div>
          <div style={{ fontSize: 11, color: T.g3, marginTop: 6 }}>JPEG, PNG ou WebP · 5 Mo max</div>
        </div>

        <div style={cd(10)}>
          <label style={{ fontSize: 11, fontWeight: 600, color: T.g3, letterSpacing: "0.05em" }}>NOM</label>
          <input value={petForm.name} onChange={e => setPetForm({ ...petForm, name: e.target.value })} placeholder="Luna, Max, Rio..." maxLength={50} style={{ width: "100%", border: "none", fontSize: 15, fontWeight: 600, color: T.navy, marginTop: 4 }} />
          <FieldErr msg={petErrors.name} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div style={cd(0)}>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.g3, letterSpacing: "0.05em" }}>ESPÈCE</label>
            <select value={petForm.species} onChange={e => setPetForm({ ...petForm, species: e.target.value })} style={{ width: "100%", border: "none", fontSize: 14, fontWeight: 600, color: T.navy, marginTop: 4, background: "none" }}>
              {SP.filter(s => s.id !== "all").map(s => <option key={s.id} value={s.id}>{s.l}</option>)}
            </select>
          </div>
          <div style={cd(0)}>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.g3, letterSpacing: "0.05em" }}>SEXE</label>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {["♂", "♀"].map(g => <button key={g} onClick={() => setPetForm({ ...petForm, gender: g })} style={{ flex: 1, padding: 7, borderRadius: 6, border: `1.5px solid ${petForm.gender === g ? T.coral : T.line}`, background: petForm.gender === g ? T.coralBg : "white", fontSize: 16, cursor: "pointer" }}>{g}</button>)}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div style={cd(0)}>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.g3, letterSpacing: "0.05em" }}>RACE</label>
            <input value={petForm.breed} onChange={e => setPetForm({ ...petForm, breed: e.target.value })} placeholder="Labrador..." maxLength={60} style={{ width: "100%", border: "none", fontSize: 14, fontWeight: 600, color: T.navy, marginTop: 4 }} />
          <FieldErr msg={petErrors.breed} />
          </div>
          <div style={cd(0)}>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.g3, letterSpacing: "0.05em" }}>ÂGE</label>
            <input value={petForm.age} onChange={e => setPetForm({ ...petForm, age: e.target.value })} placeholder="2 ans" maxLength={30} style={{ width: "100%", border: "none", fontSize: 14, fontWeight: 600, color: T.navy, marginTop: 4 }} />
          <FieldErr msg={petErrors.age} />
          </div>
        </div>

        <div style={cd(10)}>
          <label style={{ fontSize: 11, fontWeight: 600, color: T.g3, letterSpacing: "0.05em" }}>VILLE</label>
          <input value={petForm.city} onChange={e => setPetForm({ ...petForm, city: e.target.value })} placeholder="Lille..." maxLength={80} style={{ width: "100%", border: "none", fontSize: 14, fontWeight: 600, color: T.navy, marginTop: 4 }} />
          <FieldErr msg={petErrors.city} />
        </div>

        <div style={cd(10)}>
          <label style={{ fontSize: 11, fontWeight: 600, color: T.g3, letterSpacing: "0.05em" }}>TU CHERCHES</label>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {PURPOSE.map(p => <button key={p.id} onClick={() => setPetForm({ ...petForm, purpose: p.id })} style={{ flex: 1, padding: "8px 4px", borderRadius: 6, border: `1.5px solid ${petForm.purpose === p.id ? T.coral : T.line}`, background: petForm.purpose === p.id ? T.coralBg : "white", fontSize: 11.5, fontWeight: 600, color: petForm.purpose === p.id ? T.coral : T.g4, cursor: "pointer" }}>{p.l}</button>)}
          </div>
        </div>

        <div style={cd(18)}>
          <label style={{ fontSize: 11, fontWeight: 600, color: T.g3, letterSpacing: "0.05em" }}>BIO (courte)</label>
          <textarea value={petForm.bio} onChange={e => setPetForm({ ...petForm, bio: e.target.value })} placeholder="Décris ton compagnon en une phrase..." rows={2} maxLength={500} style={{ width: "100%", border: "none", fontSize: 13, color: T.navy, marginTop: 4, resize: "none" }} />
          <FieldErr msg={petErrors.bio} />
        </div>

        {live && petStore.error && <div role="alert" style={{ color: T.rose, fontSize: 13, marginBottom: 12 }}>{petStore.error}</div>}
        <button onClick={handleSavePet} disabled={saving} style={{ ...btn(T.coral, true), opacity: saving ? 0.6 : 1, cursor: saving ? "wait" : "pointer" }}>{saving ? "Enregistrement…" : editingPet ? "Enregistrer" : "Commencer à matcher"}</button>
        {editingPet && <button onClick={cancelEditPet} disabled={saving} style={{ ...gh(), width: "100%", marginTop: 10 }}>Annuler</button>}
        {toast && <div style={{ position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)", background: T.navy, color: "white", padding: "11px 20px", borderRadius: 50, fontSize: 13, fontWeight: 600 }}>{toast}</div>}
      </div>
    );
  }

  // ── App principale (3 sections : Découvrir / Matchs / Moi) ──
  return (
    <div style={{ minHeight: "100vh", background: T.cream, paddingBottom: 70 }}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={{ background: "white", padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.line}`, position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#1F7A5C,#2E9E72)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="8 8 44 40" style={{ color: "white" }}>{PAWS.chien}</svg>
          </div>
          <div style={{ fontWeight: 700, fontSize: 18, color: T.navy, letterSpacing: "-0.02em" }}>Furrix</div>
        </div>
        <div style={{ fontSize: 12, color: T.g3, display: "flex", alignItems: "center", gap: 4 }}><Ic d={ICON.pin} s={13} />{myPet.city}</div>
      </div>

      {/* ── Découvrir ── */}
      {tab === "discover" && (
        <div className="fade" style={{ padding: "14px 16px" }}>
          {/* Filtre espèce + rayon (fonctionnalité 7) */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 10 }}>
            {SP.map(s => (
              <button key={s.id} onClick={() => { setFilt(f => ({ ...f, species: s.id })); setCi(0); setPassedIds([]); }} style={{ background: filt.species === s.id ? "linear-gradient(135deg,#1F7A5C,#2E9E72)" : "white", color: filt.species === s.id ? "white" : T.g4, border: `1px solid ${filt.species === s.id ? "transparent" : T.line}`, borderRadius: 8, padding: "6px 13px", fontWeight: 500, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{s.l}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, background: "white", borderRadius: 8, padding: "8px 12px", border: `1px solid ${T.line}` }}>
            <Ic d={ICON.pin} s={14} c={T.g3} />
            <span style={{ fontSize: 12, color: T.g4, flexShrink: 0 }}>Rayon : {filt.radius} km</span>
            <input type="range" min={2} max={30} value={filt.radius} onChange={e => { setFilt(f => ({ ...f, radius: +e.target.value })); setCi(0); setPassedIds([]); }} style={{ flex: 1, accentColor: T.coral }} />
          </div>

          {/* Carte de swipe */}
          {current ? (
            <div style={{ position: "relative", height: 480 }}>
              <div ref={cardRef} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
                style={{ position: "absolute", inset: 0, background: "white", borderRadius: 16, overflow: "hidden", border: `1px solid ${T.line}`, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", cursor: "grab", userSelect: "none" }}>
                <div style={{ height: 300, position: "relative", background: `linear-gradient(155deg,${current.c}22,${current.c}44)` }}>
                  <img src={current.ph} alt={current.name} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <div data-ov="like" style={{ position: "absolute", top: 20, left: 20, opacity: 0, border: "3px solid #2E9E72", color: "#2E9E72", fontWeight: 700, fontSize: 22, padding: "4px 14px", borderRadius: 8, transform: "rotate(-12deg)", background: "rgba(255,255,255,0.9)" }}>LIKE</div>
                  <div data-ov="nope" style={{ position: "absolute", top: 20, right: 20, opacity: 0, border: "3px solid #C0564A", color: "#C0564A", fontWeight: 700, fontSize: 22, padding: "4px 14px", borderRadius: 8, transform: "rotate(12deg)", background: "rgba(255,255,255,0.9)" }}>PASS</div>
                  <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,0.92)", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: T.coral }}>{current.co}% compatible</div>
                </div>
                <div style={{ padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 21, fontWeight: 700, color: T.navy }}>{current.name}</span>
                    <span style={{ fontSize: 14, color: T.g3 }}>{current.gn}</span>
                    <span style={{ fontSize: 13, color: T.g3 }}>· {current.age}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: T.g3, marginTop: 2 }}>{current.br} · {current.city} ({current.dist} km)</div>
                  <p style={{ fontSize: 13, color: T.g4, marginTop: 8, lineHeight: 1.5 }}>{current.bi}</p>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "70px 20px" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><PetPhoto animal={{ sp: filt.species === "all" ? "chien" : filt.species, c: T.coral }} size={64} /></div>
              <div style={{ fontWeight: 700, fontSize: 16, color: T.navy, marginBottom: 6 }}>Plus personne à proximité</div>
              <p style={{ fontSize: 13, color: T.g3, marginBottom: 16 }}>Élargis le rayon ou reviens plus tard.</p>
              <button onClick={() => setFilt(f => ({ ...f, radius: 30 }))} style={btn(T.coral, false, true)}>Élargir à 30 km</button>
            </div>
          )}

          {current && (
            <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 16 }}>
              <button onClick={() => flyOut("left")} aria-label="Passer" style={{ width: 54, height: 54, borderRadius: "50%", background: "white", border: `1px solid ${T.line}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.g4, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}><Ic d={ICON.close} s={22} /></button>
              <button onClick={() => flyOut("right")} aria-label="Aimer" style={{ width: 54, height: 54, borderRadius: "50%", background: T.coral, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white", boxShadow: "0 4px 14px rgba(31,122,92,0.35)" }}><Ic d={ICON.heart} s={22} fill="white" c="white" /></button>
            </div>
          )}
        </div>
      )}

      {/* ── Matchs (liste + chat) ── */}
      {tab === "matches" && !chatWith && (
        <div className="fade" style={{ padding: "18px 16px" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.navy, marginBottom: 14 }}>Mes matchs</div>
          {matches.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><PetPhoto animal={{ sp: "chat", c: "#8B72A8" }} size={56} /></div>
              <div style={{ fontWeight: 700, fontSize: 16, color: T.navy, marginBottom: 6 }}>Pas encore de match</div>
              <p style={{ fontSize: 13, color: T.g3, marginBottom: 16 }}>Swipe pour trouver un compagnon !</p>
              <button onClick={() => setTab("discover")} style={btn(T.coral)}>Découvrir</button>
            </div>
          ) : matches.map(m => (
            <div key={m.id} onClick={() => setChatWith(m)} style={{ ...cd(8), display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }}>
              <PetPhoto animal={m} size={50} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: T.navy }}>{m.name}</div>
                <div style={{ fontSize: 12, color: T.g3 }}>{(chatMsgs[m.id] || []).length ? (chatMsgs[m.id][chatMsgs[m.id].length - 1].text) : "Dites bonjour !"}</div>
              </div>
              <Ic d={ICON.messages} s={16} c={T.g3} />
            </div>
          ))}
        </div>
      )}

      {/* ── Chat ── */}
      {tab === "matches" && chatWith && (
        <div className="fade" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 60px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${T.line}`, background: "white" }}>
            <button onClick={() => setChatWith(null)} aria-label="Retour" style={{ background: "none", border: "none", cursor: "pointer", color: T.navy }}><Ic d={ICON.close} s={18} /></button>
            <PetPhoto animal={chatWith} size={36} />
            <div style={{ fontWeight: 600, fontSize: 15, color: T.navy }}>{chatWith.name}</div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {(chatMsgs[chatWith.id] || []).length === 0 && (
              <div style={{ textAlign: "center", color: T.g3, fontSize: 13, marginTop: 30 }}>Vous avez matché avec {chatWith.name} ! Dites bonjour 👋</div>
            )}
            {(chatMsgs[chatWith.id] || []).map((m, i) => (
              <div key={i} style={{ alignSelf: m.from === "me" ? "flex-end" : "flex-start", background: m.from === "me" ? T.coral : "white", color: m.from === "me" ? "white" : T.navy, padding: "9px 14px", borderRadius: 14, fontSize: 14, maxWidth: "75%", border: m.from === "me" ? "none" : `1px solid ${T.line}` }}>{m.text}</div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${T.line}`, background: "white" }}>
            <input value={msgInput} onChange={e => setMsgInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMsg()} placeholder="Écrire un message..." style={{ flex: 1, border: `1px solid ${T.line}`, borderRadius: 20, padding: "10px 16px", fontSize: 14 }} />
            <button onClick={sendMsg} aria-label="Envoyer" style={{ width: 40, height: 40, borderRadius: "50%", background: T.coral, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Ic d={ICON.send} s={17} c="white" /></button>
          </div>
        </div>
      )}

      {/* ── Moi (profil minimal) ── */}
      {tab === "me" && (
        <div className="fade" style={{ padding: "18px 16px" }}>
          <div style={{ ...cd(14), textAlign: "center", padding: 22 }}>
            <PetPhoto animal={{ ...myPet, sp: myPet.species, c: T.coral }} size={72} round />
            <div style={{ fontWeight: 700, fontSize: 19, color: T.navy, marginTop: 10 }}>{myPet.name}</div>
            <div style={{ fontSize: 13, color: T.g3 }}>{myPet.breed} · {myPet.age} · {myPet.city}</div>
          </div>
          <div style={cd(10)}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.g3, letterSpacing: "0.05em", marginBottom: 4 }}>BIO</div>
            <div style={{ fontSize: 14, color: T.navy }}>{myPet.bio || "—"}</div>
          </div>
          <div style={cd(18)}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.g3, letterSpacing: "0.05em", marginBottom: 4 }}>RECHERCHE</div>
            <div style={{ fontSize: 14, color: T.navy }}>{PURPOSE.find(p => p.id === myPet.purpose)?.l}</div>
          </div>
          <button onClick={startEditPet} style={{ ...gh(), width: "100%", marginBottom: 10 }}>Modifier le profil</button>
          <button onClick={handleLogout} disabled={live && auth.pending} style={{ ...gh(T.rose), width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Ic d={ICON.logout} s={16} />Se déconnecter</button>
        </div>
      )}

      {/* Bottom nav — 3 sections seulement */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: `1px solid ${T.line}`, display: "flex", padding: "8px 0 max(8px,env(safe-area-inset-bottom))", zIndex: 100 }}>
        {[
          { id: "discover", ic: "discover", l: "Découvrir" },
          { id: "matches", ic: "messages", l: "Matchs", badge: matches.length },
          { id: "me", ic: "user", l: "Moi" },
        ].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setChatWith(null); }} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 1px", position: "relative" }}>
            <div style={{ color: tab === t.id ? T.coral : T.g3 }}><Ic d={ICON[t.ic]} s={21} /></div>
            <div style={{ fontSize: 10, fontWeight: tab === t.id ? 600 : 500, color: tab === t.id ? T.coral : T.g3 }}>{t.l}</div>
            {t.badge > 0 && <div style={{ position: "absolute", top: 0, right: "calc(50% - 20px)", background: T.coral, color: "white", minWidth: 15, height: 15, padding: "0 3px", borderRadius: 8, fontSize: 9, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{t.badge}</div>}
          </button>
        ))}
      </div>

      {/* Modale de match */}
      {showMatch && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(28,28,30,0.5)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setShowMatch(null)}>
          <div className="pop" style={{ background: "white", borderRadius: 16, padding: "32px 28px", textAlign: "center", maxWidth: 320 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.coral, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>Nouveau match !</div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <PetPhoto animal={{ ...myPet, sp: myPet.species, c: T.coral }} size={68} />
              <Ic d={ICON.heart} s={22} c={T.rose} fill={T.rose} />
              <PetPhoto animal={showMatch} size={68} />
            </div>
            <p style={{ fontSize: 14, color: T.g3, marginBottom: 18 }}><strong style={{ color: T.navy }}>{myPet.name}</strong> et <strong style={{ color: T.navy }}>{showMatch.name}</strong> se plaisent !</p>
            <button onClick={() => { setChatWith(showMatch); setTab("matches"); setShowMatch(null); }} style={btn(T.coral, true)}>Envoyer un message</button>
            <button onClick={() => setShowMatch(null)} style={{ ...gh(T.g4), width: "100%", marginTop: 8 }}>Continuer à swiper</button>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", bottom: 78, left: "50%", transform: "translateX(-50%)", background: T.navy, color: "white", padding: "10px 18px", borderRadius: 50, fontSize: 13, fontWeight: 600, zIndex: 600 }}>{toast}</div>}
    </div>
  );
}
