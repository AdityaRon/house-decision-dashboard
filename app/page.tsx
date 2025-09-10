// app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Share2, Home, DollarSign, MapPin, Clock, Compass, Building2, Baby, Activity, Loader2, Save, Bug } from "lucide-react";
import { Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const currency = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const num = (v: any, d = 0) => { const n = parseFloat(String(v).replace(/,/g, "")); return isFinite(n) ? n : d; };

function monthlyMortgage({ price, downPct, ratePct, years }: { price: number; downPct: number; ratePct: number; years: number; }) {
  const loan = price * (1 - downPct / 100);
  const r = ratePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return loan / n;
  return (loan * r) / (1 - Math.pow(1 + r, -n));
}

function encodeState(obj: any) { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); }
function decodeState(s: string) { try { return JSON.parse(decodeURIComponent(escape(atob(s)))); } catch { return null; } }

export default function HouseDecisionDashboard() {
  const [state, setState] = useState<any>(() => ({
    newPrice: 1000000, newDownPct: 20, newRatePct: 6.5, newYears: 30,
    newPropTaxMonthly: 900, newHOAMonthly: 0, newInsuranceMonthly: 150,
    existingMortgageMonthly: 3000, existingPropTaxMonthly: 500, existingHOAMonthly: 0, expectedRentMonthly: 3500,
    expCars: 800, expFood: 1200, expDaycare: 1800, expElectricity: 200, expWater: 80, expMisc: 600,
    p1SemiMonthly: 5000, p2SemiMonthly: 4000,
    redfinUrl: "", newAddress: "",
    office1: "", office2: "", daycareAddress: "", badmintonAddress: "",
    livingAreaSqft: "", lotSizeSqft: "", facing: "Unknown",
    assignedSchools: [] as { name: string; rating?: number | null; level?: string }[],
  }));

  // Debug state
  const [debug, setDebug] = useState(false);
  const [lastRedfinReq, setLastRedfinReq] = useState<any>(null);
  const [lastRedfinRes, setLastRedfinRes] = useState<any>(null);
  const [lastGoogleReq, setLastGoogleReq] = useState<any>(null);
  const [lastGoogleRes, setLastGoogleRes] = useState<any>(null);

  // On load: URL state + local defaults
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get("s");
    const decoded = s && decodeState(s);
    if (decoded) setState((prev: any) => ({ ...prev, ...decoded }));
  }, []);
  useEffect(() => {
    const raw = localStorage.getItem("house-dashboard");
    if (raw) { try { setState((prev: any) => ({ ...prev, ...JSON.parse(raw) })); } catch {} }
    const d = localStorage.getItem("house-defaults");
    if (d) {
      try {
        const defs = JSON.parse(d);
        setState((prev: any) => ({
          ...prev,
          office1: prev.office1 || defs.office1 || "",
          office2: prev.office2 || defs.office2 || "",
          daycareAddress: prev.daycareAddress || defs.daycareAddress || "",
          badmintonAddress: prev.badmintonAddress || defs.badmintonAddress || "",
        }));
      } catch {}
    }
  }, []);
  useEffect(() => { localStorage.setItem("house-dashboard", JSON.stringify(state)); }, [state]);

  // Derived numbers
  const newMortgageMonthly = useMemo(() => monthlyMortgage({ price: num(state.newPrice), downPct: num(state.newDownPct), ratePct: num(state.newRatePct), years: num(state.newYears, 30) }), [state.newPrice, state.newDownPct, state.newRatePct, state.newYears]);
  const newHouseCarrying = useMemo(() => newMortgageMonthly + num(state.newPropTaxMonthly) + num(state.newHOAMonthly) + num(state.newInsuranceMonthly), [newMortgageMonthly, state.newPropTaxMonthly, state.newHOAMonthly, state.newInsuranceMonthly]);
  const existingNet = useMemo(() => (num(state.existingMortgageMonthly) + num(state.existingPropTaxMonthly) + num(state.existingHOAMonthly)) - num(state.expectedRentMonthly), [state.existingMortgageMonthly, state.existingPropTaxMonthly, state.existingHOAMonthly, state.expectedRentMonthly]);
  const livingExpenses = useMemo(() => num(state.expCars) + num(state.expFood) + num(state.expDaycare) + num(state.expElectricity) + num(state.expWater) + num(state.expMisc), [state.expCars, state.expFood, state.expDaycare, state.expElectricity, state.expWater, state.expMisc]);
  const existingLoss = Math.max(existingNet, 0);
  const totalExpenses = useMemo(() => newHouseCarrying + livingExpenses + existingLoss, [newHouseCarrying, livingExpenses, existingLoss]);
  const grossIncome = useMemo(() => (num(state.p1SemiMonthly) + num(state.p2SemiMonthly)) * 2, [state.p1SemiMonthly, state.p2SemiMonthly]);
  const remainingIncome = useMemo(() => grossIncome - (livingExpenses + newHouseCarrying + existingNet), [grossIncome, livingExpenses, newHouseCarrying, existingNet]);

  const expenseBreakdown = [
    { name: "New House", value: Math.max(0, Math.round(newHouseCarrying)) },
    ...(existingLoss > 0 ? [{ name: "Existing House Loss", value: Math.round(existingLoss) }] : []),
    { name: "Living Expenses", value: Math.max(0, Math.round(livingExpenses)) },
  ];
  const incomeVsOutflow = [{ name: "Income", value: Math.round(grossIncome) }, { name: "Outflow", value: Math.round(totalExpenses) }];

  // Loading states
  const [distance1, setDistance1] = useState<{ distanceText: string; durationText: string } | null>(null);
  const [distance2, setDistance2] = useState<{ distanceText: string; durationText: string } | null>(null);
  const [kinderCares, setKinderCares] = useState<{ name: string; vicinity: string }[]>([]);
  const [loadingDistances, setLoadingDistances] = useState(false);
  const [loadingRedfin, setLoadingRedfin] = useState(false);
  const [parsingAddress, setParsingAddress] = useState(false);

  // ---------- Google helpers (with debug capture) ----------
  async function callGoogle(path: string, params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString();
    const url = `/api/google?path=${encodeURIComponent(path)}&qs=${encodeURIComponent(qs)}`;
    setLastGoogleReq({ path, params });
    const res = await fetch(url);
    const data = await res.json();
    setLastGoogleRes({ status: res.status, ok: res.ok, data });
    return { res, data };
  }

  async function placeIdFor(input: string): Promise<string | null> {
    if (!input) return null;
    // Find place first (handles fuzzy names)
    {
      const { data } = await callGoogle("place/findplacefromtext", { input, inputtype: "textquery", fields: "place_id" });
      const pid = data?.candidates?.[0]?.place_id;
      if (pid) return `place_id:${pid}`;
    }
    // Fallback: geocode
    {
      const { data } = await callGoogle("geocode", { address: input });
      const pid = data?.results?.[0]?.place_id;
      if (pid) return `place_id:${pid}`;
    }
    return null;
  }

  async function distance(originText: string, destText: string) {
    const origin = await placeIdFor(originText);
    const dest = await placeIdFor(destText);
    if (!origin || !dest) return { distanceText: "-", durationText: "-" };
    const { data } = await callGoogle("distancematrix", {
      units: "imperial", mode: "driving", departure_time: "now",
      origins: origin, destinations: dest,
    });
    const elem = data?.rows?.[0]?.elements?.[0];
    return { distanceText: elem?.distance?.text || "-", durationText: (elem?.duration_in_traffic || elem?.duration)?.text || "-" };
  }

  async function findKinderCare(addressText: string) {
    // We need lat/lng; geocode is enough here
    const { data: g } = await callGoogle("geocode", { address: addressText });
    const loc = g?.results?.[0]?.geometry?.location;
    if (!loc) return [] as any[];
    const { data: n } = await callGoogle("place/nearbysearch", { location: `${loc.lat},${loc.lng}`, radius: "8000", keyword: "KinderCare" });
    return (n?.results || []).map((r: any) => ({ name: r.name, vicinity: r.vicinity }));
  }

  async function handleDistances() {
    if (!state.newAddress) return;
    try {
      setLoadingDistances(true);
      const [d1, d2] = await Promise.all([
        state.office1 ? distance(state.newAddress, state.office1) : Promise.resolve(null),
        state.office2 ? distance(state.newAddress, state.office2) : Promise.resolve(null),
      ]);
      if (d1) setDistance1(d1);
      if (d2) setDistance2(d2);
    } finally { setLoadingDistances(false); }
  }

  async function handleKinderCare() {
    if (!state.newAddress) return;
    try {
      setLoadingDistances(true);
      setKinderCares(await findKinderCare(state.newAddress));
    } finally { setLoadingDistances(false); }
  }

  // -------- Redfin actions with debug capture --------
  async function parseRedfinUrl() {
    if (!state.redfinUrl) return;
    try {
      setParsingAddress(true);
      const url = new URL(state.redfinUrl);
      const parts = url.pathname.split("/").filter(Boolean);
      const homeIdx = parts.findIndex((p) => p === "home");
      if (homeIdx > 0) {
        const addressParts = parts.slice(0, homeIdx).slice(-1)[0];
        const pretty = decodeURIComponent(addressParts.replace(/-/g, " "));
        setState((s: any) => ({ ...s, newAddress: pretty }));
      }
    } finally { setParsingAddress(false); }
  }

  async function fetchRedfinDetails() {
    if (!state.redfinUrl) return;
    setLastRedfinReq({ url: state.redfinUrl });
    try {
      setLoadingRedfin(true);
      const res = await fetch(`/api/redfin?url=${encodeURIComponent(state.redfinUrl)}`);
      const data = await res.json().catch(() => ({}));
      setLastRedfinRes({ status: res.status, ok: res.ok, data });
      if (res.ok && data) {
        setState((s: any) => ({
          ...s,
          newAddress: data.address || s.newAddress,
          lotSizeSqft: data.lotSizeSqft ?? s.lotSizeSqft,
          livingAreaSqft: data.livingAreaSqft ?? s.livingAreaSqft,
          assignedSchools: Array.isArray(data.schools) ? data.schools : s.assignedSchools,
          facing: data.facing || s.facing,
        }));
      } else {
        alert(`Redfin fetch failed: ${data?.error || "unknown error"}`);
      }
    } finally { setLoadingRedfin(false); }
  }

  function copyShareLink() {
    const enc = encodeState(state);
    const u = new URL(window.location.href);
    u.searchParams.set("s", enc);
    navigator.clipboard.writeText(u.toString());
  }

  function saveDefaults() {
    const defs = { office1: state.office1, office2: state.office2, daycareAddress: state.daycareAddress, badmintonAddress: state.badmintonAddress };
    localStorage.setItem("house-defaults", JSON.stringify(defs));
    alert("Defaults saved for Office/Daycare/Badminton.");
  }

  const dirOptions = ["N","NE","E","SE","S","SW","W","NW","Unknown"];

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Home className="w-8 h-8" />
            <h1 className="text-2xl md:text-3xl font-semibold">House Decision Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={debug ? "secondary" : "outline"} onClick={() => setDebug(d => !d)}><Bug className="w-4 h-4 mr-2"/>{debug ? "Debug on" : "Debug off"}</Button>
            <Button onClick={copyShareLink} variant="outline" className="rounded-2xl"><Share2 className="w-4 h-4 mr-2" /> Share</Button>
          </div>
        </div>

        <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
          {/* Inputs (unchanged parts omitted for brevity) */}
          {/* ... keep your current inputs, including Redfin/Parse/Fetch buttons ... */}
          {/* Replace your existing content with the version I sent earlier if needed */}
