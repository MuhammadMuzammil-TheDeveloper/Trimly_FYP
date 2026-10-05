// ============================================================
// TRIMLY - one-command database setup
// ============================================================
// Run with:   npm run setup
//
// What it does (in order):
//   1. Loads .env and connects to MongoDB Atlas
//   2. Uses the database "trimly"
//   3. Creates the 11 collections with MongoDB validators
//      (if a collection already exists, only its validator is refreshed)
//   4. Creates indexes
//   5. Inserts sample (fictional) data - ONLY if it is not there yet
//
// SAFETY: this script never drops the database and never deletes
// documents. It is safe to run more than once.
// ============================================================

import "dotenv/config";
 // loads MONGODB_URI from the .env file
 import { setServers } from "dns";
setServers(["8.8.8.8", "1.1.1.1"]);

import mongoose from "mongoose";
import {
  ENUMS,
  User,
  Salon,
  Barber,
  Service,
  Booking,
  Payment,
  Review,
  LoyaltyPoints,
  CancellationLog,
  Notification,
  AIRecommendation,
} from "./models.js";

const DB_NAME = "trimly";
const line = "========================================";

// ------------------------------------------------------------
// MongoDB validators ($jsonSchema)
// These are a safety net inside the database: required fields,
// data types and allowed values. Business rules (60-minute rule,
// slot availability, 30% maths...) stay in the Node.js backend.
// ------------------------------------------------------------
const oid = { bsonType: "objectId" };
const str = { bsonType: "string" };
const num = { bsonType: "number" };
const date = { bsonType: "date" };
const bool = { bsonType: "bool" };
const oneOf = (values) => ({ bsonType: "string", enum: values });

const validators = {
  users: {
    required: ["name", "phone", "role"],
    properties: {
      name: str,
      phone: str,
      email: str,
      role: oneOf(ENUMS.userRole),
      isPhoneVerified: bool,
      isActive: bool,
    },
  },
  salons: {
    required: ["owner", "name", "area"],
    properties: {
      owner: oid,
      name: str,
      description: str,
      area: str,
      address: str,
      city: str,
      phone: str,
      totalChairs: num,
      isActive: bool,
    },
  },
  barbers: {
    required: ["user", "salon"],
    properties: {
      user: oid,
      salon: oid,
      status: oneOf(ENUMS.barberStatus),
      inviteStatus: oneOf(ENUMS.barberInviteStatus),
      chairNumber: num,
    },
  },
  services: {
    required: ["salon", "name", "price", "durationMinutes"],
    properties: {
      salon: oid,
      name: str,
      price: num,
      durationMinutes: num,
      isActive: bool,
    },
  },
  bookings: {
    required: [
      "customer",
      "salon",
      "barber",
      "services",
      "appointmentStart",
      "appointmentEnd",
      "totalAmount",
      "depositAmount",
      "remainingAmount",
      "status",
      "decisionDeadline",
    ],
    properties: {
      customer: oid,
      salon: oid,
      barber: oid,
      services: {
        bsonType: "array",
        minItems: 1,
        items: {
          bsonType: "object",
          required: ["service", "name", "price", "durationMinutes"],
          properties: {
            service: oid,
            name: str,
            price: num,
            durationMinutes: num,
          },
        },
      },
      appointmentStart: date,
      appointmentEnd: date,
      totalAmount: num,
      depositAmount: num,
      remainingAmount: num,
      status: oneOf(ENUMS.bookingStatus),
      decisionDeadline: date,
      confirmedAt: date,
      autoConfirmed: bool,
      startedAt: date,
      completedAt: date,
      aiFeatureUnlocked: bool,
    },
  },
  payments: {
    required: [
      "customer",
      "salon",
      "provider",
      "totalAmount",
      "depositAmount",
      "remainingAmount",
      "status",
    ],
    properties: {
      booking: oid,
      customer: oid,
      salon: oid,
      provider: oneOf(ENUMS.paymentProvider),
      totalAmount: num,
      depositAmount: num,
      remainingAmount: num,
      status: oneOf(ENUMS.paymentStatus),
      depositReference: str,
      depositPaidAt: date,
      remainingPaidAt: date,
      refund: {
        bsonType: "object",
        required: ["amount", "status"],
        properties: {
          amount: num,
          status: oneOf(ENUMS.refundStatus),
          requestedAt: date,
          completedAt: date,
          providerReference: str,
        },
      },
    },
  },
  reviews: {
    required: ["booking", "customer", "salon", "barber", "rating"],
    properties: {
      booking: oid,
      customer: oid,
      salon: oid,
      barber: oid,
      rating: { bsonType: "number", minimum: 1, maximum: 5 },
      comment: str,
      sentiment: oneOf(ENUMS.sentiment),
    },
  },
  loyaltyPoints: {
    required: ["customer", "balance"],
    properties: {
      customer: oid,
      balance: { bsonType: "number", minimum: 0 },
      history: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["booking", "points"],
          properties: {
            booking: oid,
            points: num,
            reason: str,
            createdAt: date,
          },
        },
      },
    },
  },
  cancellationLogs: {
    required: [
      "booking",
      "salon",
      "customer",
      "barber",
      "cancelledBy",
      "cancelledByRole",
      "reason",
      "bookingStatusBefore",
    ],
    properties: {
      booking: oid,
      salon: oid,
      customer: oid,
      barber: oid,
      cancelledBy: oid,
      cancelledByRole: oneOf(ENUMS.userRole),
      reason: { bsonType: "string", minLength: 1 }, // reason is mandatory
      bookingStatusBefore: oneOf(ENUMS.bookingStatus),
      refundRequested: bool,
      refundAmount: num,
    },
  },
  notifications: {
    required: ["user", "type", "message", "status"],
    properties: {
      user: oid,
      booking: oid,
      type: oneOf(ENUMS.notificationType),
      channel: oneOf(ENUMS.notificationChannel),
      message: str,
      status: oneOf(ENUMS.notificationStatus),
      scheduledFor: date,
      sentAt: date,
    },
  },
  aiRecommendations: {
    required: ["customer"],
    properties: {
      customer: oid,
      booking: oid,
      selfieUrl: str,
      faceShape: str,
      suggestions: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["name"],
          properties: { name: str, description: str },
        },
      },
    },
  },
};

// ------------------------------------------------------------
// Step helpers
// ------------------------------------------------------------
async function createCollections(db) {
  const existing = (await db.listCollections().toArray()).map((c) => c.name);

  for (const [name, schema] of Object.entries(validators)) {
    const validator = { $jsonSchema: { bsonType: "object", ...schema } };

    if (existing.includes(name)) {
      // Already there: just refresh the validator. Documents are untouched.
      await db.command({
        collMod: name,
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
      console.log(`✓ ${name} (already existed - validator updated)`);
    } else {
      await db.createCollection(name, {
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
      console.log(`✓ ${name}`);
    }
  }
}

async function createIndexes() {
  // Index definitions live next to each schema in models.js.
  // createIndexes() only ADDS missing indexes; it never removes any.
  const models = [
    User,
    Salon,
    Barber,
    Service,
    Booking,
    Payment,
    Review,
    LoyaltyPoints,
    CancellationLog,
    Notification,
    AIRecommendation,
  ];
  for (const model of models) {
    await model.createIndexes();
  }
  console.log("✓ Done");
}

// Sample data is fictional. Phone numbers use made-up numbers.
const DEMO_OWNER_PHONE = "+923001110001"; // used to detect "demo data already inserted"

async function insertSampleData() {
  const alreadyThere = await User.findOne({ phone: DEMO_OWNER_PHONE });
  if (alreadyThere) {
    console.log(
      "• Sample data already exists - skipped (nothing was duplicated).",
    );
    return;
  }

  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const now = Date.now();
  const at = (ms) => new Date(ms);

  // ---- Users (3 roles) ----
  const owner = await User.create({
    name: "Imran Qureshi",
    phone: DEMO_OWNER_PHONE,
    email: "imran.owner@example.com",
    role: "owner",
    isPhoneVerified: true,
  });
  const barberUser1 = await User.create({
    name: "Usman Ali",
    phone: "+923001110002",
    role: "barber",
    isPhoneVerified: true,
  });
  const barberUser2 = await User.create({
    name: "Danish Sheikh",
    phone: "+923001110003",
    role: "barber",
    isPhoneVerified: true,
  });
  const customer1 = await User.create({
    name: "Ahmed Raza",
    phone: "+923001110004",
    email: "ahmed.raza@example.com",
    role: "customer",
    isPhoneVerified: true,
  });
  const customer2 = await User.create({
    name: "Bilal Siddiqui",
    phone: "+923001110005",
    role: "customer",
    isPhoneVerified: true,
  });

  // ---- Salon, barbers, services ----
  const salon = await Salon.create({
    owner: owner._id,
    name: "Style Studio",
    description: "Modern men's salon - haircuts, beard styling and grooming.",
    area: "North Nazimabad",
    address: "Block H, North Nazimabad, Karachi",
    phone: "+922135000001",
    totalChairs: 4,
  });

  const barber1 = await Barber.create({
    user: barberUser1._id,
    salon: salon._id,
    status: "available",
    inviteStatus: "active",
    chairNumber: 1,
  });
  const barber2 = await Barber.create({
    user: barberUser2._id,
    salon: salon._id,
    status: "available",
    inviteStatus: "active",
    chairNumber: 2,
  });

  const haircut = await Service.create({
    salon: salon._id,
    name: "Haircut",
    price: 1200,
    durationMinutes: 40,
  });
  const beard = await Service.create({
    salon: salon._id,
    name: "Beard Trim",
    price: 800,
    durationMinutes: 20,
  });
  await Service.create({
    salon: salon._id,
    name: "Hair Wash & Styling",
    price: 500,
    durationMinutes: 15,
  });

  // Snapshot helper (copies name/price/duration into the booking)
  const snap = (s) => ({
    service: s._id,
    name: s.name,
    price: s.price,
    durationMinutes: s.durationMinutes,
  });

  // ---- Booking 1: COMPLETED (Haircut + Beard = Rs. 2000, deposit Rs. 600, remaining Rs. 1400) ----
  const start1 = now - 2 * DAY;
  const made1 = start1 - DAY;
  const booking1 = await Booking.create({
    customer: customer1._id,
    salon: salon._id,
    barber: barber1._id,
    services: [snap(haircut), snap(beard)],
    appointmentStart: at(start1),
    appointmentEnd: at(start1 + 60 * MIN),
    totalAmount: 2000,
    depositAmount: 600,
    remainingAmount: 1400,
    status: "completed",
    decisionDeadline: at(made1 + 10 * MIN),
    confirmedAt: at(made1 + 4 * MIN),
    startedAt: at(start1 + 2 * MIN),
    completedAt: at(start1 + 58 * MIN),
    aiFeatureUnlocked: true,
  });

  const payment1 = await Payment.create({
    booking: booking1._id,
    customer: customer1._id,
    salon: salon._id,
    provider: "jazzcash",
    totalAmount: 2000,
    depositAmount: 600,
    remainingAmount: 1400,
    status: "fully_paid",
    depositReference: "JC-SANDBOX-0001",
    depositPaidAt: at(made1),
    remainingPaidAt: at(start1 + 60 * MIN),
  });

  // Review + sentiment (positive -> no alert for the owner)
  const review1 = await Review.create({
    booking: booking1._id,
    customer: customer1._id,
    salon: salon._id,
    barber: barber1._id,
    rating: 5,
    comment: "Great haircut and very professional service.",
    sentiment: "positive",
  });

  // Loyalty points (sample rule: 1 point per Rs. 100 - real rule is decided in the backend)
  await LoyaltyPoints.create({
    customer: customer1._id,
    balance: 20,
    history: [
      {
        booking: booking1._id,
        points: 20,
        reason: "Completed appointment",
        createdAt: at(start1 + 60 * MIN),
      },
    ],
  });

  // AI hairstyle recommendation attached to the appointment
  await AIRecommendation.create({
    customer: customer1._id,
    booking: booking1._id,
    selfieUrl: "https://example.com/demo/selfie-ahmed.jpg",
    faceShape: "Oval",
    suggestions: [
      {
        name: "Textured Crop",
        description: "Short sides with a textured top.",
      },
      {
        name: "Classic Side Part",
        description: "Clean, neat and easy to maintain.",
      },
    ],
  });

  await Notification.create({
    user: barberUser1._id,
    booking: booking1._id,
    type: "booking_alert",
    channel: "whatsapp",
    message:
      "New booking from Ahmed Raza. Please accept or cancel within 10 minutes.",
    status: "sent",
    sentAt: at(made1),
  });

  // ---- Booking 2: CANCELLED by the barber (Haircut = Rs. 1200, deposit Rs. 360) ----
  const start2 = now + 2 * DAY;
  const made2 = now - 3 * HOUR;
  const booking2 = await Booking.create({
    customer: customer2._id,
    salon: salon._id,
    barber: barber2._id,
    services: [snap(haircut)],
    appointmentStart: at(start2),
    appointmentEnd: at(start2 + 40 * MIN),
    totalAmount: 1200,
    depositAmount: 360,
    remainingAmount: 840,
    status: "cancelled",
    decisionDeadline: at(made2 + 10 * MIN),
  });

  await Payment.create({
    booking: booking2._id,
    customer: customer2._id,
    salon: salon._id,
    provider: "easypaisa",
    totalAmount: 1200,
    depositAmount: 360,
    remainingAmount: 840,
    status: "refund_pending", // payment status is separate from booking status
    depositReference: "EP-SANDBOX-0002",
    depositPaidAt: at(made2),
    refund: {
      amount: 360,
      status: "pending",
      requestedAt: at(made2 + 5 * MIN),
    },
  });

  await CancellationLog.create({
    booking: booking2._id,
    salon: salon._id,
    customer: customer2._id,
    barber: barber2._id,
    cancelledBy: barberUser2._id,
    cancelledByRole: "barber",
    reason: "Barber has an emergency and is not available at that time.",
    bookingStatusBefore: "pending",
    refundRequested: true,
    refundAmount: 360,
  });

  await Notification.create({
    user: customer2._id,
    booking: booking2._id,
    type: "booking_cancelled",
    channel: "whatsapp",
    message:
      "Your booking was cancelled by the barber. Your Rs. 360 deposit refund is pending.",
    status: "sent",
    sentAt: at(made2 + 5 * MIN),
  });

  // ---- Booking 3: CONFIRMED, upcoming (Beard Trim = Rs. 800, deposit Rs. 240) ----
  const start3 = now + DAY;
  const made3 = now - 1 * HOUR;
  const booking3 = await Booking.create({
    customer: customer1._id,
    salon: salon._id,
    barber: barber1._id,
    services: [snap(beard)],
    appointmentStart: at(start3),
    appointmentEnd: at(start3 + 20 * MIN),
    totalAmount: 800,
    depositAmount: 240,
    remainingAmount: 560,
    status: "confirmed",
    decisionDeadline: at(made3 + 10 * MIN),
    confirmedAt: at(made3 + 10 * MIN),
    autoConfirmed: true, // barber did not respond within 10 minutes
  });

  await Payment.create({
    booking: booking3._id,
    customer: customer1._id,
    salon: salon._id,
    provider: "jazzcash",
    totalAmount: 800,
    depositAmount: 240,
    remainingAmount: 560,
    status: "deposit_paid",
    depositReference: "JC-SANDBOX-0003",
    depositPaidAt: at(made3),
  });

  // Reminder scheduled for 30 minutes before the appointment
  await Notification.create({
    user: customer1._id,
    booking: booking3._id,
    type: "reminder",
    channel: "whatsapp",
    message: "Reminder: your Beard Trim at Style Studio starts in 30 minutes.",
    status: "pending",
    scheduledFor: at(start3 - 30 * MIN),
  });

  console.log("✓ Done");
  console.log(
    "  (users, salon, barbers, services, 3 bookings, payments, review,",
  );
  console.log(
    "   loyalty record, cancellation log, notifications, AI recommendation)",
  );
}

// ------------------------------------------------------------
// Friendly messages for the most common beginner errors
// ------------------------------------------------------------
function explainError(err) {
  const msg = String(err?.message || err);
  if (err?.code === 11000)
    return "Duplicate key error: a record with the same unique value (for example the same phone number) already exists.";
  if (err?.code === 121 || /Document failed validation/i.test(msg))
    return "Validation error: a document did not match the collection rules (missing field or wrong value).";
  if (/bad auth|authentication failed/i.test(msg))
    return "Authentication failed: the database username or password in MONGODB_URI is wrong.";
  if (/ENOTFOUND|querySrv|EREFUSED/i.test(msg))
    return "DNS error: the cluster address in MONGODB_URI could not be found. Check the connection string and your internet.";
  if (
    /Invalid scheme|Invalid connection string|must be escaped|Invalid URL/i.test(
      msg,
    )
  )
    return "Invalid connection string: copy it again from MongoDB Atlas (it must start with mongodb+srv://). Special characters in the password must be URL-encoded.";
  if (
    /whitelist|not allowed|IP/i.test(msg) &&
    /Server selection|MongooseServerSelectionError/i.test(msg + err?.name)
  )
    return "Your IP address is probably not allowed. In Atlas open Network Access and add your IP (or 0.0.0.0/0 for development).";
  if (/timed out|timeout|Server selection/i.test(msg))
    return "Connection timeout: Atlas could not be reached. Check your internet and Atlas Network Access.";
  return null;
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
async function main() {
  console.log(line);
  console.log("TRIMLY DATABASE SETUP");
  console.log(line);
  console.log();

  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes("YOUR_MONGODB_ATLAS_CONNECTION_STRING")) {
    console.error("✗ MONGODB_URI is missing.");
    console.error(
      "  Create a file named .env (copy .env.example) and paste your Atlas connection string.",
    );
    process.exit(1);
  }

  try {
    console.log("Connecting to MongoDB Atlas...");
    // dbName forces the database to be "trimly" whatever the URI says.
    await mongoose.connect(uri, {
      dbName: DB_NAME,
      serverSelectionTimeoutMS: 15000,
    });
    console.log("✓ Connected successfully");
    console.log();
    console.log("Database:");
    console.log(DB_NAME);
    console.log();

    const db = mongoose.connection.db;

    console.log("Creating collections...");
    await createCollections(db);
    console.log();

    console.log("Creating indexes...");
    await createIndexes();
    console.log();

    console.log("Inserting sample data...");
    await insertSampleData();
    console.log();

    console.log(line);
    console.log("DATABASE READY");
    console.log(line);
    console.log();
    console.log(
      'You can now open MongoDB Atlas and see the "trimly" database.',
    );
    console.log();
    console.log(line);
  } catch (err) {
    console.error();
    console.error("✗ Setup failed.");
    const friendly = explainError(err);
    if (friendly) console.error("  " + friendly);
    console.error("  Technical message: " + (err?.message || err));
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect(); // always close the connection
  }
}

main();
