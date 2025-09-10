"use client";
import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Share2, Home, DollarSign, MapPin, Clock, Compass, Building2, Baby, Activity, School, Ruler, Square } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
    redfinUrl: "", newAddress: "", office1: "", office2: "", daycareAddress: "", badmintonAddress: "",
    lotSizeSqft: "", livingAreaSqft: "", facing: "Unknown",
    assignedSchools: [] as { name: string; rating?: number | null; level?: string }[],
  }));

  useEffect(() => { const q = new URLSearchParams(window.location.search); const s = q.get("s"); const decoded = s && decodeState(s); if (decoded) setState((prev: any) => ({ ...prev, ...decoded })); }, []);
  useEffect(() => { localStorage.setItem("house-dashboard", JSON.stringify(state)); }, [state]);
  useEffect(() => { const raw = localStorage.getItem("house-dashboard"); if (raw) { try { setState((prev: any) => ({ ...prev, ...JSON.parse(raw) })); } catch {} } }, []);

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

  const [distance1, setDistance1] = useState<{ distanceText: string; durationText: string } | null>(null);
  const [distance2, setDistance2] = useState<{ distanceText: string; durationText: string } | null>(null);
  const [kinderCares, setKinderCares] = useState<{ name: string; vicinity: string }[]>([]);

  async function fetchDistanceMatrix(origin: string, destination: string) {
    const qs = new URLSearchParams({ units: "imperial", origins: origin, destinations: destination }).toString();
    const url = `/api/google?path=distancematrix&qs=${qs}`;
    const res = await fetch(url);
    const data = await res.json();
    const elem = data?.rows?.[0]?.elements?.[0];
    return { distanceText: elem?.distance?.text || "-", durationText: elem?.duration?.text || "-" };
  }

  async function findKinderCare(address: string) {
    const g = await fetch(`/api/google?path=geocode&qs=${new URLSearchParams({ address }).toString()}`);
    const gData = await g.json();
    const loc = gData?.results?.[0]?.geometry?.location;
    if (!loc) return [] as any[];
    const qs = new URLSearchParams({ location: `${loc.lat},${loc.lng}`, radius: String(8000), keyword: "KinderCare" }).toString();
    const n = await fetch(`/api/google?path=place/nearbysearch&qs=${qs}`);
    const nData = await n.json();
    return (nData?.results || []).map((r: any) => ({ name: r.name, vicinity: r.vicinity }));
  }

  async function handleDistances() {
    if (!state.newAddress) return;
    const [d1, d2] = await Promise.all([
      state.office1 ? fetchDistanceMatrix(state.newAddress, state.office1) : Promise.resolve(null),
      state.office2 ? fetchDistanceMatrix(state.newAddress, state.office2) : Promise.resolve(null),
    ]);
    if (d1) setDistance1(d1);
    if (d2) setDistance2(d2);
  }

  async function handleKinderCare() {
    if (!state.newAddress) return;
    setKinderCares(await findKinderCare(state.newAddress));
  }

  function parseRedfinUrlForAddress() {
    if (!state.redfinUrl) return;
    try {
      const url = new URL(state.redfinUrl);
      const parts = url.pathname.split("/").filter(Boolean);
      const homeIdx = parts.findIndex((p) => p === "home");
      if (homeIdx > 0) {
        const addressParts = parts.slice(0, homeIdx).slice(-1)[0];
        const pretty = decodeURIComponent(addressParts.replace(/-/g, " "));
        setState((s: any) => ({ ...s, newAddress: pretty }));
      }
    } catch {}
  }

  async function fetchRedfinDetails() {
    if (!state.redfinUrl) return;
    const res = await fetch(`/api/redfin?url=${encodeURIComponent(state.redfinUrl)}`);
    if (!res.ok) return;
    const data = await res.json();
    setState((s: any) => ({
      ...s,
      newAddress: data.address || s.newAddress,
      lotSizeSqft: data.lotSizeSqft || s.lotSizeSqft,
      livingAreaSqft: data.livingAreaSqft || s.livingAreaSqft,
      facing: data.facing || s.facing,
      assignedSchools: data.schools || s.assignedSchools,
    }));
  }

  function copyShareLink() {
    const enc = encodeState(state);
    const u = new URL(window.location.href);
    u.searchParams.set("s", enc);
    navigator.clipboard.writeText(u.toString());
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
            <Button onClick={copyShareLink} variant="outline" className="rounded-2xl">
              <Share2 className="w-4 h-4 mr-2" /> Share scenario
            </Button>
          </div>
        </div>

        <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5"/>Inputs</CardTitle>
            </CardHeader>
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
                      <div className="flex gap-2">
                        <Input placeholder="https://www.redfin.com/..." value={state.redfinUrl} onChange={e=>setState({...state, redfinUrl: e.target.value})} />
                        <Button type="button" variant="secondary" onClick={parseRedfinUrlForAddress}>Parse address</Button>
                        <Button type="button" onClick={fetchRedfinDetails}>Fetch details</Button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Fetch will attempt to pull address, facing, lot size, living area and assigned schools.</p>
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <div className="col-span-2"><Label>New house address</Label><Input placeholder="123 Main St, City, ST" value={state.newAddress} onChange={e=>setState({...state, newAddress: e.target.value})} /></div>
                        <div><Label>Facing direction</Label><select className="w-full p-2 border rounded-md" value={state.facing} onChange={e=>setState({...state, facing: e.target.value})}>{dirOptions.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                        <div><Label className="flex items-center gap-2"><Square className="w-4 h-4"/> Living area (sqft)</Label><Input value={state.livingAreaSqft} onChange={e=>setState({...state, livingAreaSqft: e.target.value})} /></div>
                        <div><Label className="flex items-center gap-2"><Ruler className="w-4 h-4"/> Lot size (sqft)</Label><Input value={state.lotSizeSqft} onChange={e=>setState({...state, lotSizeSqft: e.target.value})} /></div>
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
                    <div className="col-span-2 bg-slate-50 rounded-lg p-2 text-sm">Net from existing = (mortgage + tax + HOA) − rent = <strong className="ml-1">{currency(existingNet)}</strong></div>
                  </div>
                </div>

                <div className="p-4 border rounded-xl bg-white">
                  <h3 className="font-medium mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4"/> Income</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Partner 1 (semi-monthly)</Label><Input value={state.p1SemiMonthly} onChange={e=>setState({...state, p1SemiMonthly: e.target.value})} /></div>
                    <div><Label>Partner 2 (semi-monthly)</Label><Input value={state.p2SemiMonthly} onChange={e=>setState({...state, p2SemiMonthly: e.target.value})} /></div>
                    <div className="col-span-2 bg-slate-50 rounded-lg p-2 text-sm">Monthly gross income (×2) = <strong className="ml-1">{currency(grossIncome)}</strong></div>
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
                    <div className="col-span-2 bg-slate-50 rounded-lg p-2 text-sm">Total living expenses = <strong className="ml-1">{currency(livingExpenses)}</strong></div>
                  </div>
                </div>
              </div>

              <div className="p-4 border rounded-xl bg-white">
                <h3 className="font-medium mb-3 flex items-center gap-2"><MapPin className="w-4 h-4"/> Locations</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><Label>Office address 1</Label><Input placeholder="Office 1" value={state.office1} onChange={e=>setState({...state, office1: e.target.value})} /></div>
                  <div><Label>Office address 2</Label><Input placeholder="Office 2" value={state.office2} onChange={e=>setState({...state, office2: e.target.value})} /></div>
                  <div><Label>Daycare address (current)</Label><Input placeholder="KinderCare ..." value={state.daycareAddress} onChange={e=>setState({...state, daycareAddress: e.target.value})} /></div>
                  <div><Label>Badminton address</Label><Input placeholder="Gym / courts" value={state.badmintonAddress} onChange={e=>setState({...state, badmintonAddress: e.target.value})} /></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                  <div><Label>Google Maps API key</Label><Input type="password" placeholder="AIza..." /></div>
                  <div className="flex items-end gap-2">
                    <Button onClick={handleDistances} className="w-full"><Clock className="w-4 h-4 mr-2"/>Distance to offices</Button>
                    <Button onClick={handleKinderCare} variant="secondary" className="w-full"><Baby className="w-4 h-4 mr-2"/>Find nearby KinderCare</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5"/>Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-xl bg-white border"><div className="text-slate-500">Total Income</div><div className="text-lg font-semibold">{currency(grossIncome)}</div></div>
                    <div className="p-3 rounded-xl bg-white border"><div className="text-slate-500">Total Expenses (outflow)</div><div className="text-lg font-semibold">{currency(totalExpenses)}</div></div>
                    <div className={`p-3 rounded-xl bg-white border text-lg font-semibold ${remainingIncome >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{currency(remainingIncome)}</div>
                    <div className="p-3 rounded-xl bg-white border"><div className="text-slate-500">House Facing</div><div className="text-lg font-semibold flex items-center gap-2"><Compass className="w-4 h-4"/>{state.facing}</div></div>
                  </div>

                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={expenseBreakdown} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} label>
                          {expenseBreakdown.map((_, idx) => <Cell key={idx} />)}
                        </Pie>
                        <Tooltip formatter={(v)=>currency(Number(v))} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5"/>Income vs Outflow</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={incomeVsOutflow}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(v)=>currency(Number(v))} />
                        <Bar dataKey="value" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><MapPin className="w-5 h-5"/>Commute, Daycare & Schools</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 gap-2">
                    <div className="p-3 rounded-xl bg-white border flex items-center justify-between">
                      <div className="flex items-center gap-2"><Clock className="w-4 h-4"/>Office 1</div>
                      <div>{distance1 ? `${distance1.distanceText} • ${distance1.durationText}` : "—"}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white border flex items-center justify-between">
                      <div className="flex items-center gap-2"><Clock className="w-4 h-4"/>Office 2</div>
                      <div>{distance2 ? `${distance2.distanceText} • ${distance2.durationText}` : "—"}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white border">
                      <div className="font-medium mb-1">KinderCare nearby</div>
                      {kinderCares.length ? (
                        <ul className="list-disc pl-5">
                          {kinderCares.map((k, i) => <li key={i}>{k.name} — <span className="text-slate-600">{k.vicinity}</span></li>)}
                        </ul>
                      ) : (
                        <div className="text-slate-500">Use "Find nearby KinderCare" above.</div>
                      )}
                    </div>
                    <div className="p-3 rounded-xl bg-white border">
                      <div className="font-medium mb-1 flex items-center gap-2"><School className="w-4 h-4"/>Assigned schools (from Redfin)</div>
                      {state.assignedSchools?.length ? (
                        <ul className="list-disc pl-5">
                          {state.assignedSchools.map((s: any, i: number) => (
                            <li key={i}><span className="font-medium">{s.name}</span>{s.level ? ` (${s.level})` : ""}{typeof s.rating === "number" ? ` — ${s.rating}/10` : ""}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-slate-500">Click "Fetch details" after pasting a Redfin link.</div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>

        <div className="mt-8 text-xs text-slate-500 leading-relaxed">
          <p><strong>Notes:</strong> Donut excludes profits (negative values) to avoid misleading slices. Facing is scraped when available on Redfin; otherwise leave manual. School ratings are best-effort parsed from the listing (usually GreatSchools). Data is for planning only.</p>
        </div>
      </div>
    </div>
  );
}
