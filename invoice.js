const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

app.use(bodyParser.json({ limit: '10mb' }));
app.use(cors());

// ============================================================
// DATABASE URI (hardcoded)
// ============================================================
const dbURI = "mongodb+srv://oshan:oshan%40work1234@cluster0.2txxi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// MongoDB connection
mongoose.connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("MongoDB Connection Error:", err);
    process.exit(1);
  });

// ============================================================
// SCHEMA
// ============================================================
const taskSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  altPhone: String,
  state: String,
  city: String,
  pincode: String,
  location: String,
  landmark: String,
  product: String,
  selectedModel: Object,
  serialNumber: String,
  warrantyStatus: Object,
  purchaseDate: String,
  installationDate: String,
  status: String,
  complaintNumber: String,
  callType: String,
  additionalStatus: String,
  callSource: String,
  taskStatus: String,
  assignEngineer: String,
  contactNo: String,
  dealer: String,
  complaintNotes: String,
  enginnerNotes: String,
  customerFeedback: String,
  date: String,
  asp: String,
  aspName: String,
  actionTaken: String,
  images: [String],
}, { timestamps: true });

// ============================================================
// INDEXES
// ============================================================
taskSchema.index({ date: -1 });
taskSchema.index({ createdAt: -1 });
taskSchema.index({ status: 1 });
taskSchema.index({ taskStatus: 1 });
taskSchema.index({ assignEngineer: 1 });
taskSchema.index({ complaintNumber: 1 });
taskSchema.index({ serialNumber: 1 });
taskSchema.index({ phone: 1 });
taskSchema.index({ email: 1 });
taskSchema.index({ state: 1 });
taskSchema.index({ city: 1 });
taskSchema.index({ pincode: 1 });
taskSchema.index({ product: 1 });
taskSchema.index({ dealer: 1 });
taskSchema.index({ asp: 1 });
taskSchema.index({ callType: 1 });
taskSchema.index({ callSource: 1 });
taskSchema.index({ additionalStatus: 1 });

taskSchema.index({ date: -1, status: 1 });
taskSchema.index({ date: -1, taskStatus: 1 });
taskSchema.index({ date: -1, assignEngineer: 1 });

taskSchema.index({
  name: 'text',
  email: 'text',
  phone: 'text',
  complaintNumber: 'text',
  serialNumber: 'text',
  city: 'text',
  location: 'text',
  dealer: 'text',
  assignEngineer: 'text',
});

const Task = mongoose.model("Task", taskSchema);

// ============================================================
// HELPER: Build date range from month + year
// ============================================================
function buildDateRange(month, year) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

// ============================================================
// ROUTES
// ============================================================

// POST /tasks
app.post('/tasks', async (req, res) => {
  try {
    const task = new Task(req.body);
    await task.save();
    res.status(201).json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save task" });
  }
});

// ============================================================
// GET /tasks — Paginated + Month filter + Optional filters
// Query params: month, year, page, limit, status, search, etc.
// ============================================================
app.get('/tasks', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);

    // Hard cap at 100 per request
    const requestedLimit = parseInt(req.query.limit) || 100;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);

    const skip = (page - 1) * limit;

    const filter = {};

    // Month + Year filter
    if (req.query.month) {
      const month = parseInt(req.query.month);
      const year = parseInt(req.query.year) || new Date().getFullYear();

      if (month >= 1 && month <= 12) {
        const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
        filter.date = { $regex: `^${monthPrefix}` };
      }
    }

    // Optional equality filters
    const equalityFields = [
      'status', 'taskStatus', 'assignEngineer', 'product',
      'dealer', 'asp', 'callType', 'callSource',
      'additionalStatus', 'state', 'city', 'pincode',
    ];
    for (const field of equalityFields) {
      if (req.query[field]) {
        filter[field] = req.query[field];
      }
    }

    // Optional text search
    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }

    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Task.countDocuments(filter),
    ]);

    res.status(200).json({
      data: tasks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// ============================================================
// GET /tasks/stats/monthly — Aggregated counts by month
// ============================================================
app.get('/tasks/stats/monthly', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const yearPrefix = `${year}-`;

    const stats = await Task.aggregate([
      { $match: { date: { $regex: `^${yearPrefix}` } } },
      {
        $group: {
          _id: { $substr: ['$date', 0, 7] },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({ year, stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// PUT /tasks/:id
app.put('/tasks/:id', async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: "Failed to update task" });
  }
});

// DELETE /tasks/:id
app.delete('/tasks/:id', async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json({ message: "Task deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// ============================================================
// START SERVER
// ============================================================
const port = process.env.PORT || 5002;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));





// // /////////////////////////////////////////////////////////////
// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');
// const bodyParser = require('body-parser');

// // Initialize Express app
// const app = express();
// const PORT = 5000;

// // Middleware
// app.use(cors());  // Allow cross-origin requests
// app.use(bodyParser.json());  // Parse incoming JSON bodies

// // Mongoose model for Invoice
// const invoiceSchema = new mongoose.Schema({
//   companyName: { type: String, required: true },
//   address: { type: String, required: true },
//   contactNumber: { type: String, required: true },
//   courier: {
//     dispatchLocation: { type: String },
//     courierName: { type: String },
//     status: { type: String, default: 'pending' },
//   },
//   productDetails: [
//     {
//       description: { type: String },
//       product: { type: String },
//       model: { type: String },
//       hsnCode: { type: String },
//       quantity: { type: Number },
//       price: { type: Number },
//       igst: { type: Number },
//       cgst: { type: Number },
//       sgst: { type: Number },
//       totalAmount: { type: Number },
//     },
//   ],
//   spgsDetails: [
//     {
//       description: { type: String },
//       product: { type: String },
//       model: { type: String },
//       hsnCode: { type: String },
//       quantity: { type: Number },
//       price: { type: Number },
//       igst: { type: Number },
//       cgst: { type: Number },
//       sgst: { type: Number },
//       totalAmount: { type: Number },
//     },
//   ],
//   focDetails: [
//     {
//       description: { type: String },
//       product: { type: String },
//       model: { type: String },
//       hsnCode: { type: String },
//       quantity: { type: Number },
//       price: { type: Number },
//       igst: { type: Number },
//       cgst: { type: Number },
//       sgst: { type: Number },
//       totalAmount: { type: Number },
//     },
//   ],
//   invoiceType: { type: String, default: 'intra-state' },
// });

// // Mongoose Model for Invoice
// const Invoice = mongoose.model('Invoice', invoiceSchema);

// // Connect to MongoDB
// // mongoose.connect('mongodb+srv://khushsoni839:ks1234@cluster0.u3hib.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
// mongoose.connect('mongodb+srv://khushsoni839:ks1234@cluster0.u3hib.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// })
//   .then(() => {
//     console.log('Connected to MongoDB');
//   })
//   .catch((err) => {
//     console.error('Error connecting to MongoDB:', err);
//   });

// // GET route to fetch all invoices
// app.get('/api/invoices', async (req, res) => {
//   try {
//     const invoices = await Invoice.find();
//     res.status(200).json(invoices);
//   } catch (error) {
//     console.error('Error fetching invoices:', error);
//     res.status(500).json({ error: 'Error fetching invoices' });
//   }
// });

// // POST route to create a new invoice
// app.post('/api/invoices', async (req, res) => {
//   const { companyName, address, contactNumber, courier, productDetails, invoiceType } = req.body;

//   const newInvoice = new Invoice({
//     companyName,
//     address,
//     contactNumber,
//     courier,
//     productDetails,
//     invoiceType,
//   });

//   try {
//     const savedInvoice = await newInvoice.save();
//     res.status(201).json(savedInvoice);
//   } catch (error) {
//     console.error('Error saving invoice:', error);
//     res.status(400).json({ error: 'Error saving invoice' });
//   }
// });

// // PUT route to update an existing invoice
// app.put('/api/invoices/:id', async (req, res) => {
//   const { id } = req.params;
//   const { companyName, address, contactNumber, courier, productDetails, invoiceType } = req.body;

//   try {
//     const updatedInvoice = await Invoice.findByIdAndUpdate(
//       id,
//       { companyName, address, contactNumber, courier, productDetails, invoiceType },
//       { new: true }  // Return the updated invoice
//     );
//     res.status(200).json(updatedInvoice);
//   } catch (error) {
//     console.error('Error updating invoice:', error);
//     res.status(400).json({ error: 'Error updating invoice' });
//   }
// });

// // DELETE route to delete an invoice
// app.delete('/api/invoices/:id', async (req, res) => {
//   const { id } = req.params;

//   try {
//     await Invoice.findByIdAndDelete(id);
//     res.status(200).json({ message: 'Invoice deleted successfully' });
//   } catch (error) {
//     console.error('Error deleting invoice:', error);
//     res.status(400).json({ error: 'Error deleting invoice' });
//   }
// });

// // Start the server
// app.listen(PORT, () => {
//   console.log(`Server is running on http://localhost:${PORT}`);
// });


// // const express = require('express');
// // const mongoose = require('mongoose');
// // const bodyParser = require('body-parser');
// // const cors = require('cors');  // Import CORS middleware
// // const { Schema } = mongoose;

// // // Initialize Express app
// // const app = express();

// // // Enable CORS for all domains
// // app.use(cors());  // This will allow all origins to make requests to this backend

// // // Middleware to parse JSON requests
// // app.use(bodyParser.json());

// // // Connect to MongoDB (Replace with your MongoDB URI)
// // mongoose.connect('mongodb+srv://khushsoni839:ks1234@cluster0.u3hib.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
// //   useNewUrlParser: true,
// //   useUnifiedTopology: true,
// // })
// // .then(() => console.log('MongoDB connected'))
// // .catch((err) => console.error('MongoDB connection error:', err));

// // // Invoice Schema
// // const productSchema = new Schema({
// //   description: { type: String, required: true },
// //   hsnCode: { type: String, required: true },
// //   quantity: { type: Number, required: true, default: 1 },
// //   price: { type: Number, required: true },
// //   igst: { type: Number, required: true, default: 18 },
// //   totalAmount: { type: Number, required: true }
// // });

// // const courierSchema = new Schema({
// //   dispatchLocation: { type: String, required: true },
// //   courierName: { type: String, required: true }
// // });

// // const invoiceSchema = new Schema({
// //   companyName: { type: String, required: true },
// //   address: { type: String, required: true },
// //   contactNumber: { type: String, required: true },
// //   companyFormation: { type: String, required: true, default: 'Milenium Company' },
// //   courier: courierSchema,
// //   productDetails: [productSchema]
// // });

// // const Invoice = mongoose.model('Invoice', invoiceSchema);

// // // CRUD Routes

// // // Create: Add a new invoice
// // app.post('/api/invoices', async (req, res) => {
// //   try {
// //     const newInvoice = new Invoice(req.body);
// //     await newInvoice.save();
// //     res.status(201).json(newInvoice);
// //   } catch (error) {
// //     res.status(400).json({ error: error.message });
// //   }
// // });

// // // Read: Get all invoices
// // app.get('/api/invoices', async (req, res) => {
// //   try {
// //     const invoices = await Invoice.find();
// //     res.status(200).json(invoices);
// //   } catch (error) {
// //     res.status(400).json({ error: error.message });
// //   }
// // });

// // // Read: Get an invoice by ID
// // app.get('/api/invoices/:id', async (req, res) => {
// //   try {
// //     const invoice = await Invoice.findById(req.params.id);
// //     if (!invoice) {
// //       return res.status(404).json({ error: 'Invoice not found' });
// //     }
// //     res.status(200).json(invoice);
// //   } catch (error) {
// //     res.status(400).json({ error: error.message });
// //   }
// // });

// // // Update: Update an invoice by ID
// // app.put('/api/invoices/:id', async (req, res) => {
// //   try {
// //     const updatedInvoice = await Invoice.findByIdAndUpdate(req.params.id, req.body, { new: true });
// //     if (!updatedInvoice) {
// //       return res.status(404).json({ error: 'Invoice not found' });
// //     }
// //     res.status(200).json(updatedInvoice);
// //   } catch (error) {
// //     res.status(400).json({ error: error.message });
// //   }
// // });

// // // Delete: Delete an invoice by ID
// // app.delete('/api/invoices/:id', async (req, res) => {
// //   try {
// //     const deletedInvoice = await Invoice.findByIdAndDelete(req.params.id);
// //     if (!deletedInvoice) {
// //       return res.status(404).json({ error: 'Invoice not found' });
// //     }
// //     res.status(200).json({ message: 'Invoice deleted successfully' });
// //   } catch (error) {
// //     res.status(400).json({ error: error.message });
// //   }
// // });

// // // Start the server
// // const PORT = process.env.PORT || 5000;
// // app.listen(PORT, () => {
// //   console.log(`Server running on port ${PORT}`);
// // });
