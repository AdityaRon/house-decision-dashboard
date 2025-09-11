// app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Share2, Home, DollarSign, MapPin, Clock, Compass, Building2, Baby, Activity, Loader2, Save, Bug, School, Globe
} from "lucide-react";
import {
  Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, Cell, Legend
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

// Parse "123 St, City, ST 12345" → { city: "City", state: "ST" }
function cityStateFromAddress(addr: string) {
  const parts = addr.split(",").map(s => s.trim());
  const city = parts.length >= 2 ? parts[1] : "";
  let state = "";
  if (parts.length >= 3) {
    const tokens = parts[2].trim().split(/\s+/);
    const two = tokens.find(t => /^[A-Z]{2}$/.test(t));
    if (two) state = two;
  }
  return { city, state };
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
    // Address (typed/pasted directly)
    newAddress: "",
    // Defaults
    office1: "", office2: "", daycareAddress: "", badmintonAddress: "",
    // Property details
    livingAreaSqft: "", lotSizeSqft: "", facing: "Unknown",
    // Schools
    assignedSchools: [] as { name: string; rating?: number | null; level?: string; grades?: string; source?: string }[],
    nearbySchools: [] as { level: "Elementary"|"Middle"|"High", name: string, vicinity?: string }[],
  }));

  // Debug
  const [debug, setDebug] = useState(false);
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

  // Chart data — categories, sort descending, show top N + "Other"
  const outflowItems = [
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
  ].filter(x => x.value > 0);
  const sortedOutflows = [...outflowItems].sort((a,b) => b.value - a.value);
  const TOP_N = 7;
  const top = sortedOutflows.slice(0, TOP_N);
  const otherSum = sortedOutflows.slice(TOP_N).reduce((s, x) => s + x.value, 0);
  const displayOutflows = otherSum > 0 ? [...top, { name: "Other", value: otherSum }] : top;

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
    {
      const { data } = await callGoogle("place/findplacefromtext", { input, inputtype: "textquery", fields: "place_id" });
      const pid = data?.candidates?.[0]?.place_id;
      if (pid) return `place_id:${pid}`;
    }
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

  // Property facts (RentCast)
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
      if (!state.livingAreaSqft || !state.lotSizeSqft) fetchPropertyFacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.newAddress]);

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

  // Google Earth opener
  function openGoogleEarth() {
    if (!state.newAddress) return;
    const url = `https://earth.google.com/web/search/${encodeURIComponent(state.newAddress)}`;
    window.open(url, "_blank", "noopener");
  }

  // GreatSchools link builder (search)
  function greatSchoolsLink(schoolName: string) {
    const { city, state: st } = cityStateFromAddress(state.newAddress || "");
    const q = [schoolName, city, st].filter(Boolean).join(" ");
    return `https://www.greatschools.org/search/?searchType=school&q=${encodeURIComponent(q)}`;
  }

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
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <Label>Property address</Label>
                          <div className="flex gap-2">
                            <Input className="flex-1" placeholder="1893 Newbury Park Dr, San Jose, CA 95133" value={state.newAddress} onChange={e=>setState({...state, newAddress: e.target.value})} />
                            <Button type="button" variant="outline" onClick={openGoogleEarth} disabled={!state.newAddress} className="whitespace-nowrap">
                              <Globe className="w-4 h-4 mr-2" /> Open in Google Earth
                            </Button>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">Use Google Earth’s satellite view to estimate the house facing.</p>
                        </div>
                        <div>
                          <Label>Facing direction</Label>
                          <select className="w-full p-2 border rounded-md" value={state.facing} onChange={e=>setState({...state, facing: e.target.value})}>
                            {["N","NE","E","SE","S","SW","W","NW","Unknown"].map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div><Label>Living area (sqft)</Label><Input value={state.livingAreaSqft} onChange={e=>setState({...state, livingAreaSqft: e.target.value})} /></div>
                        <div><Label>Lot size (sqft)</Label><Input value={state.lotSizeSqft} onChange={e=>setState({...state, lotSizeSqft: e.target.value})} /></div>
                        <div className="col-span-2 flex flex-wrap gap-2">
                          <Button type="button" variant="outline" onClick={async ()=>{ if (state.newAddress) await fetchPropertyFacts(); }} disabled={!state.newAddress || loadingProperty}>
                            {loadingProperty ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : null}
                            Property facts (RentCast)
                          </Button>
                        </div>
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

                  {/* Outflows by category (sorted, horizontal, labels on the right) */}
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={displayOutflows}
                        layout="vertical"
                        barSize={18}
                        margin={{ left: 8, right: 24, top: 8, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={(v)=>currency(Number(v))} />
                        <YAxis type="category" dataKey="name" width={120} />
                        <Tooltip formatter={(v)=>currency(Number(v))} />
                        <Bar dataKey="value" radius={[4,4,4,4]}>
                          <LabelList dataKey="value" position="right" formatter={(v:any)=>currency(Number(v))} />
                          {displayOutflows.map((_, i) => (
                            <Cell key={i} fill={palette[i % palette.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Income vs Outflow */}
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={incomeVsOutflowData} barCategoryGap={28}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis tickFormatter={(v)=>currency(Number(v))} />
                        <Tooltip formatter={(v)=>currency(Number(v))} />
                        <Bar dataKey="value" radius={[6,6,0,0]}>
                          {incomeVsOutflowData.map((_, i) => (
                            <Cell key={i} fill={i === 0 ? "#0ea5e9" : "#ef4444"} />
                          ))}
                          <LabelList dataKey="value" position="top" formatter={(v:any)=>currency(Number(v))} />
                        </Bar>
                        <Legend />
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
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-slate-500">Find assigned (beta) & nearby</div>
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

                      {/* Assigned via NCES — each name links to GreatSchools search */}
                      {Array.isArray(state.assignedSchools) && state.assignedSchools.length > 0 && (
                        <>
                          <div className="text-slate-500 mt-2">Assigned (NCES SABS 2015–2016)</div>
                          <ul className="list-disc pl-5 mb-2">
                            {state.assignedSchools.map((s: any, i: number) => (
                              <li key={i}>
                                <span className="font-medium">{s.level || ""}:</span>{" "}
                                <a href={greatSchoolsLink(s.name)} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">
                                  {s.name}
                                </a>
                                {s.grades ? ` — Grades ${s.grades}` : ""}{" "}
                                <span className="text-slate-400">(ratings on GreatSchools)</span>
                              </li>
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
              lastGoogleReq, lastGoogleRes
            }, null, 2)}</pre>
            <div className="text-slate-500 mt-2">Server logs: Vercel → Functions → check /api/google.</div>
          </div>
        )}

        <div className="mt-8 text-xs text-slate-500 leading-relaxed">
          <p><strong>Notes:</strong> Enter the property address directly. Use Google Earth for the facing; use the GreatSchools links to see up-to-date ratings.</p>
        </div>
      </div>
    </div>
  );
}
