// ============================================================
// TRIMLY - Mongoose models (all schemas in ONE file)
// ============================================================
// Source of truth: "Trimly - App Data Flow" document.
// Anything marked "MODELING DECISION" is NOT spelled out in the
// document; it was added so the design is complete. See README.
//
// Relationships use ObjectId references ("ref") so each document
// stays small and data is never copied around by accident.
// The only embedded data is small data that always travels with
// its parent (booking service snapshot, loyalty history, AI suggestions).
// ============================================================

import mongoose from "mongoose";

// setup.js creates the collections (with validators) and indexes ITSELF, in a
// clear order. So we switch off Mongoose's automatic versions of that work.
// (Your real backend can remove these two lines later if it prefers.)
mongoose.set("autoCreate", false);
mongoose.set("autoIndex", false);

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

// ------------------------------------------------------------
// Allowed values (enums). Exported so setup.js can reuse them
// for the MongoDB validators and keep both in sync.
// ------------------------------------------------------------
export const ENUMS = {
  userRole: ["customer", "barber", "owner"],
  barberStatus: ["available", "unavailable"], // MODELING DECISION: doc only names "Available"
  barberInviteStatus: ["invited", "active"], // MODELING DECISION: owner "invites" barbers
  bookingStatus: ["pending", "confirmed", "cancelled", "in_progress", "completed"],
  paymentStatus: ["pending", "deposit_paid", "fully_paid", "refund_pending", "refunded", "failed"],
  paymentProvider: ["jazzcash", "easypaisa"],
  refundStatus: ["pending", "completed", "failed"], // MODELING DECISION
  sentiment: ["positive", "neutral", "negative"],
  notificationType: [
    "booking_alert", // new booking -> barber
    "booking_confirmed", // -> customer
    "booking_cancelled", // -> customer
    "reminder", // 30 min before appointment
    "negative_review_alert", // -> salon owner
    "refund_update", // -> customer
  ],
  notificationChannel: ["whatsapp", "sms", "in_app"],
  notificationStatus: ["pending", "sent", "failed", "skipped"], // "skipped" = booking no longer valid
};

// ------------------------------------------------------------
// 1. USERS  - customer, barber and salon owner accounts
// ------------------------------------------------------------
// MODELING DECISION: login is phone + OTP (the doc shows OTP login for the
// customer), so there is NO password field. The OTP itself lives in the external
// OTP service, so there is no "otps" collection.
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true }, // e.g. +923001234567
    email: { type: String, trim: true, lowercase: true }, // optional
    role: { type: String, enum: ENUMS.userRole, required: true },
    isPhoneVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
userSchema.index({ email: 1 }, { unique: true, sparse: true }); // unique only when email exists
userSchema.index({ role: 1 });

// ------------------------------------------------------------
// 2. SALONS - name, location and profile (owner manages it)
// ------------------------------------------------------------
const salonSchema = new Schema(
  {
    owner: { type: ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    area: { type: String, required: true, trim: true }, // customer picks an area, e.g. "North Nazimabad"
    address: { type: String, trim: true },
    city: { type: String, default: "Karachi", trim: true },
    phone: { type: String, trim: true },
    totalChairs: { type: Number, min: 0, default: 0 }, // owner manages chairs
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
salonSchema.index({ owner: 1 });
salonSchema.index({ area: 1, isActive: 1 }); // "show salons in this area"

// ------------------------------------------------------------
// 3. BARBERS - profile, availability and salon assignment
// ------------------------------------------------------------
const barberSchema = new Schema(
  {
    user: { type: ObjectId, ref: "User", required: true, unique: true }, // one barber profile per user
    salon: { type: ObjectId, ref: "Salon", required: true },
    status: { type: String, enum: ENUMS.barberStatus, default: "unavailable" },
    inviteStatus: { type: String, enum: ENUMS.barberInviteStatus, default: "invited" },
    chairNumber: { type: Number, min: 1 }, // owner assigns chairs
  },
  { timestamps: true }
);
barberSchema.index({ salon: 1, status: 1 }); // "online staff" + barber list for a salon

// ------------------------------------------------------------
// 4. SERVICES - name, price, estimated duration (belongs to a salon)
// ------------------------------------------------------------
const serviceSchema = new Schema(
  {
    salon: { type: ObjectId, ref: "Salon", required: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 }, // Rs.
    durationMinutes: { type: Number, required: true, min: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
serviceSchema.index({ salon: 1, isActive: 1 });

// ------------------------------------------------------------
// 5. BOOKINGS - customer, barber, salon, services, time, status
// ------------------------------------------------------------
// Booking status and payment status are SEPARATE (payment status lives
// in the payments collection).
// Rules checked by Node.js (not MongoDB): 60-min advance booking, slot
// availability, 10-min decision window, 30% deposit calculation.
const bookingServiceSchema = new Schema(
  {
    service: { type: ObjectId, ref: "Service", required: true },
    // MODELING DECISION: name/price/duration are copied ("snapshot") so that a later
    // price change in the salon never changes an old booking or its deposit.
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    durationMinutes: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const bookingSchema = new Schema(
  {
    customer: { type: ObjectId, ref: "User", required: true },
    salon: { type: ObjectId, ref: "Salon", required: true },
    barber: { type: ObjectId, ref: "Barber", required: true },
    services: { type: [bookingServiceSchema], validate: (v) => v.length > 0 }, // at least one
    appointmentStart: { type: Date, required: true },
    appointmentEnd: { type: Date, required: true }, // start + total service duration (used for slot checks)
    totalAmount: { type: Number, required: true, min: 0 }, // Rs.
    depositAmount: { type: Number, required: true, min: 0 }, // 30% of total
    remainingAmount: { type: Number, required: true, min: 0 }, // 70%, paid at the salon
    status: { type: String, enum: ENUMS.bookingStatus, default: "pending" },
    decisionDeadline: { type: Date, required: true }, // created time + 10 minutes
    confirmedAt: { type: Date },
    autoConfirmed: { type: Boolean, default: false }, // doc: system can auto-confirm after 10 minutes
    startedAt: { type: Date },
    completedAt: { type: Date },
    // MODELING DECISION: AI feature is paid/unlocked per appointment (doc: "attach result to appointment").
    aiFeatureUnlocked: { type: Boolean, default: false },
  },
  { timestamps: true }
);
bookingSchema.index({ customer: 1, appointmentStart: -1 }); // customer booking history
bookingSchema.index({ barber: 1, appointmentStart: 1, status: 1 }); // barber schedule + slot availability check
bookingSchema.index({ salon: 1, appointmentStart: -1, status: 1 }); // owner dashboard / reports
bookingSchema.index({ status: 1, decisionDeadline: 1 }); // find pending bookings past the 10-minute window

// ------------------------------------------------------------
// 6. PAYMENTS - deposit, remaining payment and refund
// ------------------------------------------------------------
// MODELING DECISION: ONE payment document per booking holds the deposit,
// the remaining 70% and the refund. "status" uses the six payment statuses
// from the document.
// "booking" is optional because the doc creates the booking only AFTER the
// deposit succeeds, so a failed deposit attempt may have no booking yet.
const refundSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ENUMS.refundStatus, default: "pending" }, // stays pending until provider confirms
    requestedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    providerReference: { type: String },
  },
  { _id: false }
);

const paymentSchema = new Schema(
  {
    booking: { type: ObjectId, ref: "Booking" },
    customer: { type: ObjectId, ref: "User", required: true },
    salon: { type: ObjectId, ref: "Salon", required: true },
    provider: { type: String, enum: ENUMS.paymentProvider, required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    depositAmount: { type: Number, required: true, min: 0 },
    remainingAmount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ENUMS.paymentStatus, default: "pending" },
    depositReference: { type: String }, // payment reference from JazzCash / Easypaisa sandbox
    depositPaidAt: { type: Date },
    remainingPaidAt: { type: Date }, // collected at the salon after the service
    refund: { type: refundSchema },
  },
  { timestamps: true }
);
paymentSchema.index({ booking: 1 }, { unique: true, sparse: true });
paymentSchema.index({ customer: 1 });
paymentSchema.index({ salon: 1, status: 1, createdAt: -1 }); // revenue reports

// ------------------------------------------------------------
// 7. REVIEWS - rating and comment (only after a completed booking)
// ------------------------------------------------------------
const reviewSchema = new Schema(
  {
    booking: { type: ObjectId, ref: "Booking", required: true, unique: true }, // one review per booking
    customer: { type: ObjectId, ref: "User", required: true },
    salon: { type: ObjectId, ref: "Salon", required: true },
    barber: { type: ObjectId, ref: "Barber", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true },
    sentiment: { type: String, enum: ENUMS.sentiment }, // filled after sentiment analysis
  },
  { timestamps: true }
);
reviewSchema.index({ salon: 1, createdAt: -1 }); // salon review list
reviewSchema.index({ barber: 1 });
reviewSchema.index({ customer: 1 });

// ------------------------------------------------------------
// 8. LOYALTY POINTS - customer points and point history
// ------------------------------------------------------------
// MODELING DECISION: one document per customer with the history embedded.
// How many points a booking earns is not defined in the doc (Node.js decides).
const loyaltyHistorySchema = new Schema(
  {
    booking: { type: ObjectId, ref: "Booking", required: true },
    points: { type: Number, required: true },
    reason: { type: String, default: "Completed appointment" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const loyaltyPointsSchema = new Schema(
  {
    customer: { type: ObjectId, ref: "User", required: true, unique: true },
    balance: { type: Number, default: 0, min: 0 },
    history: { type: [loyaltyHistorySchema], default: [] },
  },
  { timestamps: true }
);

// ------------------------------------------------------------
// 9. CANCELLATION LOGS - audit record for every cancellation
// ------------------------------------------------------------
const cancellationLogSchema = new Schema(
  {
    booking: { type: ObjectId, ref: "Booking", required: true, unique: true },
    salon: { type: ObjectId, ref: "Salon", required: true }, // so the owner can list logs per salon
    customer: { type: ObjectId, ref: "User", required: true },
    barber: { type: ObjectId, ref: "Barber", required: true },
    cancelledBy: { type: ObjectId, ref: "User", required: true },
    cancelledByRole: { type: String, enum: ENUMS.userRole, required: true },
    reason: { type: String, required: true, trim: true, minlength: 1 }, // mandatory
    bookingStatusBefore: { type: String, enum: ENUMS.bookingStatus, required: true },
    refundRequested: { type: Boolean, default: false },
    refundAmount: { type: Number, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } } // audit records are never edited
);
cancellationLogSchema.index({ salon: 1, createdAt: -1 });
cancellationLogSchema.index({ cancelledBy: 1 });

// ------------------------------------------------------------
// 10. NOTIFICATIONS - booking alerts and reminders
// ------------------------------------------------------------
// The scheduling and sending itself is done by the backend / n8n; this
// collection only records what was sent or is scheduled.
const notificationSchema = new Schema(
  {
    user: { type: ObjectId, ref: "User", required: true },
    booking: { type: ObjectId, ref: "Booking" },
    type: { type: String, enum: ENUMS.notificationType, required: true },
    channel: { type: String, enum: ENUMS.notificationChannel, default: "whatsapp" },
    message: { type: String, required: true },
    status: { type: String, enum: ENUMS.notificationStatus, default: "pending" },
    scheduledFor: { type: Date }, // e.g. appointmentStart - 30 minutes
    sentAt: { type: Date },
  },
  { timestamps: true }
);
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ status: 1, scheduledFor: 1 }); // reminder job: "what is due now?"

// ------------------------------------------------------------
// 11. AI RECOMMENDATIONS - hairstyle suggestions linked to a booking
// ------------------------------------------------------------
// The selfie is NOT stored in MongoDB, only a URL/reference to it.
const suggestionSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
  },
  { _id: false }
);

const aiRecommendationSchema = new Schema(
  {
    customer: { type: ObjectId, ref: "User", required: true },
    booking: { type: ObjectId, ref: "Booking" }, // "attached to appointment reference"
    selfieUrl: { type: String },
    faceShape: { type: String }, // face-structure analysis result
    suggestions: { type: [suggestionSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
aiRecommendationSchema.index({ customer: 1, createdAt: -1 });
aiRecommendationSchema.index({ booking: 1 }); // barber opens the suggestions for an appointment

// ------------------------------------------------------------
// Models. The 3rd argument pins the exact MongoDB collection name
// (same names used in the document).
// ------------------------------------------------------------
export const User = mongoose.model("User", userSchema, "users");
export const Salon = mongoose.model("Salon", salonSchema, "salons");
export const Barber = mongoose.model("Barber", barberSchema, "barbers");
export const Service = mongoose.model("Service", serviceSchema, "services");
export const Booking = mongoose.model("Booking", bookingSchema, "bookings");
export const Payment = mongoose.model("Payment", paymentSchema, "payments");
export const Review = mongoose.model("Review", reviewSchema, "reviews");
export const LoyaltyPoints = mongoose.model("LoyaltyPoints", loyaltyPointsSchema, "loyaltyPoints");
export const CancellationLog = mongoose.model("CancellationLog", cancellationLogSchema, "cancellationLogs");
export const Notification = mongoose.model("Notification", notificationSchema, "notifications");
export const AIRecommendation = mongoose.model("AIRecommendation", aiRecommendationSchema, "aiRecommendations");
