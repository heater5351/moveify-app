#!/usr/bin/env python3
"""
AWS cost report for Moveify (Bedrock + Transcribe focus).

Reads AWS credentials from the standard chain (env vars or ~/.aws/credentials).
It NEVER prints credentials — only cost figures.

Usage:
  # creds via env (in YOUR terminal, not pasted into chat):
  #   export AWS_ACCESS_KEY_ID=...  AWS_SECRET_ACCESS_KEY=...
  # or a configured ~/.aws/credentials profile:
  #   export AWS_PROFILE=moveify
  python scripts/aws-cost-report.py

Needs IAM perm: ce:GetCostAndUsage  (Cost Explorer must be enabled in the account).
Cost Explorer is global; the client uses us-east-1 regardless of where Bedrock runs.
"""
import datetime as dt
import boto3

ce = boto3.client("ce", region_name="us-east-1")

today = dt.date.today()
month_start = today.replace(day=1)
last30_start = today - dt.timedelta(days=30)


def fmt(rows):
    return "\n".join(f"    {svc:<45} {amt:>10.2f} {cur}" for svc, amt, cur in rows) or "    (none)"


# IMPORTANT: group on GROSS usage only (RECORD_TYPE=Usage). Otherwise promotional
# credits (RECORD_TYPE=Credit) get attributed back to each service as negatives and
# net every line to ~$0 — which hid all real spend in the first version of this script.
USAGE_ONLY = {"Dimensions": {"Key": "RECORD_TYPE", "Values": ["Usage"]}}


def by_service(start, end):
    resp = ce.get_cost_and_usage(
        TimePeriod={"Start": start.isoformat(), "End": end.isoformat()},
        Granularity="MONTHLY",
        Metrics=["UnblendedCost"],
        GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
        Filter=USAGE_ONLY,
    )
    agg = {}  # aggregate across month buckets so a service isn't listed once per month
    cur = "USD"
    for period in resp["ResultsByTime"]:
        for g in period["Groups"]:
            amt = float(g["Metrics"]["UnblendedCost"]["Amount"])
            cur = g["Metrics"]["UnblendedCost"]["Unit"]
            agg[g["Keys"][0]] = agg.get(g["Keys"][0], 0.0) + amt
    out = [(k, v, cur) for k, v in agg.items() if v != 0]
    return sorted(out, key=lambda r: -r[1])


def credits_and_net(start, end):
    """Return (gross_usage, credits, net) over the window."""
    resp = ce.get_cost_and_usage(
        TimePeriod={"Start": start.isoformat(), "End": end.isoformat()},
        Granularity="MONTHLY", Metrics=["UnblendedCost"],
        GroupBy=[{"Type": "DIMENSION", "Key": "RECORD_TYPE"}],
    )
    usage = credit = 0.0
    for period in resp["ResultsByTime"]:
        for g in period["Groups"]:
            amt = float(g["Metrics"]["UnblendedCost"]["Amount"])
            if g["Keys"][0] == "Usage":
                usage += amt
            elif g["Keys"][0] == "Credit":
                credit += amt
    return usage, credit, usage + credit


def usage_types_for(service_substrings, start, end):
    """Break a service down by USAGE_TYPE so we can see tokens vs audio-minutes etc."""
    resp = ce.get_cost_and_usage(
        TimePeriod={"Start": start.isoformat(), "End": end.isoformat()},
        Granularity="MONTHLY",
        Metrics=["UnblendedCost", "UsageQuantity"],
        GroupBy=[{"Type": "DIMENSION", "Key": "USAGE_TYPE"}],
        Filter={"And": [{"Dimensions": {"Key": "SERVICE", "Values": service_substrings}}, USAGE_ONLY]},
    )
    agg = {}
    cur = "USD"
    for period in resp["ResultsByTime"]:
        for g in period["Groups"]:
            amt = float(g["Metrics"]["UnblendedCost"]["Amount"])
            qty = float(g["Metrics"]["UsageQuantity"]["Amount"])
            cur = g["Metrics"]["UnblendedCost"]["Unit"]
            a, q = agg.get(g["Keys"][0], (0.0, 0.0))
            agg[g["Keys"][0]] = (a + amt, q + qty)
    out = [(f"{k}  (qty {q:.1f})", a, cur) for k, (a, q) in agg.items() if a != 0 or q != 0]
    return sorted(out, key=lambda r: -r[1])


def summary(label, start, end):
    u, c, n = credits_and_net(start, end)
    print(f"\n=== {label} ({start} → {today}) — GROSS usage by service ===")
    print(fmt(by_service(start, end)))
    print(f"    {'—'*45}")
    print(f"    {'GROSS usage':<45} {u:>10.2f} USD")
    print(f"    {'Promotional credits applied':<45} {c:>10.2f} USD")
    print(f"    {'NET (what you actually pay)':<45} {n:>10.2f} USD")


summary("MONTH TO DATE", month_start, today + dt.timedelta(days=1))
summary("LAST 30 DAYS", last30_start, today + dt.timedelta(days=1))
mtd = by_service(last30_start, today + dt.timedelta(days=1))

# Find the exact Bedrock/Transcribe service labels present, then break them down.
ai_services = [s for s, _, _ in mtd if any(k in s for k in ("Bedrock", "Transcribe"))]
for svc in ai_services:
    print(f"\n=== {svc} — by usage type (last 30 days) ===")
    print(fmt(usage_types_for([svc], last30_start, today + dt.timedelta(days=1))))

if not ai_services:
    print("\n(No Bedrock/Transcribe spend found in the last 30 days.)")
