// app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Share2, Home, DollarSign, MapPin, Clock, Compass, Building2, Baby, Activity, Loader2, Save, Bug, School
} from "lucide-react";
import {
  Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ComposedChart, LabelList, Cell
} from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const currency = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const num = (v: any, d = 0) => {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return isFinite(n) ? n : d;
};

function monthlyMortgage({
  price, downPct, ratePct, years,
}: { price: number; downPct: number; ratePct: number; years: number }) {
  const loan = price * (1 - downPct / 100);
  const r = ratePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return loan / n;
  return (loan * r) / (1 - Math.pow(1 + r, -n));
}

function encodeState(obj: any) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
}
function decodeState(s: string) {
  try { return JSON.parse(decodeURIComponent(escape(atob(s)))); } catch { return null; }
}

function deriveAddressFromRedfinUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "home");
    if (idx <= 0 || parts.length < 3) return null;
    const state = parts[0]; // e.g., CA
    const city = parts[1]?.replace(/-/g, " "); // e.g., San Jose
    const streetZip = parts[2] || ""; // e.g., 1893-Newbury-Park-Dr-95133
    const tokens = streetZip.split("-");
    if (tokens.length < 2) return null;
    const zipToken = tokens[tokens.length - 1];
    const zip = /^\d{5}$/.test(zipToken) ? zipToken : "";
    const street = (zip ? tokens.slice(0, -1) : tokens).join(" ").trim();
    if (!street || !city || !state) return null;
    return `${street}, ${city}, ${state}${zip ? ` ${zip}` : ""}`;
  } catch { return null; }
}

export default function HouseDecisionDashboard() {
  const [state, setState] = useState<any>(() => ({
    // New house
    newPrice: 1000000, newDownPct: 20, newRatePct: 6.5, newYears: 30,
    newPropTaxMonthly: 900, newHOAMonthly: 0, newInsuranceMonthly: 150,
    // Existing house (to rent)
    existingMortgageMonthly: 3000, existingPropTaxMonthly: 500, existingHOAMonthly: 0, expectedRentMonthly: 3500,
    // Expenses
    expCars: 800, expFood: 1200, expDaycare: 1800, expElectricity: 200, expWater: 80, expMisc: 600,
    // Income (semi-monthly)
    p1SemiMonthly: 5000, p2SemiMonthly: 4000,
    // Addresses
    redfinUrl: "", newAddress: "",
    office1: "", office2: "", daycareAddress: "", badmintonAddress: "",
    // Property details
    livingAreaSqft: "", lotSizeSqft: "", facing: "Unknown",
    // Schools
    assignedSchools: [] as { name: string; rating?: number | null; level?: string; grades?: string; source?: string }[],
    nearbySchools: [] as { level: "Elementary"|"Middle"|"High", name: string, vicinity?: string }[],
  }));

  // Debug
  const [debug, setDebug] = useState(false);
  const [lastRedfinReq, setLastRedfinReq] = useState<any>(null);
  const [lastRedfinRes, setLastRedfinRes] = useState<any>(null);
  const [lastGoogleReq, setLastGoogleReq] = useState<any>(null);
  const [lastGoogleRes, setLastGoogleRes] = useState<any>(null);

  // Load state + defaults
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
  const newMortgageMonthly = useMemo(() =>
    monthlyMortgage({ price: num(state.newPrice), downPct: num(state.newDownPct), ratePct: num(state.newRatePct), years: num(state.newYears, 30) }),
    [state.newPrice, state.newDownPct, state.newRatePct, state.newYears]
  );
  const newHouseCarrying = useMemo(() =>
    newMortgageMonthly + num(state.newPropTaxMonthly) + num(state.newHOAMonthly) + num(state.newInsuranceMonthly),
    [newMortgageMonthly, state.newPropTaxMonthly, state.newHOAMonthly, state.newInsuranceMonthly]
  );
  const existingNet = useMemo(() =>
    (num(state.existingMortgageMonthly) + num(state.existingPropTaxMonthly) + num(state.existingHOAMonthly)) - num(state.expectedRentMonthly),
    [state.existingMortgageMonthly, state.existingPropTaxMonthly, state.existingHOAMonthly, state.expectedRentMonthly]
  );
  const livingExpenses = useMemo(() =>
    num(state.expCars) + num(state.expFood) + num(state.expDaycare) + num(state.expElectricity) + num(state.expWater) + num(state.expMisc),
    [state.expCars, state.expFood, state.expDaycare, state.expElectricity, state.expWater, state.expMisc]
  );
  const existingLoss = Math.max(existingNet, 0);
  const totalExpenses = useMemo(() => newHouseCarrying + livingExpenses + existingLoss, [newHouseCarrying, livingExpenses, existingLoss]);
  const grossIncome = useMemo(() => (num(state.p1SemiMonthly) + num(state.p2SemiMonthly)) * 2, [state.p1SemiMonthly, state.p2SemiMonthly]);
  const remainingIncome = useMemo(() => grossIncome - (livingExpenses + newHouseCarrying + existingNet), [grossIncome, livingExpenses, newHouseCarrying, existingNet]);

  // Ratios (DTI-like)
  const frontEndDTI = useMemo(() => (grossIncome ? (newHouseCarrying / grossIncome) : 0), [newHouseCarrying, grossIncome]);
  const backEndDTI = useMemo(() =>
    (grossIncome ? ((newHouseCarrying + Math.max(existingNet, 0) + num(state.expCars)) / grossIncome) : 0),
    [newHouseCarrying, existingNet, state.expCars, grossIncome]
  );

  // Chart data
  const outflowStack = [
    { name: "Mortgage P&I", value: Math.round(newMortgageMonthly) },
    { name: "Prop Tax", value: Math.round(num(state.newPropTaxMonthly)) },
    { name: "HOA", value: Math.round(num(state.newHOAMonthly)) },
    { name: "Insurance", value: Math.round(num(state.newInsuranceMonthly)) },
    { name: "Existing Loss", value: Math.round(existingLoss) },
    { name: "Cars", value: Math.round(num(state.expCars)) },
    { name: "Food", value: Math.round(num(state.expFood)) },
    { name: "Daycare", value: Math.round(num(state.expDaycare)) },
    { name: "Utilities", value: Math.round(num(state.expElectricity) + num(state.expWater)) },
    { name: "Misc", value: Math.round(num(state.expMisc)) },
  ];

  const outflowKeys = [
    "Mortgage P&I","Prop Tax","HOA","Insurance","Existing Loss","Cars","Food","Daycare","Utilities","Misc"
  ];
  const palette = [
    "#2563eb","#16a34a","#f59e0b","#ef4444","#8b5cf6",
    "#10b981","#06b6d4","#f97316","#84cc16","#64748b"
  ];

  const incomeVsOutflowData = [
    { name: "Income", value: Math.round(grossIncome) },
    { name: "Outflow", value: Math.round(totalExpenses) },
  ];

  // Loading states
  const [distance1, setDistance1] = useState<{ distanceText: string; durationText: string } | null>(null);
  const [distance2, setDistance2] = useState<{ distanceText: string; durationText: string } | null>(null);
  const [kinderCares, setKinderCares] = useState<{ name: string; vicinity: string }[]>([]);
  const [loadingDistances, setLoadingDistances] = useState(false);
  const [loadingRedfin, setLoadingRedfin] = useState(false);
  const [parsingAddress, setParsingAddress] = useState(false);
  const [loadingKinder, setLoadingKinder] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingProperty, setLoadingProperty] = useState(false);

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
    // Find Place (handles fuzzy names)
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

  // KinderCare — Nearby first; fallback to Text Search
  async function findKinderCare(addressText: string) {
    setLoadingKinder(true);
    try {
      const { data: g } = await callGoogle("geocode", { address: addressText });
      const loc = g?.results?.[0]?.geometry?.location;

      let results: any[] = [];
      if (loc) {
        const near = await callGoogle("place/nearbysearch", {
          location: `${loc.lat},${loc.lng}`, radius: "10000", keyword: "KinderCare"
        });
        results = near?.data?.results || [];
      }
      if (!results.length) {
        const text = await callGoogle("place/textsearch", { query: `KinderCare near ${addressText}`, region: "us" });
        results = text?.data?.results || [];
      }
      return results.map((r: any) => ({ name: r.name, vicinity: r.vicinity || r.formatted_address || "" }));
    } finally {
      setLoadingKinder(false);
    }
  }
  async function handleKinderCare() {
    if (!state.newAddress) return;
    setKinderCares(await findKinderCare(state.newAddress));
  }

  // Nearby schools (approx)
  async function findNearbySchools(addressText: string) {
    setLoadingSchools(true);
    try {
      const { data: g } = await callGoogle("geocode", { address: addressText });
      const loc = g?.results?.[0]?.geometry?.location;
      if (!loc) return [] as any[];

      async function closest(keyword: string, level: "Elementary"|"Middle"|"High") {
        const res = await callGoogle("place/nearbysearch", {
          location: `${loc.lat},${loc.lng}`,
          rankby: "distance",
          keyword,
          type: "school"
        });
        const first = res?.data?.results?.[0];
        return first ? { level, name: first.name, vicinity: first.vicinity } : null;
      }

      const [e, m, h] = await Promise.all([
        closest("elementary school", "Elementary"),
        closest("middle school", "Middle"),
        closest("high school", "High"),
      ]);

      return [e, m, h].filter(Boolean) as any[];
    } finally {
      setLoadingSchools(false);
    }
  }

  // Assigned schools (NCES SABS, beta)
  async function fetchAssignedSchools() {
    if (!state.newAddress) return;
    setLoadingSchools(true);
    try {
      const res = await fetch(`/api/schools/assigned?address=${encodeURIComponent(state.newAddress)}`);
      const data = await res.json();
      if (Array.isArray(data?.assigned) && data.assigned.length) {
        setState((s:any) => ({ ...s, assignedSchools: data.assigned }));
      } else {
        alert("No assigned schools from NCES SABS for this address. Showing nearby instead.");
      }
    } finally {
      setLoadingSchools(false);
    }
  }

  // Property fallback (RentCast)
  async function fetchPropertyFacts() {
    if (!state.newAddress) return;
    setLoadingProperty(true);
    try {
      const res = await fetch(`/api/property?address=${encodeURIComponent(state.newAddress)}`);
      const data = await res.json();
      if (data?.livingAreaSqft || data?.lotSizeSqft) {
        setState((s:any) => ({
          ...s,
          livingAreaSqft: data.livingAreaSqft ?? s.livingAreaSqft,
          lotSizeSqft: data.lotSizeSqft ?? s.lotSizeSqft,
        }));
      } else if (data?.error) {
        alert(`Property fallback: ${data.error}`);
      }
    } finally {
      setLoadingProperty(false);
    }
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

  // Auto-run when we have an address
  useEffect(() => {
    if (state.newAddress) {
      handleDistances();
      if (!kinderCares.length) handleKinderCare();
      if (!state.nearbySchools.length) (async () => {
        const s = await findNearbySchools(state.newAddress);
        if (s?.length) setState((prev: any) => ({ ...prev, nearbySchools: s }));
      })();
      // If property fields empty, try fallback
      if (!state.livingAreaSqft || !state.lotSizeSqft) fetchPropertyFacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.newAddress]);

  // -------- Redfin actions with debug capture --------
  async function parseRedfinUrl() {
    if (!state.redfinUrl) return;
    setParsingAddress(true);
    try {
      const pretty = deriveAddressFromRedfinUrl(state.redfinUrl);
      if (pretty) setState((s: any) => ({ ...s, newAddress: pretty }));
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

  // Simple progress bar
  function Progress({ value }: { value: number }) {
    const w = Math.max(0, Math.min(100, Math.round(value * 100)));
    return (
      <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-3 ${w > 36 ? "bg-rose-500" : w > 28 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${w}%` }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Home className="w-8 h-8" />
            <h1 className="text-2xl md:text-3xl font-semibold">House Decision Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={debug ? "secondary" : "outline"} onClick={() => setDebug(d => !d)}>
              <Bug className="w-4 h-4 mr-2"/>{debug ? "Debug on" : "Debug off"}
            </Button>
            <Button onClick={copyShareLink} variant="outline" className="rounded-2xl">
              <Share2 className="w-4 h-4 mr-2" /> Share
            </Button>
          </div>
        </div>

        <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
          {/* Inputs */}
          <Card className="col-span-2 shadow-md rounded-2xl">
            <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5"/>Inputs</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-xl bg-white">
                  <h3 className="font-medium mb-3 flex items-center gap-2"><Building2 className="w-4 h-4"/> New House</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Current home price</Label><Input value={state.newPrice} onChange={e=>setState({...state, newPrice: e.target.value})} /></div>
                    <div><Label>Down payment (%)</Label><Input value={state.newDownPct} onChange={e=>setState({...state, newDownPct: e.target.value})} /></div>
                    <div><Label>Expected rate (%)</Label><Input value={state.newRatePct} onChange={e=>setState({...state, newRatePct: e.target.value})} /></div>
                    <div><Label>Term (years)</Label><Input value={state.newYears} onChange={e=>setState({...state, newYears: e.target.value})} /></div>
                    <div><Label>Property tax (monthly)</Label><Input value={state.newPropTaxMonthly} onChange={e=>setState({...state, newPropTaxMonthly: e.target.value})} /></div>
                    <div><Label>HOA (monthly)</Label><Input value={state.newHOAMonthly} onChange={e=>setState({...state, newHOAMonthly: e.target.value})} /></div>
                    <div><Label>Insurance (monthly)</Label><Input value={state.newInsuranceMonthly} onChange={e=>setState({...state, newInsuranceMonthly: e.target.value})} /></div>
                    <div className="col-span-2">
                      <Separator className="my-2"/>
                      <Label>Redfin link</Label>
                      <div className="flex flex-wrap gap-2">
                        <Input className="min-w-[260px] flex-1" placeholder="https://www.redfin.com/..." value={state.redfinUrl} onChange={e=>setState({...state, redfinUrl: e.target.value})} />
                        <Button type="button" variant="secondary" onClick={parseRedfinUrl} disabled={!state.redfinUrl || parsingAddress}>
                          {parsingAddress ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : null}
                          Parse address
                        </Button>
                        <Button type="button" onClick={fetchRedfinDetails} disabled={!state.redfinUrl || loadingRedfin}>
                          {loadingRedfin ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : null}
                          Fetch details
                        </Button>
                        <Button type="button" variant="outline" onClick={fetchPropertyFacts} disabled={!state.newAddress || loadingProperty}>
                          {loadingProperty ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : null}
                          Property facts (RentCast)
                        </Button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        If the listing blocks us, use “Property facts (RentCast)” to fill living area & lot size.
                      </p>

                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <Label>New house address</Label>
                          <Input placeholder="123 Main St, City, ST" value={state.newAddress} onChange={e=>setState({...state, newAddress: e.target.value})} />
                        </div>
                        <div>
                          <Label>Facing direction</Label>
                          <select className="w-full p-2 border rounded-md" value={state.facing} onChange={e=>setState({...state, facing: e.target.value})}>
                            {["N","NE","E","SE","S","SW","W","NW","Unknown"].map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div><Label>Living area (sqft)</Label><Input value={state.livingAreaSqft} onChange={e=>setState({...state, livingAreaSqft: e.target.value})} /></div>
                        <div><Label>Lot size (sqft)</Label><Input value={state.lotSizeSqft} onChange={e=>setState({...state, lotSizeSqft: e.target.value})} /></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-xl bg-white">
                  <h3 className="font-medium mb-3 flex items-center gap-2"><Home className="w-4 h-4"/> Existing House (to rent)</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Mortgage (monthly)</Label><Input value={state.existingMortgageMonthly} onChange={e=>setState({...state, existingMortgageMonthly: e.target.value})} /></div>
                    <div><Label>Property tax (monthly)</Label><Input value={state.existingPropTaxMonthly} onChange={e=>setState({...state, existingPropTaxMonthly: e.target.value})} /></div>
                    <div><Label>HOA (monthly)</Label><Input value={state.existingHOAMonthly} onChange={e=>setState({...state, existingHOAMonthly: e.target.value})} /></div>
                    <div><Label>Expected rent (monthly)</Label><Input value={state.expectedRentMonthly} onChange={e=>setState({...state, expectedRentMonthly: e.target.value})} /></div>
                    <div className="col-span-2 bg-slate-50 rounded-lg p-2 text-sm">
                      Net from existing = (mortgage + tax + HOA) − rent = <strong className="ml-1">{currency(existingNet)}</strong>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-xl bg-white">
                  <h3 className="font-medium mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4"/> Income</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Partner 1 (semi-monthly)</Label><Input value={state.p1SemiMonthly} onChange={e=>setState({...state, p1SemiMonthly: e.target.value})} /></div>
                    <div><Label>Partner 2 (semi-monthly)</Label><Input value={state.p2SemiMonthly} onChange={e=>setState({...state, p2SemiMonthly: e.target.value})} /></div>
                    <div className="col-span-2 bg-slate-50 rounded-lg p-2 text-sm">
                      Monthly gross income (×2) = <strong className="ml-1">{currency(grossIncome)}</strong>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-xl bg-white">
                  <h3 className="font-medium mb-3 flex items-center gap-2"><Activity className="w-4 h-4"/> Expenses (monthly)</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Cars</Label><Input value={state.expCars} onChange={e=>setState({...state, expCars: e.target.value})} /></div>
                    <div><Label>Food</Label><Input value={state.expFood} onChange={e=>setState({...state, expFood: e.target.value})} /></div>
                    <div><Label>Daycare</Label><Input value={state.expDaycare} onChange={e=>setState({...state, expDaycare: e.target.value})} /></div>
                    <div><Label>Electricity</Label><Input value={state.expElectricity} onChange={e=>setState({...state, expElectricity: e.target.value})} /></div>
                    <div><Label>Water</Label><Input value={state.expWater} onChange={e=>setState({...state, expWater: e.target.value})} /></div>
                    <div><Label>Misc</Label><Input value={state.expMisc} onChange={e=>setState({...state, expMisc: e.target.value})} /></div>
                  </div>
                </div>

                {/* Defaults */}
                <div className="p-4 border rounded-xl bg-white">
                  <h3 className="font-medium mb-3 flex items-center gap-2"><MapPin className="w-4 h-4"/> Defaults (save once)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><Label>Office address 1</Label><Input placeholder="e.g., Google Sunnyvale" value={state.office1} onChange={e=>setState({...state, office1: e.target.value})} /></div>
                    <div><Label>Office address 2</Label><Input placeholder="e.g., Salesforce Tower SF" value={state.office2} onChange={e=>setState({...state, office2: e.target.value})} /></div>
                    <div><Label>Daycare address</Label><Input placeholder="e.g., KinderCare Sunnyvale" value={state.daycareAddress} onChange={e=>setState({...state, daycareAddress: e.target.value})} /></div>
                    <div><Label>Badminton address</Label><Input placeholder="e.g., Bay Badminton" value={state.badmintonAddress} onChange={e=>setState({...state, badmintonAddress: e.target.value})} /></div>
                  </div>
                  <div className="mt-3">
                    <Button onClick={saveDefaults}><Save className="w-4 h-4 mr-2"/> Save these as defaults</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          <div className="flex flex-col gap-6">
            {/* Summary + DTI */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="shadow-md rounded-2xl">
                <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5"/>Summary</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-xl bg-white border">
                      <div className="text-slate-500">Total Income</div>
                      <div className="text-lg font-semibold">{currency(grossIncome)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white border">
                      <div className="text-slate-500">Total Expenses (outflow)</div>
                      <div className="text-lg font-semibold">{currency(totalExpenses)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white border">
                      <div className="text-slate-500">Remaining Income</div>
                      <div className={`text-lg font-semibold ${remainingIncome >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{currency(remainingIncome)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white border">
                      <div className="text-slate-500">New Mortgage (est.)</div>
                      <div className="text-lg font-semibold">{currency(newMortgageMonthly)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white border">
                      <div className="text-slate-500">House Facing</div>
                      <div className="text-lg font-semibold flex items-center gap-2"><Compass className="w-4 h-4"/>{state.facing}</div>
                    </div>
                  </div>

                  {/* DTI gauges */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 rounded-xl bg-white border">
                      <div className="flex items-center justify-between">
                        <div className="text-slate-500">Front-end ratio (PITI / Income)</div>
                        <div className="text-sm font-medium">{pct(frontEndDTI)}</div>
                      </div>
                      <Progress value={frontEndDTI} />
                      <div className="text-xs text-slate-500 mt-1">Guideline: ≤ 28%</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white border">
                      <div className="flex items-center justify-between">
                        <div className="text-slate-500">Back-end ratio (Debts / Income)</div>
                        <div className="text-sm font-medium">{pct(backEndDTI)}</div>
                      </div>
                      <Progress value={backEndDTI} />
                      <div className="text-xs text-slate-500 mt-1">Guideline: ≤ 36%</div>
                    </div>
                  </div>

                  {/* Stacked outflow */}
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={[{ name: "Monthly Outflows", ...Object.fromEntries(outflowStack.map(x => [x.name, x.value])) }]}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(v)=>currency(Number(v))} />
                        <Legend />
                        {outflowKeys.map((k, i) => (
                          <Bar key={k} dataKey={k} stackId="a" fill={palette[i]}>
                            <LabelList dataKey={k} position="top" formatter={(v: any)=> (v ? currency(Number(v)) : "")} />
                          </Bar>
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Income vs Outflow */}
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={incomeVsOutflowData} barCategoryGap={24}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(v)=>currency(Number(v))} />
                        <Legend />
                        <Bar dataKey="value" radius={[6,6,0,0]}>
                          {incomeVsOutflowData.map((_, i) => (
                            <Cell key={i} fill={i === 0 ? "#0ea5e9" : "#ef4444"} />
                          ))}
                          <LabelList dataKey="value" position="top" formatter={(v:any)=>currency(Number(v))} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Commute, Daycare & Schools */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="shadow-md rounded-2xl">
                <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="w-5 h-5"/>Commute, Daycare & Schools</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 gap-2">
                    <div className="p-3 rounded-xl bg-white border flex items-center justify-between">
                      <div className="flex items-center gap-2"><Clock className="w-4 h-4"/>Office 1</div>
                      <div>{distance1 ? `${distance1.distanceText} • ${distance1.durationText}` : (loadingDistances ? "Loading..." : "—")}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white border flex items-center justify-between">
                      <div className="flex items-center gap-2"><Clock className="w-4 h-4"/>Office 2</div>
                      <div>{distance2 ? `${distance2.distanceText} • ${distance2.durationText}` : (loadingDistances ? "Loading..." : "—")}</div>
                    </div>

                    <div className="p-3 rounded-xl bg-white border">
                      <div className="font-medium mb-1 flex items-center gap-2"><Baby className="w-4 h-4"/>KinderCare nearby</div>
                      <div className="flex gap-2 mb-2">
                        <Button onClick={handleKinderCare} disabled={!state.newAddress || loadingKinder} className="h-8 px-2 text-xs">
                          {loadingKinder ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          Refresh
                        </Button>
                      </div>
                      {kinderCares.length ? (
                        <ul className="list-disc pl-5">
                          {kinderCares.map((k, i) => (
                            <li key={i}>{k.name} — <span className="text-slate-600">{k.vicinity}</span></li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-slate-500">No KinderCare found yet.</div>
                      )}
                    </div>

                    <div className="p-3 rounded-xl bg-white border">
                      <div className="font-medium mb-1 flex items-center gap-2"><School className="w-4 h-4"/>Schools</div>

                      {/* Assigned (from listing if present) */}
                      {Array.isArray(state.assignedSchools) && state.assignedSchools.length > 0 && state.assignedSchools[0]?.source !== "NCES SABS 2015–2016" ? (
                        <>
                          <div className="text-slate-500 mb-1">Assigned (from listing)</div>
                          <ul className="list-disc pl-5 mb-2">
                            {state.assignedSchools.map((s: any, i: number) => (
                              <li key={i}>
                                <span className="font-medium">{s.name}</span>
                                {s.level ? ` (${s.level})` : ""}
                                {typeof s.rating === "number" ? ` — ${s.rating}/10` : ""}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}

                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-slate-500">Find official-ish assignment & nearby</div>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={fetchAssignedSchools} disabled={!state.newAddress || loadingSchools} className="h-8 px-2 text-xs">
                            {loadingSchools ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : null}
                            Assigned (beta)
                          </Button>
                          <Button variant="outline" className="h-8 px-2 text-xs" onClick={async () => {
                            const s = await findNearbySchools(state.newAddress);
                            if (s?.length) setState((prev: any) => ({ ...prev, nearbySchools: s }));
                          }} disabled={!state.newAddress || loadingSchools}>
                            {loadingSchools ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : null}
                            Refresh nearby
                          </Button>
                        </div>
                      </div>

                      {/* Assigned from NCES (beta) */}
                      {Array.isArray(state.assignedSchools) && state.assignedSchools.length > 0 && state.assignedSchools[0]?.source === "NCES SABS 2015–2016" && (
                        <>
                          <div className="text-slate-500 mt-2">Assigned (NCES SABS 2015–2016)</div>
                          <ul className="list-disc pl-5 mb-2">
                            {state.assignedSchools.map((s: any, i: number) => (
                              <li key={i}><span className="font-medium">{s.level}:</span> {s.name}{s.grades ? ` — Grades ${s.grades}` : ""}</li>
                            ))}
                          </ul>
                        </>
                      )}

                      {/* Nearby */}
                      {state.nearbySchools?.length ? (
                        <>
                          <div className="text-slate-500">Nearest schools (approx)</div>
                          <ul className="list-disc pl-5 mt-1">
                            {state.nearbySchools.map((s: any, i: number) => (
                              <li key={i}><span className="font-medium">{s.level}:</span> {s.name}{s.vicinity ? ` — ${s.vicinity}` : ""}</li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <div className="text-slate-500">No nearby schools loaded yet.</div>
                      )}

                      <div className="text-xs text-slate-500 mt-1">
                        “Assigned (beta)” uses NCES SABS boundaries; districts change. Verify with the district.
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>

        {debug && (
          <div className="mt-6 p-4 border rounded-xl bg-white text-xs overflow-auto max-h-80">
            <div className="font-semibold mb-2">DEBUG</div>
            <pre className="whitespace-pre-wrap break-words">{JSON.stringify({
              lastRedfinReq, lastRedfinRes, lastGoogleReq, lastGoogleRes
            }, null, 2)}</pre>
            <div className="text-slate-500 mt-2">Server logs: Vercel → Functions → check /api/google and /api/redfin.</div>
          </div>
        )}

        <div className="mt-8 text-xs text-slate-500 leading-relaxed">
          <p><strong>Notes:</strong> When listings block scrapes, we still resolve address and distances. For official assignment and exact property facts, confirm with the district and county records.</p>
        </div>
      </div>
    </div>
  );
}
