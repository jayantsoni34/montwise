const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

const PORT = 5000;

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------------------------------------------
// MongoDB Connection
// --------------------------------------------------

// IMPORTANT:
// Put your MongoDB URI in .env instead of directly
// writing the username/password here.
//
// Example:
// MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/attendanceDB

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://jayantsoni4382:js%40workdb@cluster0.jjjc03f.mongodb.net/attendanceDB?retryWrites=true&w=majority";

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((error) => {
    console.error("MongoDB Connection Error:", error);
  });

// --------------------------------------------------
// Upload Directory
// --------------------------------------------------

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}

// --------------------------------------------------
// Multer Storage
// --------------------------------------------------

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);

    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      extension;

    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
});

// --------------------------------------------------
// MATERIAL ISSUE SCHEMA
// --------------------------------------------------

const materialIssueSchema = new mongoose.Schema(
  {
    complaintNo: {
      type: String,
      required: true,
      trim: true,
    },

    customerDistributor: {
      type: String,
      required: true,
      trim: true,
    },

    engineer: {
      type: String,
      required: true,
      trim: true,
    },

    partName: {
      type: String,
      required: true,
      trim: true,
    },

    qty: {
      type: Number,
      required: true,
      min: 1,
    },

    partSerialNo: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const MaterialIssue = mongoose.model(
  "MaterialIssue",
  materialIssueSchema,
  "materialissues"
);

// --------------------------------------------------
// MATERIAL RETURN SCHEMA
// --------------------------------------------------

const materialReturnSchema = new mongoose.Schema(
  {
    complaintNo: {
      type: String,
      required: true,
      trim: true,
    },

    customerDistributor: {
      type: String,
      required: true,
      trim: true,
    },

    engineer: {
      type: String,
      required: true,
      trim: true,
    },

    partName: {
      type: String,
      required: true,
      trim: true,
    },

    qty: {
      type: Number,
      required: true,
      min: 1,
    },

    partSerialNo: {
      type: String,
      required: true,
      trim: true,
    },

    receiveCondition: {
      type: String,
      required: true,
      trim: true,
    },

    returnReason: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const MaterialReturn = mongoose.model(
  "MaterialReturn",
  materialReturnSchema,
  "materialreturns"
);

// --------------------------------------------------
// DEFECTIVE PARTS SCHEMA
// --------------------------------------------------

const defectivePartsSchema = new mongoose.Schema(
  {
    complaintNo: {
      type: String,
      required: true,
      trim: true,
    },

    customerDistributor: {
      type: String,
      required: true,
      trim: true,
    },

    engineer: {
      type: String,
      required: true,
      trim: true,
    },

    partName: {
      type: String,
      required: true,
      trim: true,
    },

    qty: {
      type: Number,
      required: true,
      min: 1,
    },

    partSerialNo: {
      type: String,
      required: true,
      trim: true,
    },

    receiveCondition: {
      type: String,
      required: true,
      trim: true,
    },

    warrantyStatus: {
      type: String,
      required: true,
      trim: true,
    },

    courierName: {
      type: String,
      required: true,
      trim: true,
    },

    docketNo: {
      type: String,
      required: true,
      trim: true,
    },

    receiveChallan: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const DefectiveParts = mongoose.model(
  "DefectiveParts",
  defectivePartsSchema,
  "defectiveparts"
);

// ==================================================
// MATERIAL ISSUE ROUTES
// ==================================================

// GET ALL MATERIAL ISSUE
app.get("/api/material-issue", async (req, res) => {
  try {
    const data = await MaterialIssue.find().sort({
      createdAt: -1,
    });

    res.json(data);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch material issue records",
      error: error.message,
    });
  }
});

// GET SINGLE MATERIAL ISSUE
app.get("/api/material-issue/:id", async (req, res) => {
  try {
    const data = await MaterialIssue.findById(
      req.params.id
    );

    if (!data) {
      return res.status(404).json({
        message: "Material issue record not found",
      });
    }

    res.json(data);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: error.message,
    });
  }
});

// CREATE MATERIAL ISSUE
app.post("/api/material-issue", async (req, res) => {
  try {
    const materialIssue =
      await MaterialIssue.create({
        complaintNo: req.body.complaintNo,
        customerDistributor:
          req.body.customerDistributor,
        engineer: req.body.engineer,
        partName: req.body.partName,
        qty: Number(req.body.qty),
        partSerialNo: req.body.partSerialNo,
      });

    res.status(201).json(materialIssue);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to save material issue",
      error: error.message,
    });
  }
});

// UPDATE MATERIAL ISSUE
app.put(
  "/api/material-issue/:id",
  async (req, res) => {
    try {
      const updated =
        await MaterialIssue.findByIdAndUpdate(
          req.params.id,
          {
            complaintNo: req.body.complaintNo,
            customerDistributor:
              req.body.customerDistributor,
            engineer: req.body.engineer,
            partName: req.body.partName,
            qty: Number(req.body.qty),
            partSerialNo: req.body.partSerialNo,
          },
          {
            new: true,
            runValidators: true,
          }
        );

      if (!updated) {
        return res.status(404).json({
          message: "Material issue record not found",
        });
      }

      res.json(updated);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to update material issue",
        error: error.message,
      });
    }
  }
);

// DELETE MATERIAL ISSUE
app.delete(
  "/api/material-issue/:id",
  async (req, res) => {
    try {
      const deleted =
        await MaterialIssue.findByIdAndDelete(
          req.params.id
        );

      if (!deleted) {
        return res.status(404).json({
          message: "Material issue record not found",
        });
      }

      res.json({
        message:
          "Material issue deleted successfully",
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// ==================================================
// MATERIAL RETURN ROUTES
// ==================================================

// GET ALL MATERIAL RETURN
app.get("/api/material-return", async (req, res) => {
  try {
    const data = await MaterialReturn.find().sort({
      createdAt: -1,
    });

    res.json(data);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch material return records",
      error: error.message,
    });
  }
});

// GET SINGLE MATERIAL RETURN
app.get(
  "/api/material-return/:id",
  async (req, res) => {
    try {
      const data =
        await MaterialReturn.findById(
          req.params.id
        );

      if (!data) {
        return res.status(404).json({
          message: "Material return record not found",
        });
      }

      res.json(data);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// CREATE MATERIAL RETURN
app.post("/api/material-return", async (req, res) => {
  try {
    const materialReturn =
      await MaterialReturn.create({
        complaintNo: req.body.complaintNo,
        customerDistributor:
          req.body.customerDistributor,
        engineer: req.body.engineer,
        partName: req.body.partName,
        qty: Number(req.body.qty),
        partSerialNo: req.body.partSerialNo,
        receiveCondition:
          req.body.receiveCondition,
        returnReason:
          req.body.returnReason,
      });

    res.status(201).json(materialReturn);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to save material return",
      error: error.message,
    });
  }
});

// UPDATE MATERIAL RETURN
app.put(
  "/api/material-return/:id",
  async (req, res) => {
    try {
      const updated =
        await MaterialReturn.findByIdAndUpdate(
          req.params.id,
          {
            complaintNo: req.body.complaintNo,
            customerDistributor:
              req.body.customerDistributor,
            engineer: req.body.engineer,
            partName: req.body.partName,
            qty: Number(req.body.qty),
            partSerialNo: req.body.partSerialNo,
            receiveCondition:
              req.body.receiveCondition,
            returnReason:
              req.body.returnReason,
          },
          {
            new: true,
            runValidators: true,
          }
        );

      if (!updated) {
        return res.status(404).json({
          message: "Material return record not found",
        });
      }

      res.json(updated);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to update material return",
        error: error.message,
      });
    }
  }
);

// DELETE MATERIAL RETURN
app.delete(
  "/api/material-return/:id",
  async (req, res) => {
    try {
      const deleted =
        await MaterialReturn.findByIdAndDelete(
          req.params.id
        );

      if (!deleted) {
        return res.status(404).json({
          message: "Material return record not found",
        });
      }

      res.json({
        message:
          "Material return deleted successfully",
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// ==================================================
// DEFECTIVE PARTS ROUTES
// ==================================================

// GET ALL DEFECTIVE PARTS
app.get("/api/defective-parts", async (req, res) => {
  try {
    const data =
      await DefectiveParts.find().sort({
        createdAt: -1,
      });

    res.json(data);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message:
        "Failed to fetch defective parts records",
      error: error.message,
    });
  }
});

// GET SINGLE DEFECTIVE PART
app.get(
  "/api/defective-parts/:id",
  async (req, res) => {
    try {
      const data =
        await DefectiveParts.findById(
          req.params.id
        );

      if (!data) {
        return res.status(404).json({
          message:
            "Defective parts record not found",
        });
      }

      res.json(data);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// CREATE DEFECTIVE PART
app.post(
  "/api/defective-parts",
  upload.single("receiveChallan"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: "Receive Challan is required",
        });
      }

      const defectivePart =
        await DefectiveParts.create({
          complaintNo: req.body.complaintNo,

          customerDistributor:
            req.body.customerDistributor,

          engineer: req.body.engineer,

          partName: req.body.partName,

          qty: Number(req.body.qty),

          partSerialNo:
            req.body.partSerialNo,

          receiveCondition:
            req.body.receiveCondition,

          warrantyStatus:
            req.body.warrantyStatus,

          courierName:
            req.body.courierName,

          docketNo:
            req.body.docketNo,

          receiveChallan:
            `/uploads/${req.file.filename}`,
        });

      res.status(201).json(defectivePart);
    } catch (error) {
      console.error(error);

      // Delete uploaded file if database save fails
      if (req.file) {
        const filePath = path.join(
          uploadDir,
          req.file.filename
        );

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      res.status(500).json({
        message:
          "Failed to save defective part",
        error: error.message,
      });
    }
  }
);

// UPDATE DEFECTIVE PART
app.put(
  "/api/defective-parts/:id",
  upload.single("receiveChallan"),
  async (req, res) => {
    try {
      const existing =
        await DefectiveParts.findById(
          req.params.id
        );

      if (!existing) {
        if (req.file) {
          const filePath = path.join(
            uploadDir,
            req.file.filename
          );

          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }

        return res.status(404).json({
          message:
            "Defective parts record not found",
        });
      }

      const updateData = {
        complaintNo: req.body.complaintNo,

        customerDistributor:
          req.body.customerDistributor,

        engineer: req.body.engineer,

        partName: req.body.partName,

        qty: Number(req.body.qty),

        partSerialNo:
          req.body.partSerialNo,

        receiveCondition:
          req.body.receiveCondition,

        warrantyStatus:
          req.body.warrantyStatus,

        courierName:
          req.body.courierName,

        docketNo:
          req.body.docketNo,
      };

      // If new challan is uploaded,
      // replace old challan
      if (req.file) {
        updateData.receiveChallan =
          `/uploads/${req.file.filename}`;

        // Delete old file
        if (
          existing.receiveChallan
        ) {
          const oldFileName =
            path.basename(
              existing.receiveChallan
            );

          const oldFilePath =
            path.join(
              uploadDir,
              oldFileName
            );

          if (
            fs.existsSync(oldFilePath)
          ) {
            fs.unlinkSync(oldFilePath);
          }
        }
      } else {
        // Keep existing challan
        updateData.receiveChallan =
          existing.receiveChallan;
      }

      const updated =
        await DefectiveParts.findByIdAndUpdate(
          req.params.id,
          updateData,
          {
            new: true,
            runValidators: true,
          }
        );

      res.json(updated);
    } catch (error) {
      console.error(error);

      if (req.file) {
        const filePath = path.join(
          uploadDir,
          req.file.filename
        );

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      res.status(500).json({
        message:
          "Failed to update defective part",
        error: error.message,
      });
    }
  }
);

// DELETE DEFECTIVE PART
app.delete(
  "/api/defective-parts/:id",
  async (req, res) => {
    try {
      const deleted =
        await DefectiveParts.findByIdAndDelete(
          req.params.id
        );

      if (!deleted) {
        return res.status(404).json({
          message:
            "Defective parts record not found",
        });
      }

      // Delete associated challan
      if (deleted.receiveChallan) {
        const fileName =
          path.basename(
            deleted.receiveChallan
          );

        const filePath = path.join(
          uploadDir,
          fileName
        );

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      res.json({
        message:
          "Defective part deleted successfully",
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// ==================================================
// UPLOADS
// ==================================================

app.use(
  "/uploads",
  express.static(uploadDir)
);

// ==================================================
// TEST ROUTE
// ==================================================

app.get("/", (req, res) => {
  res.json({
    message: "Material Management API is running",
  });
});

// ==================================================
// START SERVER
// ==================================================

app.listen(PORT, () => {
  console.log(
    `Backend running on http://localhost:${PORT}`
  );
});
