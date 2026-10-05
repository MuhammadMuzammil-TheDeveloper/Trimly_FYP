# TRIMLY – MongoDB Database Setup

Database setup for the **TRIMLY** salon booking and management app (FYP).
One command creates the `trimly` database in MongoDB Atlas with all collections, validators, indexes and sample data.

```
trimly-database/
├── package.json     ← project info + the "setup" command
├── .env.example     ← template for your secret connection string
├── .gitignore       ← keeps .env and node_modules out of Git
├── setup.js         ← creates collections, validators, indexes, sample data
├── models.js        ← all Mongoose schemas (one file)
└── README.md        ← this guide
```

> **Source documents:** this design is based on **"Trimly – App Data Flow"**. The *FYP Proposal* document was not
> available when this was built, so anything the Data Flow document does not define is marked **MODELING DECISION**
> (see Section 12). If your proposal says something different, check those items first.

---

## Quick start (if you already know Node and Atlas)

```bash
npm install
# create .env with:  MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.xxxxx.mongodb.net/
npm run setup
```

---

# PART 1 – Beginner Setup Guide

## Step 1 – Install Node.js

1. Go to <https://nodejs.org> and download the **LTS** version (18 or newer). Install it with the default options.
2. Open a terminal (Windows: *Command Prompt* or *PowerShell*; Mac: *Terminal*) and check:

```bash
node -v
npm -v
```

Both should print a version number (for example `v22.12.0` and `10.9.0`). If you see "command not found", close and reopen the terminal, or reinstall Node.js.

## Step 2 – Set up MongoDB Atlas (free)

1. Go to <https://www.mongodb.com/cloud/atlas> and **create a free account** (sign up with Google or email).
2. Create a cluster: choose **Create** / **Build a Database** → pick the **Free (M0)** option → choose any nearby region → **Create**.
3. **Create a database user** (this is *not* your Atlas login):
   - Left menu → **Security → Database Access** → **Add New Database User**
   - Authentication method: **Password**
   - Choose a username (example: `trimlyUser`) and a password. Prefer letters and numbers only (no `@ : / ?`) – it avoids connection problems.
   - Role: **Read and write to any database** → **Add User**.
   - Write the username and password down. You will need them in Step 4.
4. **Allow your computer to connect:**
   - Left menu → **Security → Network Access** → **Add IP Address**
   - Click **Add Current IP Address** (or, for development only, **Allow Access From Anywhere** = `0.0.0.0/0`) → **Confirm**.
   - Wait until the status says **Active**.
5. **Get the connection string:**
   - Left menu → **Database** → on your cluster click **Connect** → **Drivers** → **Node.js**.
   - Copy the string. It looks like:
     `mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority`

## Step 3 – Project setup

Open a terminal inside the project folder:

```bash
cd trimly-database
npm install
```

This installs the only two packages needed: `mongoose` and `dotenv`.

## Step 4 – Create the `.env` file

1. In the `trimly-database` folder, **copy `.env.example` and rename the copy to `.env`**.
2. Open `.env` and replace the text so it looks like this:

```
MONGODB_URI=mongodb+srv://trimlyUser:MyPassword123@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
```

Rules:

- Replace `<username>` and `<password>` with your **database user** from Step 2 (remove the `< >` brackets too).
- Use the connection string from Atlas (the one that starts with `mongodb+srv://`).
- No spaces around `=`, no quotes, no extra spaces at the end of the line.
- **Never share your password or commit `.env`** – `.gitignore` already protects it.
- If your password contains special characters (`@ : / ? # %`), either choose a simpler password or URL-encode them (`@` → `%40`).

You do **not** need to type the database name – the script always uses the database called `trimly`.

## Step 5 – Run the database setup

```bash
npm run setup
```

The script will:

1. connect to Atlas,
2. create the 11 collections with validation rules,
3. create indexes,
4. insert fictional sample data,
5. close the connection and print `DATABASE READY`.

**It is safe to run again.** It never deletes anything or drops the database. On a second run, collection rules are refreshed and the sample data is detected and skipped (no duplicates).

## Step 6 – See the result in Atlas

1. Go to <https://cloud.mongodb.com> and open your project.
2. Left menu → **Database** → on your cluster click **Browse Collections**.
3. In the left list you will see the database **`trimly`**. Click it to expand the collections: `users`, `salons`, `barbers`, `services`, `bookings`, `payments`, `reviews`, `loyaltyPoints`, `cancellationLogs`, `notifications`, `aiRecommendations`.
4. Click a collection to see its documents; use the **Indexes** tab to see its indexes.

**Starting over?** There is no reset command on purpose (to keep things safe). If you want to wipe the demo data, open Browse Collections and delete the `trimly` database (or individual collections) by hand, then run `npm run setup` again.

---

# Troubleshooting

| # | Message / problem | What it means and what to do |
|---|---|---|
| 1 | **`MONGODB_URI is missing`** | The `.env` file does not exist, is in the wrong folder, or is named `.env.txt`. It must be named exactly `.env` and sit next to `package.json`. Check the line starts with `MONGODB_URI=`. |
| 2 | **Authentication failed / bad auth** | The database username or password is wrong. Check **Security → Database Access**. You can **Edit** the user and set a new password, then update `.env`. |
| 3 | **IP not allowed / could not connect to any servers** | Atlas is blocking your computer. **Security → Network Access → Add IP Address → Add Current IP Address** and wait until it is *Active*. Your IP changes on a new network, so add it again if you move (e.g. to a different Wi-Fi). |
| 4 | **DNS error (`ENOTFOUND`, `querySrv ...`)** | The cluster address cannot be found. Check your internet connection and that you copied the full address from Atlas. Some networks/VPNs block this – try a different network or turn the VPN off. |
| 5 | **Invalid connection string** | It must start with `mongodb+srv://`. Copy it again from Atlas (**Connect → Drivers**). Remove any `< >` brackets and quotes. |
| 6 | **Wrong username/password** | Same as #2. Remember: it is the *database user* from Database Access, not your Atlas login email. URL-encode special characters in the password (`@` → `%40`). |
| 7 | **Duplicate key error (E11000)** | A value that must be unique already exists (e.g. same phone number, or two reviews for one booking). The setup script avoids this itself; if you see it, you probably inserted data by hand with the same value. |
| 8 | **Validation error / Document failed validation** | A document is missing a required field or has a wrong value (e.g. a status that is not in the allowed list, rating outside 1–5, empty cancellation reason). Fix the data. Allowed values are listed in `ENUMS` at the top of `models.js`. |
| 9 | **Connection timeout / Server selection timed out** | Atlas could not be reached within 15 seconds. Usually #3 (IP not allowed) or no internet. Also make sure the cluster is not *paused* (free clusters pause after inactivity – click **Resume** in Atlas). |

---

# PART 2 – Database Architecture

## 1. Project Understanding

TRIMLY is a salon booking and management mobile app (React Native) with a Node.js backend and MongoDB. There are three user roles: **Customer** (finds a salon, books, pays a 30% deposit, reviews), **Barber** (accepts or cancels bookings, runs the haircut) and **Salon Owner** (manages barbers, chairs and services, watches revenue and cancellation logs). External services handle OTP login, JazzCash/Easypaisa payments (sandbox), WhatsApp/Twilio notifications and AI hairstyle suggestions.

## 2. Requirements (extracted from the Data Flow document)

- Phone + OTP login for users; role-based screens (Customer / Barber / Owner).
- Customers pick an **area**, see salons there, view services and prices, choose barber + services + time slot.
- Booking only if the slot is free **and** at least 60 minutes ahead.
- Deposit = **30%** of the confirmed service total; remaining **70%** is paid at the salon.
- Barber has a **10-minute** decision window; can accept or cancel. Cancel needs a **reason**, creates an **audit record**, and requests a **refund** of the deposit.
- If the barber does not decide in 10 minutes, the system may auto-confirm; a late cancellation must not override a confirmed booking.
- Barber can start and complete the haircut. Booking status and payment status are stored **separately**; a refund stays **pending** until the provider confirms.
- Reminder 30 minutes before the appointment (skipped if the booking is no longer valid).
- Review only after a **completed** appointment; completed appointments earn **loyalty points**; negative review sentiment alerts the owner.
- AI hairstyle feature is **optional and paid**; result is attached to the appointment and visible to customer and barber.
- Owner dashboard: revenue, completed haircuts, active chairs, online staff, cancellation logs, weekly revenue, staff utilization.

## 3. Final Collections

All 11 collections suggested in the document were checked. **All 11 are required.**

| Collection | Required? | Why (from the document) |
|---|---|---|
| `users` | ✅ | Customer, barber and owner accounts (Sections 3.1, 10). |
| `salons` | ✅ | Salon profile and area used for salon search (3.2, 5). |
| `barbers` | ✅ | Availability status, salon assignment, chair (4.1, 5). |
| `services` | ✅ | Service names, prices, duration; owner edits them (3.2, 5). |
| `bookings` | ✅ | Core record: customer, barber, services, time, status. |
| `payments` | ✅ | Deposit, remaining payment, refund; status kept separate (6). |
| `reviews` | ✅ | Ratings and comments after completion; sentiment (9). |
| `loyaltyPoints` | ✅ | "Customer points and point history" (9, 10). |
| `cancellationLogs` | ✅ | Mandatory reason + audit record; owner views them (4.1, 5). |
| `notifications` | ✅ | Booking alerts and 30-minute reminders (4.1, 8). |
| `aiRecommendations` | ✅ | AI results linked to customer/appointment (7). |

**Deliberately not created:**

- `otps` – the OTP service is external; the backend only asks it to send/verify codes. Nothing to store in MongoDB.
- `chairs` – the document only needs chair assignment and an "active chairs" count, so `salons.totalChairs` and `barbers.chairNumber` are enough.
- `invitations` – a barber's `inviteStatus` field covers "owner invites barbers".

## 4. Database Architecture

Database: **`trimly`** · 11 collections · MongoDB Atlas · Mongoose (ES Modules).

```
users ──< salons (owner) ──< services
  │            └──< barbers >── users (barber account)
  │
  └──< bookings >── salons, barbers   (services copied into booking)
          ├── 1 payments (deposit / remaining / refund)
          ├── 0..1 reviews
          ├── 0..1 cancellationLogs
          ├── 0..n notifications
          └── 0..n aiRecommendations
users ── 1 loyaltyPoints (history embedded)
```

## 5. Fields

See the full **Data Dictionary** (Section 11). Every collection also has an automatic `_id`, and (except `cancellationLogs` and `aiRecommendations`, which only have `createdAt`) `createdAt` and `updatedAt`.

## 6. Relationships

| From | To | Type | Notes |
|---|---|---|---|
| salons.owner | users | many-to-one | An owner can have a salon (more than one is allowed). |
| barbers.user | users | one-to-one | `unique`: one barber profile per user. |
| barbers.salon | salons | many-to-one | Barber works at one salon. |
| services.salon | salons | many-to-one | |
| bookings.customer / salon / barber | users / salons / barbers | many-to-one | |
| bookings.services[].service | services | many-to-many (via embedded snapshot) | |
| payments.booking | bookings | one-to-one | `unique, sparse` (see decision D3). |
| reviews.booking | bookings | one-to-one | `unique`: one review per booking. |
| cancellationLogs.booking | bookings | one-to-one | `unique`: one audit record per booking. |
| loyaltyPoints.customer | users | one-to-one | `unique`. |
| notifications.user / booking | users / bookings | many-to-one | |
| aiRecommendations.customer / booking | users / bookings | many-to-one | |

## 7. Embedding vs References

**Referenced (separate collections):** everything that is read or updated on its own or grows without limit – users, salons, barbers, services, bookings, payments, reviews, notifications, cancellation logs.

**Embedded (inside the parent document):** small data that is always read together with its parent and is never queried alone.

| Embedded data | Inside | Why |
|---|---|---|
| `services[]` (name, price, duration copy + service id) | `bookings` | A price change later must not alter old bookings or deposits (snapshot). Always loaded with the booking. |
| `refund` object | `payments` | Exactly one refund per booking; always viewed with the payment. |
| `history[]` | `loyaltyPoints` | Doc says "customer points and point history". Small per customer; shown with the balance. If it ever grows very large, move it to its own collection. |
| `suggestions[]` | `aiRecommendations` | A handful of hairstyle suggestions, read together. |

## 8. Business Rules – who enforces what

| Rule (from document) | MongoDB | Mongoose | Node.js backend | n8n / automation |
|---|---|---|---|---|
| Book at least 60 min ahead | – | – | ✅ compare `appointmentStart` with now | – |
| Backend checks slot availability | Index on `barber + appointmentStart + status` makes the query fast | – | ✅ query overlapping non-cancelled bookings (use an atomic check/transaction to avoid double booking) | – |
| Barber 10-minute decision window | Stores `decisionDeadline` | `required` | ✅ sets deadline = created + 10 min | ✅ job that auto-confirms pending bookings past the deadline (Node.js cron works too) |
| Barber can accept/cancel | Validates status values | `enum` of statuses | ✅ only the booking's barber; update with condition `status: "pending"` so a late cancel cannot override a confirmed booking | – |
| Cancellation requires a reason | ✅ `minLength: 1` validator | ✅ `required` | ✅ trim and reject blank/whitespace reasons | – |
| Cancellation creates audit record | Unique index on `booking` (max one log) | `required` fields | ✅ creates the `cancellationLogs` document with the status change | – |
| Deposit = 30% / remaining = 70% | Type checks only | `min: 0` | ✅ calculates amounts | – |
| Payment status separate from booking status | Separate collections, both with enums | ✅ two separate enums | ✅ updates each independently | – |
| Refund may be pending | Validates refund status | `enum` | ✅ sets pending, updates when provider confirms | optional: provider webhook flow |
| Reminder 30 min before | `scheduledFor` + index | – | ✅ creates reminder record | ✅ sends WhatsApp at T-30; skips if booking is no longer valid |
| Review only after completed | One review per booking (unique index) | – | ✅ checks `status === "completed"` | – |
| Loyalty points after completed | Unique `customer` | `min: 0` balance | ✅ calculates and adds points | – |
| AI feature optional / paid | – | `aiFeatureUnlocked` boolean | ✅ checks unlock before calling AI | – |
| Negative review alert to owner | Stores `sentiment` | `enum` | ✅ creates `negative_review_alert` notification | optional: sentiment analysis step |

Rule of thumb used: MongoDB/Mongoose protect **shape and allowed values**; anything needing **time, other documents or outside services** lives in Node.js or automation.

## 9. Indexes

Created by `npm run setup` (the `_id` index exists automatically).

| Collection | Index | Reason |
|---|---|---|
| users | `phone` (unique) | OTP login lookup, no duplicate accounts |
| users | `email` (unique, sparse) | Optional email must be unique when present |
| users | `role` | List by role |
| salons | `owner` | Owner dashboard |
| salons | `area + isActive` | "Show salons in this area" |
| barbers | `user` (unique) | One barber profile per user |
| barbers | `salon + status` | Barber list / online staff for a salon |
| services | `salon + isActive` | Service list for a salon |
| bookings | `customer + appointmentStart` | Customer booking history |
| bookings | `barber + appointmentStart + status` | Barber schedule and slot-availability check |
| bookings | `salon + appointmentStart + status` | Owner dashboard / reports |
| bookings | `status + decisionDeadline` | Find pending bookings past the 10-minute window |
| payments | `booking` (unique, sparse) | Payment of a booking |
| payments | `customer` | Customer payments |
| payments | `salon + status + createdAt` | Revenue reports |
| reviews | `booking` (unique) | One review per booking |
| reviews | `salon + createdAt`, `barber`, `customer` | Review lists |
| loyaltyPoints | `customer` (unique) | One record per customer |
| cancellationLogs | `booking` (unique) | One audit record per booking |
| cancellationLogs | `salon + createdAt`, `cancelledBy` | Owner views logs |
| notifications | `user + createdAt` | User's notifications |
| notifications | `status + scheduledFor` | Reminder job: "what is due now?" |
| aiRecommendations | `customer + createdAt`, `booking` | Customer history; barber opens suggestions for an appointment |

## 10. ERD

```mermaid
erDiagram
    USERS ||--o{ SALONS : "owns"
    USERS ||--o| BARBERS : "has profile"
    SALONS ||--o{ BARBERS : "employs"
    SALONS ||--o{ SERVICES : "offers"
    USERS ||--o{ BOOKINGS : "customer books"
    SALONS ||--o{ BOOKINGS : "receives"
    BARBERS ||--o{ BOOKINGS : "assigned to"
    BOOKINGS ||--o| PAYMENTS : "paid by"
    BOOKINGS ||--o| REVIEWS : "reviewed in"
    BOOKINGS ||--o| CANCELLATION_LOGS : "audited by"
    BOOKINGS ||--o{ NOTIFICATIONS : "triggers"
    BOOKINGS ||--o{ AI_RECOMMENDATIONS : "has"
    USERS ||--o| LOYALTY_POINTS : "earns"
    USERS ||--o{ NOTIFICATIONS : "receives"
    USERS ||--o{ AI_RECOMMENDATIONS : "requests"

    USERS {
        ObjectId _id PK
        string name
        string phone UK
        string role "customer|barber|owner"
    }
    SALONS {
        ObjectId _id PK
        ObjectId owner FK
        string name
        string area
    }
    BARBERS {
        ObjectId _id PK
        ObjectId user FK
        ObjectId salon FK
        string status
    }
    SERVICES {
        ObjectId _id PK
        ObjectId salon FK
        string name
        number price
        number durationMinutes
    }
    BOOKINGS {
        ObjectId _id PK
        ObjectId customer FK
        ObjectId salon FK
        ObjectId barber FK
        date appointmentStart
        number totalAmount
        number depositAmount
        string status
    }
    PAYMENTS {
        ObjectId _id PK
        ObjectId booking FK
        string status
        number depositAmount
        object refund
    }
    REVIEWS {
        ObjectId _id PK
        ObjectId booking FK
        number rating
        string sentiment
    }
    LOYALTY_POINTS {
        ObjectId _id PK
        ObjectId customer FK
        number balance
    }
    CANCELLATION_LOGS {
        ObjectId _id PK
        ObjectId booking FK
        string reason
        string cancelledByRole
    }
    NOTIFICATIONS {
        ObjectId _id PK
        ObjectId user FK
        string type
        string status
    }
    AI_RECOMMENDATIONS {
        ObjectId _id PK
        ObjectId customer FK
        ObjectId booking FK
        string faceShape
    }
```

## 11. Data Dictionary

Automatic fields on every collection: `_id` (ObjectId), `createdAt` and `updatedAt` (Date; only `createdAt` for `cancellationLogs` and `aiRecommendations`). Dotted names (e.g. `services.name`) are fields inside an embedded array/object.

| Collection | Field | Type | Required | Reference | Description |
|---|---|---|---|---|---|
| users | name | String | Yes | – | Full name |
| users | phone | String | Yes (unique) | – | Phone number used for OTP login, e.g. `+923001234567` |
| users | email | String | No (unique if set) | – | Optional email |
| users | role | String enum | Yes | – | `customer`, `barber`, `owner` |
| users | isPhoneVerified | Boolean | No (default false) | – | Set true after OTP succeeds |
| users | isActive | Boolean | No (default true) | – | Account enabled |
| salons | owner | ObjectId | Yes | users | Salon owner |
| salons | name | String | Yes | – | Salon name |
| salons | description | String | No | – | Profile text |
| salons | area | String | Yes | – | Area used for search, e.g. North Nazimabad |
| salons | address | String | No | – | Street address |
| salons | city | String | No (default Karachi) | – | City |
| salons | phone | String | No | – | Salon contact number |
| salons | totalChairs | Number | No (default 0) | – | Number of chairs managed by the owner |
| salons | isActive | Boolean | No (default true) | – | Salon visible in search |
| barbers | user | ObjectId | Yes (unique) | users | The barber's user account |
| barbers | salon | ObjectId | Yes | salons | Salon the barber works at |
| barbers | status | String enum | No (default unavailable) | – | `available`, `unavailable` |
| barbers | inviteStatus | String enum | No (default invited) | – | `invited`, `active` |
| barbers | chairNumber | Number | No | – | Chair assigned by the owner |
| services | salon | ObjectId | Yes | salons | Salon offering the service |
| services | name | String | Yes | – | Service name |
| services | price | Number | Yes | – | Price in Rs. |
| services | durationMinutes | Number | Yes | – | Estimated duration |
| services | isActive | Boolean | No (default true) | – | Service available for booking |
| bookings | customer | ObjectId | Yes | users | Customer who booked |
| bookings | salon | ObjectId | Yes | salons | Salon |
| bookings | barber | ObjectId | Yes | barbers | Selected barber |
| bookings | services | Array (≥1) | Yes | – | Embedded snapshot of booked services |
| bookings | services.service | ObjectId | Yes | services | Original service |
| bookings | services.name | String | Yes | – | Name at time of booking |
| bookings | services.price | Number | Yes | – | Price at time of booking |
| bookings | services.durationMinutes | Number | Yes | – | Duration at time of booking |
| bookings | appointmentStart | Date | Yes | – | Appointment start time |
| bookings | appointmentEnd | Date | Yes | – | Start + total duration (slot checks) |
| bookings | totalAmount | Number | Yes | – | Service total, Rs. |
| bookings | depositAmount | Number | Yes | – | 30% of total |
| bookings | remainingAmount | Number | Yes | – | 70%, paid at the salon |
| bookings | status | String enum | Yes (default pending) | – | `pending`, `confirmed`, `cancelled`, `in_progress`, `completed` |
| bookings | decisionDeadline | Date | Yes | – | Created time + 10 minutes |
| bookings | confirmedAt | Date | No | – | When confirmed |
| bookings | autoConfirmed | Boolean | No (default false) | – | True if confirmed by the system after 10 minutes |
| bookings | startedAt | Date | No | – | Haircut started |
| bookings | completedAt | Date | No | – | Haircut completed |
| bookings | aiFeatureUnlocked | Boolean | No (default false) | – | AI hairstyle feature unlocked for this appointment |
| payments | booking | ObjectId | No (unique if set) | bookings | Related booking |
| payments | customer | ObjectId | Yes | users | Payer |
| payments | salon | ObjectId | Yes | salons | Salon receiving the money (reports) |
| payments | provider | String enum | Yes | – | `jazzcash`, `easypaisa` |
| payments | totalAmount | Number | Yes | – | Service total |
| payments | depositAmount | Number | Yes | – | 30% deposit |
| payments | remainingAmount | Number | Yes | – | 70% remaining |
| payments | status | String enum | Yes (default pending) | – | `pending`, `deposit_paid`, `fully_paid`, `refund_pending`, `refunded`, `failed` |
| payments | depositReference | String | No | – | Provider payment reference |
| payments | depositPaidAt | Date | No | – | Deposit confirmation time |
| payments | remainingPaidAt | Date | No | – | Remaining amount collected at salon |
| payments | refund | Object | No | – | Refund details |
| payments | refund.amount | Number | Yes (if refund) | – | Refund amount |
| payments | refund.status | String enum | Yes (if refund) | – | `pending`, `completed`, `failed` |
| payments | refund.requestedAt | Date | No | – | Refund request time |
| payments | refund.completedAt | Date | No | – | Provider confirmation time |
| payments | refund.providerReference | String | No | – | Provider refund reference |
| reviews | booking | ObjectId | Yes (unique) | bookings | Completed booking being reviewed |
| reviews | customer | ObjectId | Yes | users | Reviewer |
| reviews | salon | ObjectId | Yes | salons | Salon reviewed |
| reviews | barber | ObjectId | Yes | barbers | Barber reviewed |
| reviews | rating | Number | Yes | – | 1 to 5 |
| reviews | comment | String | No | – | Review text |
| reviews | sentiment | String enum | No | – | `positive`, `neutral`, `negative` (after analysis) |
| loyaltyPoints | customer | ObjectId | Yes (unique) | users | Point owner |
| loyaltyPoints | balance | Number | Yes (default 0) | – | Current points |
| loyaltyPoints | history | Array | No | – | Point history |
| loyaltyPoints | history.booking | ObjectId | Yes | bookings | Booking that earned the points |
| loyaltyPoints | history.points | Number | Yes | – | Points added |
| loyaltyPoints | history.reason | String | No | – | Why points were added |
| loyaltyPoints | history.createdAt | Date | No | – | When added |
| cancellationLogs | booking | ObjectId | Yes (unique) | bookings | Cancelled booking |
| cancellationLogs | salon | ObjectId | Yes | salons | Salon (owner reports) |
| cancellationLogs | customer | ObjectId | Yes | users | Customer of the booking |
| cancellationLogs | barber | ObjectId | Yes | barbers | Barber of the booking |
| cancellationLogs | cancelledBy | ObjectId | Yes | users | User who cancelled |
| cancellationLogs | cancelledByRole | String enum | Yes | – | `customer`, `barber`, `owner` |
| cancellationLogs | reason | String | Yes (not empty) | – | Mandatory cancellation reason |
| cancellationLogs | bookingStatusBefore | String enum | Yes | – | Booking status before cancelling |
| cancellationLogs | refundRequested | Boolean | No (default false) | – | Whether a deposit refund was requested |
| cancellationLogs | refundAmount | Number | No | – | Refund amount requested |
| notifications | user | ObjectId | Yes | users | Recipient |
| notifications | booking | ObjectId | No | bookings | Related booking |
| notifications | type | String enum | Yes | – | `booking_alert`, `booking_confirmed`, `booking_cancelled`, `reminder`, `negative_review_alert`, `refund_update` |
| notifications | channel | String enum | No (default whatsapp) | – | `whatsapp`, `sms`, `in_app` |
| notifications | message | String | Yes | – | Message text |
| notifications | status | String enum | Yes (default pending) | – | `pending`, `sent`, `failed`, `skipped` |
| notifications | scheduledFor | Date | No | – | When to send (e.g. T-30 reminder) |
| notifications | sentAt | Date | No | – | When actually sent |
| aiRecommendations | customer | ObjectId | Yes | users | Customer who used the feature |
| aiRecommendations | booking | ObjectId | No | bookings | Appointment the result is attached to |
| aiRecommendations | selfieUrl | String | No | – | Link to the selfie (the image is not stored in MongoDB) |
| aiRecommendations | faceShape | String | No | – | Face-structure analysis result |
| aiRecommendations | suggestions | Array | No | – | Hairstyle suggestions |
| aiRecommendations | suggestions.name | String | Yes | – | Hairstyle name |
| aiRecommendations | suggestions.description | String | No | – | Short description |

## 12. Assumptions / Modeling Decisions

Everything below is **MODELING DECISION** – not spelled out in the Data Flow document. Please check against your FYP Proposal.

| # | Decision | Why |
|---|---|---|
| D1 | Login is phone + OTP for all roles; no password field; no `otps` collection. | Document shows OTP login for customers and an external OTP service. Owner/barber login method is not described. |
| D2 | Statuses are stored in lowercase snake_case (`in_progress`, `deposit_paid`...). | Easier to use in code; same meaning as the document's labels. |
| D3 | One `payments` document per booking holds deposit, remaining amount and refund; `booking` is optional (unique when present). | The document creates the booking only *after* the deposit succeeds, so a failed deposit attempt may have no booking yet. |
| D4 | `bookings.services` stores a snapshot (name, price, duration). | Prevents later price edits from changing past bookings and deposits. |
| D5 | `appointmentEnd`, `decisionDeadline`, `autoConfirmed` added to bookings. | Needed for slot checking, the 10-minute window and the auto-confirm rule in the document. |
| D6 | `aiFeatureUnlocked` on the booking. | Document says the feature is paid/unlocked and results attach to the appointment, but not *where* the unlock is stored. The price and unlock payment flow are not defined. |
| D7 | Barber `status` is `available` / `unavailable`; `inviteStatus` is `invited` / `active`. | Document only names "Available" and says owners "invite" barbers. |
| D8 | Chairs are `salons.totalChairs` and `barbers.chairNumber`, not a collection. | Document needs assignment and an "active chairs" count only. |
| D9 | Salon location is the text `area` + `address` (no GPS/geo index). | Document searches by selected area (e.g. North Nazimabad), not distance. |
| D10 | `cancellationLogs` stores salon, customer, barber copies of the booking links. | Owner reports filter logs by salon without joining bookings. |
| D11 | Loyalty history is embedded; point formula is not in the database (sample data uses 1 point per Rs. 100). | Document does not define the points formula or redemption. |
| D12 | `notifications.status` includes `skipped`. | Document: reminder is skipped if the booking is no longer valid. |
| D13 | No `rating` summary on salons/barbers. | Can be calculated from `reviews`; avoids duplicated data that can go out of sync. |

**Open questions for your supervisor/proposal:** points formula and redemption, price/unlock of the AI feature, how the remaining 70% is recorded (cash vs. app), whether a customer can cancel (the document only shows barber cancellation), and how owner/barber log in.

---

## What was verified

- `models.js` and `setup.js` pass a Node syntax check; the ES Module imports load correctly.
- The missing-`MONGODB_URI` message works.
- Every MongoDB validator was checked against its Mongoose schema (same fields, same collection names, same allowed values).
- The whole sample dataset (all ObjectId references, deposit maths 30%/70%) was run through Mongoose validation without errors.
- **Not tested:** the actual connection to *your* Atlas cluster (it needs your credentials) – that is the only remaining step. If it fails, use the Troubleshooting table above.
