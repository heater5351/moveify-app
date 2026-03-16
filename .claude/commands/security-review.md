---
description: Security review checklist for Moveify — run before deploying auth, API, or patient data changes
---

# Security Review

Run this when touching authentication, API endpoints, patient data, or input handling.

## Moveify-Specific Concerns

Moveify stores **sensitive health information** under the Australian Privacy Act 1988. Security failures have legal consequences.

### Patient Data Rules
- [ ] Never log patient health data (pain scores, conditions, check-in responses, mood, sleep)
- [ ] Never expose health data in URLs (query params, path segments)
- [ ] Patient endpoints validate `req.user.id` matches patient — never trust client-supplied IDs
- [ ] Any new endpoint has `authenticate` middleware
- [ ] Role-based endpoints use `requireRole()` middleware
- [ ] Admin-only endpoints use `requireAdmin` middleware
- [ ] Patient data endpoints use `requirePatientAccess` or `requireSelf`

### SQL Injection
- [ ] All queries use parameterized `$1, $2` placeholders — NEVER string concatenation
- [ ] Dynamic column names validated against whitelist (not user input)
- [ ] `ORDER BY` clauses use whitelisted column names

### Authentication
- [ ] New routes behind `authenticate` middleware
- [ ] JWT token not exposed in logs or error messages
- [ ] Password changes require current password verification
- [ ] Rate limiting on auth endpoints (already configured: 10/15min)

### Input Validation
- [ ] Email format validated before DB queries
- [ ] String lengths bounded (name, notes, descriptions)
- [ ] Numeric inputs validated (sets, reps, weight, ratings within expected range)
- [ ] Date inputs validated (valid format, reasonable range)

### CORS & Headers
- [ ] `CORS_ORIGIN` set in production (no wildcard)
- [ ] Helmet security headers active
- [ ] New origins added to `allowedOrigins` array in server.js only when necessary

### Error Handling
- [ ] Error responses don't expose stack traces in production
- [ ] Failed auth returns generic message (not "user not found" vs "wrong password")
- [ ] Database errors return 500 with generic message, details only in server logs

## Pre-Deploy Checklist

Before ANY production deployment touching security:

- [ ] All user inputs validated
- [ ] All queries parameterized
- [ ] Auth middleware on all new routes
- [ ] Access control (role + ownership) verified
- [ ] No health data in logs
- [ ] No secrets in code
- [ ] Rate limiting appropriate
- [ ] Error messages generic for client
- [ ] Tested with both clinician and patient roles
