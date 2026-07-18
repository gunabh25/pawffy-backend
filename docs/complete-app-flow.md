# Pawffy — Complete App Flow (User + Vendor)

**For:** Murtaza (Flutter)  
**Backend (production):** `https://pawffy-backend-yyed.onrender.com`  
**Auth header (all protected APIs):** `Authorization: Bearer <APP_JWT>`

This is the **full product flow** from scratch — customer app and vendor app together — through booking, payment, job completion, and vendor payout.

---

## Big picture (one sentence)

Customer books a service → pays (card or wallet) → booking becomes **confirmed** → vendor does the job → vendor marks **complete** → vendor gets paid → **both sides can leave reviews**.

```
CUSTOMER APP                              VENDOR APP
------------                              ----------
Login                                     Login
Find vendor / service                     (once) Stripe payouts setup
Pick slot                                 See confirmed request
Create booking                            Start job
Pay (card or wallet)                      Complete job  →  payout
See completed booking                     Review customer (optional)
Review vendor (optional)                  Reply to customer review
```

### Money rules (important)

| Who pays how | When money moves to vendor | Needs Stripe Connect? |
|---|---|---|
| Customer pays **card** | When vendor **completes** the job → Stripe Transfer | **Yes** — vendor must be onboarded first |
| Customer pays **wallet** | When vendor **completes** the job → vendor wallet credit | **No** |

Vendor receives: **service price − discount**  
Platform keeps: **platform fee + tax**

If vendor is **not** Stripe-onboarded, customer **cannot** create a card payment (`409 Vendor is not set up to receive payments yet`). Wallet still works.

### Booking statuses (lifecycle)

```
pending ──(customer pays)──► confirmed ──(vendor completes)──► completed
   │                            │
   └──(cancel / reject)──► cancelled / rejected
```

**Pay-to-confirm:** booking starts as `pending`. It becomes `confirmed` only after successful payment. Vendor does **not** manually “accept” paid bookings.

---

## PART A — One-time setup (both apps)

### A1. Customer login

1. Flutter: Supabase phone OTP → get Supabase `access_token`
2. Exchange for Pawffy JWT:

```http
POST /api/auth/session
Content-Type: application/json

{
  "accessToken": "<supabase_access_token>",
  "name": "John Doe",
  "email": "john@example.com"
}
```

Save `data.token` (customer JWT) and `data.user.id`.

### A2. Vendor login / register

1. Same Supabase phone OTP → `access_token`
2. **New vendor:**

```http
POST /api/auth/vendor/register
Content-Type: application/json

{
  "accessToken": "<supabase_access_token>",
  "name": "Gunabh Sharan",
  "email": "vendor@example.com",
  "acceptTerms": true
}
```

3. **Returning vendor:** `POST /api/auth/session` (same as customer; role will be `partner`)

Save `data.token` (partner JWT).

### A3. Vendor business profile (must exist before payouts / live bookings)

Vendor completes app onboarding (business, services, availability, documents, submit) via existing `/api/vendor/onboarding/*` APIs, then admin verifies.

Without a `PartnerBusiness`, payout APIs return `404 Create your vendor profile first`.

### A4. Vendor Stripe payouts setup (once — required for card payments)

Call from **Vendor app** with partner JWT.

**Step 1 — Check**

```http
GET /api/vendor/payouts/check
Authorization: Bearer <partner_jwt>
```

```json
{
  "success": true,
  "data": {
    "onboarded": false,
    "payoutsEnabled": false,
    "hasStripeAccount": false,
    "stripeAccountId": null
  }
}
```

- `onboarded == true` → show “Payouts active”, skip setup  
- else → show “Set up payouts”

**Step 2 — Start Stripe onboarding**

```http
POST /api/vendor/payouts/onboard
Authorization: Bearer <partner_jwt>
```

```json
{
  "success": true,
  "data": {
    "url": "https://connect.stripe.com/setup/e/acct_.../...",
    "stripeAccountId": "acct_..."
  }
}
```

**Step 3 — Flutter WebView**

1. Open `data.url` in WebView / Custom Tab  
2. Vendor finishes Stripe forms (bank + identity)  
3. Stripe redirects to:
   - `…/vendor/payouts/return` → **done** → close WebView  
   - `…/vendor/payouts/refresh` → link expired → close WebView → call onboard again  

Production redirect base: `https://pawffy-backend-yyed.onrender.com`  
(You intercept these paths — no separate website needed.)

**Step 4 — Confirm**

```http
GET /api/vendor/payouts/status
Authorization: Bearer <partner_jwt>
```

Expect `payoutsEnabled: true`, `onboarded: true`.

---

## PART B — Customer booking + payment (User app)

Use **customer** JWT for all steps below.

### B1. Add / select a pet

Customer must have a pet (`petId`) before booking.

```http
GET /api/pets
POST /api/pets   // create if needed
```

### B2. Discover vendors

```http
GET /api/vendors
GET /api/vendors/:vendorId
```

Pick a `vendorId` and a `serviceId` from that vendor’s services.

### B3. Pick a slot

```http
GET /api/vendors/:vendorId/slots?date=2026-07-20&serviceId=<serviceId>
```

```json
{
  "success": true,
  "data": {
    "date": "2026-07-20",
    "slots": [
      { "time": "09:00", "available": true },
      { "time": "09:30", "available": false }
    ]
  }
}
```

User picks an **available** `time`.

### B4. Create booking (status = `pending`)

```http
POST /api/bookings
Authorization: Bearer <customer_jwt>
Content-Type: application/json

{
  "vendorId": "<vendor-uuid>",
  "serviceId": "<service-uuid>",
  "petId": "<pet-uuid>",
  "bookingDate": "2026-07-20",
  "bookingTime": "09:00",
  "location": "123 Main St",
  "notes": "Friendly dog"
}
```

Response: booking with `"status": "pending"` and `id` (= `bookingId`).

### B5. Price summary (checkout screen)

```http
GET /api/payments/summary/:bookingId
GET /api/payments/config
```

Optional coupon:

```http
POST /api/payments/apply-coupon
{ "bookingId": "<bookingId>", "code": "SAVE10" }
```

### B6. Pay — choose one path

#### Path 1: Card (Stripe)

```http
POST /api/payments/create-intent
{
  "bookingId": "<bookingId>",
  "paymentMethod": "card",
  "couponCode": ""
}
```

Success → `clientSecret` + `paymentIntentId`  
Flutter: confirm payment with Stripe SDK using `clientSecret`.

Then verify:

```http
POST /api/payments/verify
{ "paymentIntentId": "pi_..." }
```

→ Booking becomes **`confirmed`**. Payment stored. Vendor amount calculated for later payout.

**If vendor not onboarded on Stripe:**

```json
{ "success": false, "message": "Vendor is not set up to receive payments yet" }
```
HTTP **409** — show a friendly message; card checkout is blocked by design.

#### Path 2: Wallet

```http
POST /api/payments/confirm
{ "bookingId": "<bookingId>", "couponCode": "" }
```

→ Booking becomes **`confirmed`** immediately. No Stripe Connect required for the vendor.

### B7. Customer post-payment screens

```http
GET /api/bookings/:id          // confirmation details
GET /api/bookings?status=confirmed
```

Customer can cancel (before completed):

```http
PATCH /api/bookings/:id/status
{ "status": "cancelled" }
```

If paid and not yet paid out → refund (Stripe refund or wallet credit).

---

## PART C — Vendor fulfills the job (Vendor app)

Use **partner** JWT.

Paid bookings appear as requests. Vendor does **not** accept to confirm payment — payment already confirmed the booking. Vendor may **reject** unpaid/pending cases as allowed by API; manual “accept” for paid bookings is disabled (auto-confirmed by payment).

### C1. Inbox

```http
GET /api/vendor/home
GET /api/vendor/requests?status=pending
GET /api/vendor/requests?status=upcoming   // confirmed upcoming
```

### C2. Run the job

Typical sequence for a confirmed booking (`requestId` = booking id):

```http
POST /api/vendor/requests/:id/start
POST /api/vendor/requests/:id/progress      // optional updates
POST /api/vendor/requests/:id/media         // optional photos
POST /api/vendor/requests/:id/complete      // ← THIS TRIGGERS PAYOUT
```

On **complete**, backend:

- Sets booking `status = completed`
- Pays vendor:
  - **Card booking** → Stripe Transfer to Connect account  
  - **Wallet booking** → credit vendor’s in-app wallet  

### C3. Reject (if applicable)

```http
POST /api/vendor/requests/:id/reject
```

---

## PART D — Reviews (after booking is `completed`)

Reviews are **two-way**. Both require a **completed** booking. **One review per booking per direction.**

### D1. Customer reviews the vendor

**Token:** customer JWT  
**When:** After job is completed (customer app “Rate your visit”).

```http
POST /api/vendors/:vendorId/reviews
Authorization: Bearer <customer_jwt>
Content-Type: application/json

{
  "bookingId": "<bookingId>",
  "rating": 5,
  "comment": "Great service, highly recommend!"
}
```

`vendorId` = `businessId` from the booking / vendor detail.

**Response (201):** review object with rating, comment, user, booking summary.  
Updates vendor’s average `rating` / `reviewCount`.

**Also useful**

```http
GET /api/vendors/:vendorId/reviews          // public list on vendor profile
GET /api/vendor/reviews                     // vendor sees reviews about them (partner JWT)
POST /api/vendor/reviews/:reviewId/reply    // vendor replies
{ "replyContent": "Thank you!" }
```

### D2. Vendor reviews the customer

**Token:** partner JWT  
**When:** After job is completed (vendor app “Rate this customer”).

```http
POST /api/vendor/customer-reviews
Authorization: Bearer <partner_jwt>
Content-Type: application/json

{
  "bookingId": "<bookingId>",
  "rating": 5,
  "comment": "Friendly customer, pets were well behaved."
}
```

**Response (201):** review object. Updates customer’s `customerRating` / `customerReviewCount`.

**Also useful**

```http
GET /api/vendor/customer-reviews     // reviews this vendor wrote (partner JWT)
GET /api/users/me/reviews            // reviews about me (customer JWT)
```

### D3. Review rules

| Rule | Detail |
|---|---|
| Booking status | Must be `completed` |
| Uniqueness | One customer→vendor review per booking; one vendor→customer review per booking |
| Rating | Integer 1–5 |
| Auth | Customer JWT for D1; partner JWT for D2 |
| Errors | `400` no completed booking · `409` already reviewed |

Either side can review independently (customer first, vendor first, or both).

---

## PART E — Full timeline (both sides together)

| # | Actor | Action | API | Result |
|---|---|---|---|---|
| 1 | Vendor | Register / login | `POST /api/auth/vendor/register` or `/session` | Partner JWT |
| 2 | Vendor | Business onboarding + admin approve | `/api/vendor/onboarding/*` | Live vendor |
| 3 | Vendor | Stripe payouts setup | `check` → `onboard` → WebView → `status` | `payoutsEnabled: true` |
| 4 | Customer | Login | `POST /api/auth/session` | Customer JWT |
| 5 | Customer | Pets | `GET/POST /api/pets` | `petId` |
| 6 | Customer | Browse | `GET /api/vendors`, `/:id` | `vendorId`, `serviceId` |
| 7 | Customer | Slots | `GET /api/vendors/:id/slots?date&serviceId` | pick time |
| 8 | Customer | Book | `POST /api/bookings` | `bookingId`, status `pending` |
| 9 | Customer | Checkout | `GET /api/payments/summary/:bookingId` | totals |
| 10a | Customer | Pay card | `create-intent` → Stripe SDK → `verify` | status `confirmed` |
| 10b | Customer | Pay wallet | `POST /api/payments/confirm` | status `confirmed` |
| 11 | Vendor | See request | `GET /api/vendor/requests?status=upcoming` | confirmed job |
| 12 | Vendor | Start → Complete | `…/start` → `…/complete` | status `completed` + **payout** |
| 13 | Customer | Review vendor | `POST /api/vendors/:vendorId/reviews` | vendor rating updated |
| 14 | Vendor | Review customer | `POST /api/vendor/customer-reviews` | customer rating updated |
| 15 | Vendor | (optional) Reply | `POST /api/vendor/reviews/:reviewId/reply` | reply saved |

---

## PART F — Flutter screens map (suggested)

### Customer app

1. Login / OTP  
2. Home / Explore vendors (show vendor `rating`)  
3. Vendor detail + services + reviews list  
4. Slot picker  
5. Create booking  
6. Checkout (summary + coupon)  
7. Pay (Card **or** Wallet)  
8. Booking confirmation / My bookings  
9. Cancel booking (optional)  
10. **Rate vendor** (after completed)  
11. **My reviews** (`GET /api/users/me/reviews`) — reviews vendors left about me  

### Vendor app

1. Login / OTP / Register  
2. Business onboarding (existing)  
3. **Payouts setup** (Stripe WebView) — once  
4. Home (new requests / today)  
5. Request detail  
6. Start → progress → complete  
7. Earnings / history (optional)  
8. **Rate customer** (after completed)  
9. **My reviews** + reply to customer reviews  

---

## PART G — Quick API cheat sheet

### Auth
| Method | Path | Who |
|---|---|---|
| POST | `/api/auth/session` | Customer / returning vendor |
| POST | `/api/auth/vendor/register` | New vendor |

### Customer
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/pets` | List pets |
| GET | `/api/vendors` | List vendors |
| GET | `/api/vendors/:vendorId` | Vendor + services |
| GET | `/api/vendors/:vendorId/slots` | Available times |
| POST | `/api/bookings` | Create booking (`pending`) |
| GET | `/api/bookings` | My bookings |
| GET | `/api/bookings/:id` | Booking detail |
| PATCH | `/api/bookings/:id/status` | Cancel `{ "status": "cancelled" }` |
| GET | `/api/payments/config` | Stripe publishable key |
| GET | `/api/payments/summary/:bookingId` | Price breakdown |
| POST | `/api/payments/apply-coupon` | Apply coupon |
| POST | `/api/payments/create-intent` | Start card payment |
| POST | `/api/payments/verify` | Confirm card payment |
| POST | `/api/payments/confirm` | Pay with wallet |
| POST | `/api/vendors/:vendorId/reviews` | Review vendor |
| GET | `/api/vendors/:vendorId/reviews` | List vendor reviews (public) |
| GET | `/api/users/me/reviews` | Reviews about me |

### Vendor
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/vendor/payouts/check` | Onboarded? (fast) |
| POST | `/api/vendor/payouts/onboard` | Stripe WebView URL |
| GET | `/api/vendor/payouts/status` | Fresh Stripe status |
| GET | `/api/vendor/home` | Home dashboard |
| GET | `/api/vendor/requests?status=` | Inbox |
| POST | `/api/vendor/requests/:id/start` | Start job |
| POST | `/api/vendor/requests/:id/complete` | Finish job **+ payout** |
| POST | `/api/vendor/requests/:id/reject` | Reject |
| GET | `/api/vendor/reviews` | Reviews customers left about me |
| POST | `/api/vendor/reviews/:reviewId/reply` | Reply to a customer review |
| POST | `/api/vendor/customer-reviews` | Review a customer |
| GET | `/api/vendor/customer-reviews` | Reviews I wrote about customers |

---

## PART H — Errors Flutter should handle

| Where | Code | Message / meaning | UX |
|---|---|---|---|
| Card `create-intent` | 409 | Vendor not set up for payments | Tell user this vendor can’t take card yet |
| Card `create-intent` | 409 | Already paid | Go to booking detail |
| Book | 409 | Slot unavailable | Refresh slots |
| Review | 400 | No completed booking | Only show rate UI after complete |
| Review | 409 | Already reviewed | Hide rate button / show “already rated” |
| Payouts | 404 | Create vendor profile first | Finish business onboarding |
| WebView | — | Lands on `/refresh` | Call `onboard` again |
| Auth | 401 | Invalid token | Re-run Supabase → session |

---

## PART I — Test checklist (end-to-end)

- [ ] Vendor registers and has approved business + services + availability  
- [ ] Vendor completes Stripe Connect → `payouts/check` shows `onboarded: true`  
- [ ] Customer creates pet, picks vendor/slot, creates booking  
- [ ] Customer pays by **card** → booking `confirmed`  
- [ ] Vendor starts + completes → Stripe transfer created  
- [ ] Customer posts vendor review → shows on `GET /api/vendors/:id/reviews`  
- [ ] Vendor posts customer review → shows on `GET /api/users/me/reviews`  
- [ ] Vendor replies to customer’s review  
- [ ] Second booking: wallet pay → complete → both reviews still work  
- [ ] Customer cancels a paid-but-not-completed booking → refund  

---

## What each developer owns

| Flutter (Murtaza) | Backend (done) |
|---|---|
| Customer screens + Stripe PaymentSheet / SDK | Booking + payment APIs |
| Vendor screens + Connect WebView | Connect account + transfers |
| Intercept return/refresh URLs | Block card if not onboarded |
| Call complete → show success | Payout on complete |
| Rate vendor / rate customer screens | Review APIs + rating aggregates |

**Postman:** folder **⭐ Reviews (Customer ↔ Vendor)** in `Pawffy API — Unified`, plus Vendor / Production / Unified Booking collections.
