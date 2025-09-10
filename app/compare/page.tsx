"use client";
import React, { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";

const currency = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const num = (v: any, d = 0) => { const n = parseFloat(String(v).replace(/,/g, "")); return isFinite(n) ? n : d; };
function monthlyMortgage({ price, downPct, ratePct, years }: { price: number; downPct: number; ratePct: number; years: number; }) {
  const loan = price * (1 - downPct / 100);
  const r = ratePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return loan / n;
  return (loan * r) / (1 - Math.pow(1 + r, -n));
}

function summarize(s:any) {
  const newMortgageMonthly = monthlyMortgage({ price: num(s.newPrice), downPct: num(s.newDownPct), ratePct: num(s.newRatePct), years: num(s.newYears, 30) });
  const newHouseCarrying = newMortgageMonthly + num(s.newPropTaxMonthly) + num(s.newHOAMonthly) + num(s.newInsuranceMonthly);
  const existingNet = (num(s.existingMortgageMonthly) + num(s.existingPropTaxMonthly) + num(s.existingHOAMonthly)) - num(s.expectedRentMonthly);
  const livingExpenses = num(s.expCars) + num(s.expFood) + num(s.expDaycare) + num(s.expElectricity) + num(s.expWater) + num(s.expMisc);
  const existingLoss = Math.max(existingNet, 0);
  const totalExpenses = newHouseCarrying + livingExpenses + existingLoss;
  const grossIncome = (num(s.p1SemiMonthly) + num(s.p2SemiMonthly)) * 2;
  const remainingIncome = grossIncome - (livingExpenses + newHouseCarrying + existingNet);
  return { newMortgageMonthly, newHouseCarrying, existingNet, livingExpenses, existingLoss, totalExpenses, grossIncome, remainingIncome };
}

export default function ComparePage() {
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [left, setLeft] = useState<string>("");
  const [right, setRight] = useState<string>("");
  useEffect(()=>{
    const raw = localStorage.getItem("house-scenarios");
    const arr = raw ? JSON.parse(raw) : [];
    setScenarios(arr);
    if (arr.length>0) { setLeft(arr[0].name); if (arr[1]) setRight(arr[1].name); }
  }, []);

  const leftData = scenarios.find(s=>s.name===left)?.payload;
  const rightData = scenarios.find(s=>s.name===right)?.payload;

  const L = leftData ? summarize(leftData) : null;
  const R = rightData ? summarize(rightData) : null;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold">Compare Scenarios</h1>
        <Link href="/"><Button variant="outline">Back to Dashboard</Button></Link>
      </div>

      <div className="flex gap-4 items-center mb-4">
        <div className="flex-1">
          <label className="block text-xs text-slate-600 mb-1">Left</label>
          <select className="w-full border rounded-md p-2" value={left} onChange={e=>setLeft(e.target.value)}>
            <option value="">—</option>
            {scenarios.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-slate-600 mb-1">Right</label>
          <select className="w-full border rounded-md p-2" value={right} onChange={e=>setRight(e.target.value)}>
            <option value="">—</option>
            {scenarios.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>{left || "Left scenario"}</CardTitle></CardHeader><CardContent>
          {L ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Total Income: <strong>{currency(L.grossIncome)}</strong></div>
                <div>Total Expenses: <strong>{currency(L.totalExpenses)}</strong></div>
                <div>Remaining: <strong className={L.remainingIncome>=0?'text-emerald-700':'text-rose-700'}>{currency(L.remainingIncome)}</strong></div>
                <div>Existing Net: <strong>{currency(leftData.existingNet ?? L.existingNet)}</strong></div>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[{name:'Income', value:L.grossIncome},{name:'Outflow',value:L.totalExpenses}]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="value" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : <div className="text-slate-500 text-sm">Pick a scenario.</div>}
        </CardContent></Card>

        <Card><CardHeader><CardTitle>{right || "Right scenario"}</CardTitle></CardHeader><CardContent>
          {R ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Total Income: <strong>{currency(R.grossIncome)}</strong></div>
                <div>Total Expenses: <strong>{currency(R.totalExpenses)}</strong></div>
                <div>Remaining: <strong className={R.remainingIncome>=0?'text-emerald-700':'text-rose-700'}>{currency(R.remainingIncome)}</strong></div>
                <div>Existing Net: <strong>{currency(rightData.existingNet ?? R.existingNet)}</strong></div>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[{name:'Income', value:R.grossIncome},{name:'Outflow',value:R.totalExpenses}]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="value" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : <div className="text-slate-500 text-sm">Pick a scenario.</div>}
        </CardContent></Card>
      </div>
    </div>
  );
}
