// ==================================================================
// Challan Backend — Single File (Express + Mongoose + MongoDB Atlas)
// Two separate collections: Inchallans & Outchallans
// ==================================================================
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://khushsoni839:ks1234@cluster0.u3hib.mongodb.net/kelwon?retryWrites=true&w=majority&appName=Cluster0";

// ==================================================================
// Middleware
// ==================================================================
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// ==================================================================
// MongoDB Connection
// ==================================================================
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGO_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📦 Database: ${conn.connection.name}`);
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
};

// ==================================================================
// Shared Product Sub-Schema
// ==================================================================
const productSchema = new mongoose.Schema(
  {
    id: { type: String },
    model: { type: String, required: true, trim: true },
    series: { type: String, required: true, trim: true },
    partName: { type: String, default: "", trim: true },
    quantity: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// Auto-compute grandTotal
const computeTotal = (products = []) =>
  products.reduce(
    (sum, p) => sum + (Number(p.quantity) || 0) * (Number(p.rate) || 0),
    0
  );

// ==================================================================
// IN CHALLAN SCHEMA  →  collection: "inchallans"
// Fields: inChallanNo, dealerName, dispatchLocFrom, fromLoc,
//         inDocketNo, receivedDate, pincode, products, notes
// ==================================================================
const inChallanSchema = new mongoose.Schema(
  {
    inChallanNo: { type: String, required: true, trim: true, index: true },
    dealerName: { type: String, required: true, trim: true, index: true },
    dispatchLocFrom: { type: String, default: "", trim: true },
    fromLoc: { type: String, default: "", trim: true },
    inDocketNo: { type: String, default: "", trim: true },
    receivedDate: { type: String, default: "" },
    pincode: { type: String, default: "" },
    products: {
      type: [productSchema],
      validate: [(v) => v.length > 0, "At least one product is required"],
    },
    notes: { type: String, default: "" },
    grandTotal: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "inchallans" }
);

inChallanSchema.index({ inChallanNo: 1 }, { unique: true });

inChallanSchema.pre("save", function (next) {
  this.grandTotal = computeTotal(this.products);
  next();
});

inChallanSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  if (update && update.products) {
    update.grandTotal = computeTotal(update.products);
  }
  next();
});

const InChallan = mongoose.model("InChallan", inChallanSchema);

// ==================================================================
// OUT CHALLAN SCHEMA  →  collection: "outchallans"
// Fields: outChallanNo, dealerName, pincode, dispatchLocTo,
//         outDocketNo, dispatchDate, products, notes
// ==================================================================
const outChallanSchema = new mongoose.Schema(
  {
    outChallanNo: { type: String, required: true, trim: true, index: true },
    dealerName: { type: String, required: true, trim: true, index: true },
    pincode: { type: String, default: "" },
    dispatchLocTo: { type: String, default: "", trim: true },
    outDocketNo: { type: String, default: "", trim: true },
    dispatchDate: { type: String, default: "" },
    products: {
      type: [productSchema],
      validate: [(v) => v.length > 0, "At least one product is required"],
    },
    notes: { type: String, default: "" },
    grandTotal: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "outchallans" }
);

outChallanSchema.index({ outChallanNo: 1 }, { unique: true });

outChallanSchema.pre("save", function (next) {
  this.grandTotal = computeTotal(this.products);
  next();
});

outChallanSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  if (update && update.products) {
    update.grandTotal = computeTotal(update.products);
  }
  next();
});

const OutChallan = mongoose.model("OutChallan", outChallanSchema);

// ==================================================================
// Helper
// ==================================================================
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ==================================================================
// Health
// ==================================================================
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🚀 Challan Backend API is running",
    endpoints: {
      "GET    /api/in/challans": "List IN challans",
      "GET    /api/in/challans/:id": "Get one IN challan",
      "POST   /api/in/challans": "Create IN challan",
      "PUT    /api/in/challans/:id": "Update IN challan",
      "DELETE /api/in/challans/:id": "Delete IN challan",
      "GET    /api/in/summary": "IN party-wise summary",

      "GET    /api/out/challans": "List OUT challans",
      "GET    /api/out/challans/:id": "Get one OUT challan",
      "POST   /api/out/challans": "Create OUT challan",
      "PUT    /api/out/challans/:id": "Update OUT challan",
      "DELETE /api/out/challans/:id": "Delete OUT challan",
      "GET    /api/out/summary": "OUT party-wise summary",
    },
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "OK",
    dbState: mongoose.connection.readyState,
    time: new Date().toISOString(),
  });
});

// ==================================================================
// 🟢 IN CHALLAN ROUTES
// ==================================================================

// List IN
app.get(
  "/api/in/challans",
  asyncHandler(async (req, res) => {
    const { dealer, challanNo } = req.query;
    const filter = {};
    if (dealer) filter.dealerName = new RegExp(dealer, "i");
    if (challanNo) filter.inChallanNo = new RegExp(challanNo, "i");

    const data = await InChallan.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, count: data.length, data });
  })
);

// Get one IN
app.get(
  "/api/in/challans/:id",
  asyncHandler(async (req, res) => {
    const doc = await InChallan.findById(req.params.id);
    if (!doc)
      return res
        .status(404)
        .json({ success: false, message: "IN Challan not found" });
    res.json({ success: true, data: doc });
  })
);

// Create IN
app.post(
  "/api/in/challans",
  asyncHandler(async (req, res) => {
    const doc = await InChallan.create(req.body);
    res.status(201).json({ success: true, data: doc });
  })
);

// Update IN
app.put(
  "/api/in/challans/:id",
  asyncHandler(async (req, res) => {
    const body = { ...req.body };
    if (body.products) body.grandTotal = computeTotal(body.products);

    const doc = await InChallan.findByIdAndUpdate(req.params.id, body, {
      new: true,
      runValidators: true,
    });
    if (!doc)
      return res
        .status(404)
        .json({ success: false, message: "IN Challan not found" });
    res.json({ success: true, data: doc });
  })
);

// Delete IN
app.delete(
  "/api/in/challans/:id",
  asyncHandler(async (req, res) => {
    const doc = await InChallan.findByIdAndDelete(req.params.id);
    if (!doc)
      return res
        .status(404)
        .json({ success: false, message: "IN Challan not found" });
    res.json({ success: true, message: "IN Challan deleted", data: doc });
  })
);

// IN Party-wise Summary
app.get(
  "/api/in/summary",
  asyncHandler(async (req, res) => {
    const summary = await InChallan.aggregate([
      { $unwind: "$products" },
      {
        $group: {
          _id: {
            party: "$dealerName",
            model: "$products.model",
            series: "$products.series",
            partName: "$products.partName", // ✅ keeps control card & pcb separate
          },
          totalQty: { $sum: "$products.quantity" },
          totalAmount: {
            $sum: { $multiply: ["$products.quantity", "$products.rate"] },
          },
          challanNos: { $addToSet: "$inChallanNo" },
        },
      },
      {
        $group: {
          _id: { party: "$_id.party", model: "$_id.model" },
          series: {
            $push: {
              series: "$_id.series",
              partName: "$_id.partName",
              totalQty: "$totalQty",
              totalAmount: "$totalAmount",
              challanNos: "$challanNos",
            },
          },
          modelTotalQty: { $sum: "$totalQty" },
          modelTotalAmount: { $sum: "$totalAmount" },
        },
      },
      {
        $group: {
          _id: "$_id.party",
          models: {
            $push: {
              model: "$_id.model",
              series: "$series",
              totalQty: "$modelTotalQty",
              totalAmount: "$modelTotalAmount",
            },
          },
          partyTotalQty: { $sum: "$modelTotalQty" },
          partyTotalAmount: { $sum: "$modelTotalAmount" },
        },
      },
      {
        $project: {
          _id: 0,
          party: "$_id",
          models: 1,
          totalQty: "$partyTotalQty",
          totalAmount: "$partyTotalAmount",
        },
      },
      { $sort: { party: 1 } },
    ]);

    const overallQty = summary.reduce((s, p) => s + p.totalQty, 0);
    const overallAmount = summary.reduce((s, p) => s + p.totalAmount, 0);

    res.json({
      success: true,
      data: summary,
      overall: { totalQty: overallQty, totalAmount: overallAmount },
    });
  })
);


// ==================================================================
// 🔴 OUT CHALLAN ROUTES
// ==================================================================

// List OUT
app.get(
  "/api/out/challans",
  asyncHandler(async (req, res) => {
    const { dealer, challanNo } = req.query;
    const filter = {};
    if (dealer) filter.dealerName = new RegExp(dealer, "i");
    if (challanNo) filter.outChallanNo = new RegExp(challanNo, "i");

    const data = await OutChallan.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, count: data.length, data });
  })
);

// Get one OUT
app.get(
  "/api/out/challans/:id",
  asyncHandler(async (req, res) => {
    const doc = await OutChallan.findById(req.params.id);
    if (!doc)
      return res
        .status(404)
        .json({ success: false, message: "OUT Challan not found" });
    res.json({ success: true, data: doc });
  })
);

// Create OUT
app.post(
  "/api/out/challans",
  asyncHandler(async (req, res) => {
    const doc = await OutChallan.create(req.body);
    res.status(201).json({ success: true, data: doc });
  })
);

// Update OUT
app.put(
  "/api/out/challans/:id",
  asyncHandler(async (req, res) => {
    const body = { ...req.body };
    if (body.products) body.grandTotal = computeTotal(body.products);

    const doc = await OutChallan.findByIdAndUpdate(req.params.id, body, {
      new: true,
      runValidators: true,
    });
    if (!doc)
      return res
        .status(404)
        .json({ success: false, message: "OUT Challan not found" });
    res.json({ success: true, data: doc });
  })
);

// Delete OUT
app.delete(
  "/api/out/challans/:id",
  asyncHandler(async (req, res) => {
    const doc = await OutChallan.findByIdAndDelete(req.params.id);
    if (!doc)
      return res
        .status(404)
        .json({ success: false, message: "OUT Challan not found" });
    res.json({ success: true, message: "OUT Challan deleted", data: doc });
  })
);

// OUT Party-wise Summary
app.get(
  "/api/out/summary",
  asyncHandler(async (req, res) => {
    const summary = await OutChallan.aggregate([
      { $unwind: "$products" },
      {
        $group: {
          _id: {
            party: "$dealerName",
            model: "$products.model",
            series: "$products.series",
            partName: "$products.partName", // ✅ keeps control card & pcb separate
          },
          totalQty: { $sum: "$products.quantity" },
          totalAmount: {
            $sum: { $multiply: ["$products.quantity", "$products.rate"] },
          },
          challanNos: { $addToSet: "$outChallanNo" },
        },
      },
      {
        $group: {
          _id: { party: "$_id.party", model: "$_id.model" },
          series: {
            $push: {
              series: "$_id.series",
              partName: "$_id.partName",
              totalQty: "$totalQty",
              totalAmount: "$totalAmount",
              challanNos: "$challanNos",
            },
          },
          modelTotalQty: { $sum: "$totalQty" },
          modelTotalAmount: { $sum: "$totalAmount" },
        },
      },
      {
        $group: {
          _id: "$_id.party",
          models: {
            $push: {
              model: "$_id.model",
              series: "$series",
              totalQty: "$modelTotalQty",
              totalAmount: "$modelTotalAmount",
            },
          },
          partyTotalQty: { $sum: "$modelTotalQty" },
          partyTotalAmount: { $sum: "$modelTotalAmount" },
        },
      },
      {
        $project: {
          _id: 0,
          party: "$_id",
          models: 1,
          totalQty: "$partyTotalQty",
          totalAmount: "$partyTotalAmount",
        },
      },
      { $sort: { party: 1 } },
    ]);

    const overallQty = summary.reduce((s, p) => s + p.totalQty, 0);
    const overallAmount = summary.reduce((s, p) => s + p.totalAmount, 0);

    res.json({
      success: true,
      data: summary,
      overall: { totalQty: overallQty, totalAmount: overallAmount },
    });
  })
);

// ==================================================================
// 📊 COMBINED VENDOR-WISE REPORT (IN + OUT side by side)
// GET /api/report/vendor-wise
// Optional query: ?vendor=ABC&from=2024-01-01&to=2024-12-31
// ==================================================================
app.get(
  "/api/report/vendor-wise",
  asyncHandler(async (req, res) => {
    const { vendor } = req.query;

    // ---------- Fetch IN challans ----------
    const inFilter = {};
    if (vendor) inFilter.dealerName = new RegExp(vendor, "i");
    const inChallans = await InChallan.find(inFilter).lean();

    // ---------- Fetch OUT challans ----------
    const outFilter = {};
    if (vendor) outFilter.dealerName = new RegExp(vendor, "i");
    const outChallans = await OutChallan.find(outFilter).lean();

    // ---------- Flatten IN into rows ----------
    const inRows = [];
    for (const c of inChallans) {
      for (const p of c.products || []) {
        inRows.push({
          vendorName: c.dealerName || "",
          engineer: c.engineer || "",
          inLocation: c.fromLoc || "",
          inDocketNo: c.inDocketNo || "",
          inChallanNo: c.inChallanNo || "",
          receivedDate: c.receivedDate || "",
          product: p.partName || "",
          inModel: `${p.model || ""} / ${p.series || ""}`,
          description: p.description || "",
          receivedQty: Number(p.quantity) || 0,
          key: `${c.dealerName}||${p.model}||${p.series}||${p.partName}`,
        });
      }
    }

    // ---------- Flatten OUT into rows ----------
    const outRows = [];
    for (const c of outChallans) {
      for (const p of c.products || []) {
        outRows.push({
          vendorName: c.dealerName || "",
          engineer: c.engineer || "",
          dispatchedLocation: c.dispatchLocTo || "",
          outDocketNo: c.outDocketNo || "",
          outChallanNo: c.outChallanNo || "",
          dispatchedDate: c.dispatchDate || "",
          product: p.partName || "",
          outModel: `${p.model || ""} / ${p.series || ""}`,
          description: p.description || "",
          dispatchedQty: Number(p.quantity) || 0,
          key: `${c.dealerName}||${p.model}||${p.series}||${p.partName}`,
        });
      }
    }

    // ---------- Merge IN + OUT by key ----------
    const map = {};

    for (const r of inRows) {
      if (!map[r.key]) {
        map[r.key] = {
          vendorName: r.vendorName,
          engineer: r.engineer,
          inLocation: r.inLocation,
          dispatchedLocation: "",
          inDocketNo: r.inDocketNo,
          outDocketNo: "",
          inChallanNo: r.inChallanNo,
          outChallanNo: "",
          receivedDate: r.receivedDate,
          dispatchedDate: "",
          product: r.product,
          inModel: r.inModel,
          outModel: "",
          description: r.description,
          receivedQty: 0,
          dispatchedQty: 0,
        };
      }
      const m = map[r.key];
      m.receivedQty += r.receivedQty;
      // Keep the earliest received date if multiple
      if (r.receivedDate && (!m.receivedDate || r.receivedDate < m.receivedDate)) {
        m.receivedDate = r.receivedDate;
      }
      // Append challan numbers if multiple
      if (m.inChallanNo && !m.inChallanNo.includes(r.inChallanNo)) {
        m.inChallanNo = `${m.inChallanNo}, ${r.inChallanNo}`;
      } else if (!m.inChallanNo) {
        m.inChallanNo = r.inChallanNo;
      }
      m.engineer = m.engineer || r.engineer;
      m.inLocation = m.inLocation || r.inLocation;
      m.inDocketNo = m.inDocketNo || r.inDocketNo;
    }

    for (const r of outRows) {
      if (!map[r.key]) {
        // OUT-only row (no matching IN)
        map[r.key] = {
          vendorName: r.vendorName,
          engineer: r.engineer,
          inLocation: "",
          dispatchedLocation: r.dispatchedLocation,
          inDocketNo: "",
          outDocketNo: r.outDocketNo,
          inChallanNo: "",
          outChallanNo: r.outChallanNo,
          receivedDate: "",
          dispatchedDate: r.dispatchedDate,
          product: r.product,
          inModel: "",
          outModel: r.outModel,
          description: r.description,
          receivedQty: 0,
          dispatchedQty: 0,
        };
      }
      const m = map[r.key];
      m.dispatchedQty += r.dispatchedQty;
      if (r.dispatchedDate && (!m.dispatchedDate || r.dispatchedDate < m.dispatchedDate)) {
        m.dispatchedDate = r.dispatchedDate;
      }
      if (m.outChallanNo && !m.outChallanNo.includes(r.outChallanNo)) {
        m.outChallanNo = `${m.outChallanNo}, ${r.outChallanNo}`;
      } else if (!m.outChallanNo) {
        m.outChallanNo = r.outChallanNo;
      }
      m.engineer = m.engineer || r.engineer;
      m.dispatchedLocation = m.dispatchedLocation || r.dispatchedLocation;
      m.outDocketNo = m.outDocketNo || r.outDocketNo;
      m.outModel = m.outModel || r.outModel;
    }

    // ---------- Convert to array ----------
    const rows = Object.values(map).map((r) => ({
      ...r,
      balanceQty: r.receivedQty - r.dispatchedQty,
    }));

    // ---------- Sort by vendor then product ----------
    rows.sort((a, b) => {
      const v = (a.vendorName || "").localeCompare(b.vendorName || "");
      if (v !== 0) return v;
      return (a.product || "").localeCompare(b.product || "");
    });

    // ---------- Totals ----------
    const totals = {
      receivedQty: rows.reduce((s, r) => s + r.receivedQty, 0),
      dispatchedQty: rows.reduce((s, r) => s + r.dispatchedQty, 0),
      balanceQty: rows.reduce((s, r) => s + r.balanceQty, 0),
    };

    res.json({ success: true, count: rows.length, data: rows, totals });
  })
);

// ==================================================================
// 404 & Error Handlers
// ==================================================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(409).json({
      success: false,
      message: `Duplicate value for ${field}. Please use a unique value.`,
      keyValue: err.keyValue,
    });
  }

  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: messages,
    });
  }

  if (err.name === "CastError") {
    return res
      .status(400)
      .json({ success: false, message: `Invalid ${err.path}: ${err.value}` });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// ==================================================================
// Start Server
// ==================================================================
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`\n📚 Routes:`);
    console.log(`   IN  →  GET/POST/PUT/DELETE  /api/in/challans`);
    console.log(`   IN  →  GET                  /api/in/summary`);
    console.log(`   OUT →  GET/POST/PUT/DELETE  /api/out/challans`);
    console.log(`   OUT →  GET                  /api/out/summary`);
    console.log("");
  });
};

process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down...");
  await mongoose.connection.close();
  console.log("✅ MongoDB closed");
  process.exit(0);
});

process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err.message);
  process.exit(1);
});

startServer();


// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');

// // === Config ===
// const PORT = 5000;
// const MONGODB_URI = 'mongodb+srv://ages27771:ages12345@cluster0.t2zpj0w.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
// // const MONGODB_URI = 'mongodb+srv://service:services1234@cluster0.wxa147v.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
// // Replace <username>, <password>, and <cluster> with your actual MongoDB Atlas credentials

// // === App Setup ===
// const app = express();
// app.use(cors());
// app.use(express.json());

// // === MongoDB Connection ===
// mongoose.connect(MONGODB_URI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true
// })
// .then(() => console.log('✅ MongoDB connected'))
// .catch(err => console.error('❌ MongoDB connection error:', err));

// // === Schemas ===
// const productSchema = new mongoose.Schema({
//   model: String,
//   product: String,
//   hsnCode: String,
//   quantity: Number,
//   price: Number,
//   igst: Number,
//   discount: Number,
//   totalAmount: Number
// });

// // : '', product: '', model: '', quantity: '', price: '', igst: '', discount: '', totalAmount: 0, initialProductState: ''

// const courierSchema = new mongoose.Schema({
//   dispatchLocation: String,
//   deleiveryNote: String,
//   dated: String,
//   docket: String,
//   buyer: String,
//   otherRef: String,
//   refernceNO: String,
//   mode: String,
//   invoiceno: String,
//   currentdate: String,
//   courierName: String,
//   termsofdeleivery: String
// });

// const invoiceSchema = new mongoose.Schema({
//   companyName: String,
//   personName: String,
//   gstuin: String,
//   address: String,
//   statename: String,
//   contactNumber: String,
//   companyFormation: String,
//   courier: courierSchema,
//   productDetails: [productSchema]
// });

// const Invoice = mongoose.model('Invoice', invoiceSchema);

// // === API Routes ===

// // GET all invoices
// app.get('/api/Chalan', async (req, res) => {
//   try {
//     const invoices = await Invoice.find();
//     res.json(invoices);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // POST a new invoice
// app.post('/api/Chalan', async (req, res) => {
//   try {
//     const invoice = new Invoice(req.body);
//     const savedInvoice = await invoice.save();
//     res.status(201).json(savedInvoice);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// // PUT update invoice by ID
// app.put('/api/Chalan/:id', async (req, res) => {
//   try {
//     const updated = await Invoice.findByIdAndUpdate(req.params.id, req.body, { new: true });
//     res.json(updated);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// // DELETE invoice by ID
// app.delete('/api/Chalan/:id', async (req, res) => {
//   try {
//     await Invoice.findByIdAndDelete(req.params.id);
//     res.json({ message: 'Invoice deleted' });
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// // === Start Server ===
// app.listen(PORT, () => {
//   console.log(`🚀 Server running at http://localhost:${PORT}`);
// });
