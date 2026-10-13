const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const sharp = require("sharp");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ---------- MongoDB ----------
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB Atlas Linked Successfully"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

let gridFSBucket;
mongoose.connection.once("open", () => {
  gridFSBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "attendanceImages",
  });
  console.log("MongoDB GridFS Ready");
});

// ---------- Helpers ----------
const TZ = "Asia/Kolkata";

const getIndiaDateTime = () => {
  const now = new Date();
  return {
    date: now.toLocaleDateString("en-IN", { timeZone: TZ }),
    time: now.toLocaleTimeString("en-IN", {
      timeZone: TZ, hour: "2-digit", minute: "2-digit",
      second: "2-digit", hour12: true,
    }),
  };
};

const compressImage = async (imageBase64) => {
  const buffer = Buffer.from(
    imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64"
  );
  const out = await sharp(buffer)
    .rotate()
    .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
  console.log(`Image: ${(buffer.length/1024).toFixed(2)}KB -> ${(out.length/1024).toFixed(2)}KB`);
  return out;
};

const saveImageToGridFS = (buffer, username, actionType) =>
  new Promise((resolve, reject) => {
    if (!gridFSBucket) return reject(new Error("GridFS not ready."));
    const upload = gridFSBucket.openUploadStream(
      `attendance_${username}_${Date.now()}.webp`,
      { contentType: "image/webp", metadata: { username: username.toUpperCase(), actionType } }
    );
    upload.on("error", reject);
    upload.on("finish", () => resolve(upload.id));
    upload.end(buffer);
  });

const deleteGridFSImage = async (fileId) => {
  if (!fileId || !gridFSBucket) return;
  try {
    await gridFSBucket.delete(new mongoose.Types.ObjectId(fileId));
    console.log("GridFS image deleted:", fileId);
  } catch (e) {
    console.error("GridFS Delete Error:", e.message);
  }
};

// ---------- Schema ----------
const Attendance = mongoose.model("Attendance", new mongoose.Schema({
  username: { type: String, required: true, uppercase: true, trim: true },
  date: { type: String, required: true },
  timeIn: { type: String, default: "" },
  locationIn: { type: String, default: "" },
  photoIn: { type: mongoose.Schema.Types.ObjectId, default: null },
  timeOut: { type: String, default: "Awaiting Log" },
  locationOut: { type: String, default: "Awaiting Log" },
  photoOut: { type: mongoose.Schema.Types.ObjectId, default: null },
  status: { type: String, enum: ["PENDING", "COMPLETED"], default: "PENDING" },
}, { timestamps: true }));

// ---------- POST Attendance ----------
app.post("/api/attendance", async (req, res) => {
  try {
    const { username, imageBase64, latitude, longitude, actionType } = req.body;

    if (!username) return res.status(400).json({ error: "Username is required." });
    if (!imageBase64) return res.status(400).json({ error: "Selfie image is required." });
    if (latitude == null || longitude == null)
      return res.status(400).json({ error: "GPS location is required." });
    if (!["in", "out"].includes(actionType))
      return res.status(400).json({ error: "Invalid attendance action." });

    const user = username.toUpperCase().trim();
    const { date, time } = getIndiaDateTime();
    const telemetry = `Lat: ${Number(latitude).toFixed(4)}, Lon: ${Number(longitude).toFixed(4)}`;

    const existing = await Attendance.findOne({ username: user, date });

    // ---------- CHECK-IN ----------
    if (actionType === "in") {
      if (existing)
        return res.status(400).json({
          error: `You have already checked in today at ${existing.timeIn}.`,
        });

      const imageId = await saveImageToGridFS(
        await compressImage(imageBase64), user, "in"
      );

      const record = await Attendance.create({
        username: user, date, timeIn: time,
        locationIn: telemetry, photoIn: imageId,
      });

      return res.status(201).json({
        message: `Check-In documented successfully at ${time}.`,
        data: {
          id: record._id, username: user, date, time,
          location: telemetry, photo: `/api/images/${imageId}`,
          status: "PENDING",
        },
      });
    }

    // ---------- CHECK-OUT ----------
    if (!existing)
      return res.status(400).json({
        error: "No Check-In record found for today. Please Check-In first.",
      });

    if (existing.timeOut && existing.timeOut !== "Awaiting Log")
      return res.status(400).json({
        error: `You have already checked out today at ${existing.timeOut}.`,
      });

    const imageId = await saveImageToGridFS(
      await compressImage(imageBase64), user, "out"
    );

    Object.assign(existing, {
      timeOut: time, locationOut: telemetry,
      photoOut: imageId, status: "COMPLETED",
    });
    await existing.save();

    return res.status(200).json({
      message: `Check-Out documented successfully at ${time}.`,
      data: {
        id: existing._id, username: user, date, time,
        location: telemetry, photo: `/api/images/${imageId}`,
        status: "COMPLETED",
      },
    });
  } catch (error) {
    console.error("Attendance Error:", error);
    res.status(500).json({
      error: "Database tracking pipeline failure.",
      details: error.message,
    });
  }
});

// ---------- GET Image ----------
app.get("/api/images/:id", async (req, res) => {
  try {
    if (!gridFSBucket)
      return res.status(503).json({ error: "Image storage is not ready." });

    const fileId = new mongoose.Types.ObjectId(req.params.id);
    const file = await mongoose.connection.db
      .collection("attendanceImages.files")
      .findOne({ _id: fileId });

    if (!file) return res.status(404).json({ error: "Image not found." });

    res.set("Content-Type", file.contentType || "image/webp");
    res.set("Cache-Control", "public, max-age=31536000, immutable");

    const stream = gridFSBucket.openDownloadStream(fileId);
    stream.on("error", (e) => {
      console.error("Image Stream Error:", e);
      if (!res.headersSent)
        res.status(404).json({ error: "Unable to retrieve image." });
    });
    stream.pipe(res);
  } catch (error) {
    console.error("Get Image Error:", error);
    res.status(400).json({ error: "Invalid image ID." });
  }
});

// ---------- GET All Attendance ----------
app.get("/api/attendance", async (_req, res) => {
  try {
    const records = await Attendance.find({}).sort({ _id: -1 }).lean();
    res.json(records.map((r) => ({
      ...r,
      photoIn: r.photoIn ? `/api/images/${r.photoIn}` : "",
      photoOut: r.photoOut ? `/api/images/${r.photoOut}` : "",
    })));
  } catch (error) {
    console.error("Fetch Attendance Error:", error);
    res.status(500).json({ error: "Failed to access database logs." });
  }
});

// ---------- DELETE Attendance ----------
app.delete("/api/attendance/:id", async (req, res) => {
  try {
    const result = await Attendance.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: "Record not located." });

    await Promise.all([
      deleteGridFSImage(result.photoIn),
      deleteGridFSImage(result.photoOut),
    ]);

    res.json({ message: "Attendance record and associated images deleted successfully." });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ error: "Failed to delete attendance record." });
  }
});

// ---------- Health & Server ----------
app.get("/", (_req, res) => res.json({
  status: "OK",
  message: "Attendance API running with MongoDB GridFS.",
}));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server live on port ${PORT}`);
  console.log("Attendance timezone: Asia/Kolkata (IST)");
});


// const express = require("express");
// const mongoose = require("mongoose");
// const cors = require("cors");
// const sharp = require("sharp");
// require("dotenv").config();

// const app = express();

// // --------------------------------------------------
// // APP CONFIGURATION
// // --------------------------------------------------

// app.use(cors());

// // Base64 images can be reasonably large.
// // 10mb is enough for the incoming image.
// app.use(express.json({ limit: "10mb" }));

// // --------------------------------------------------
// // MONGODB ATLAS CONNECTION
// // --------------------------------------------------

// mongoose
//   .connect(process.env.MONGODB_URI)
//   .then(() => {
//     console.log("MongoDB Atlas Linked Successfully");
//   })
//   .catch((err) => {
//     console.error("MongoDB Connection Error:", err);
//   });

// // --------------------------------------------------
// // GRIDFS
// // --------------------------------------------------

// let gridFSBucket;

// // Create GridFS bucket after MongoDB connection opens
// mongoose.connection.once("open", () => {
//   gridFSBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
//     bucketName: "attendanceImages",
//   });

//   console.log("MongoDB GridFS Ready");
// });

// // --------------------------------------------------
// // INDIA TIME HELPERS
// // --------------------------------------------------

// const INDIA_TIMEZONE = "Asia/Kolkata";

// function getIndiaDateTime() {
//   const now = new Date();

//   const date = now.toLocaleDateString("en-IN", {
//     timeZone: INDIA_TIMEZONE,
//   });

//   const time = now.toLocaleTimeString("en-IN", {
//     timeZone: INDIA_TIMEZONE,
//     hour: "2-digit",
//     minute: "2-digit",
//     second: "2-digit",
//     hour12: true,
//   });

//   return {
//     date,
//     time,
//   };
// }

// // --------------------------------------------------
// // IMAGE COMPRESSION
// // --------------------------------------------------

// async function compressImage(imageBase64) {
//   try {
//     // Remove data:image/jpeg;base64,... prefix
//     const base64Data = imageBase64.replace(
//       /^data:image\/\w+;base64,/,
//       ""
//     );

//     const imageBuffer = Buffer.from(base64Data, "base64");

//     // Resize and convert to WebP.
//     //
//     // width: 800 means the image will never be wider
//     // than 800 pixels.
//     //
//     // quality: 70 provides a good balance between
//     // attendance-photo quality and storage usage.
//     const compressedBuffer = await sharp(imageBuffer)
//       .rotate() // Correct camera EXIF orientation
//       .resize({
//         width: 800,
//         height: 800,
//         fit: "inside",
//         withoutEnlargement: true,
//       })
//       .webp({
//         quality: 70,
//       })
//       .toBuffer();

//     console.log(
//       `Original image: ${(imageBuffer.length / 1024).toFixed(2)} KB`
//     );

//     console.log(
//       `Compressed image: ${(compressedBuffer.length / 1024).toFixed(2)} KB`
//     );

//     console.log(
//       `Storage reduction: ${(
//         (1 - compressedBuffer.length / imageBuffer.length) *
//         100
//       ).toFixed(1)}%`
//     );

//     return compressedBuffer;
//   } catch (error) {
//     console.error("Image Compression Error:", error);
//     throw new Error("Unable to process image.");
//   }
// }

// // --------------------------------------------------
// // SAVE IMAGE TO GRIDFS
// // --------------------------------------------------

// function saveImageToGridFS(imageBuffer, username, actionType) {
//   return new Promise((resolve, reject) => {
//     if (!gridFSBucket) {
//       return reject(
//         new Error("MongoDB GridFS is not ready yet.")
//       );
//     }

//     const filename = `attendance_${username}_${Date.now()}.webp`;

//     const uploadStream = gridFSBucket.openUploadStream(filename, {
//       contentType: "image/webp",
//       metadata: {
//         username: username.toUpperCase(),
//         actionType,
//       },
//     });

//     uploadStream.on("error", (error) => {
//       reject(error);
//     });

//     uploadStream.on("finish", () => {
//       resolve(uploadStream.id);
//     });

//     uploadStream.end(imageBuffer);
//   });
// }

// // --------------------------------------------------
// // DELETE IMAGE FROM GRIDFS
// // --------------------------------------------------

// async function deleteGridFSImage(fileId) {
//   if (!fileId || !gridFSBucket) {
//     return;
//   }

//   try {
//     const objectId = new mongoose.Types.ObjectId(fileId);

//     await gridFSBucket.delete(objectId);

//     console.log("GridFS image deleted:", fileId);
//   } catch (error) {
//     console.error(
//       "GridFS Image Delete Error:",
//       error.message
//     );
//   }
// }

// // --------------------------------------------------
// // ATTENDANCE SCHEMA
// // --------------------------------------------------

// const AttendanceSchema = new mongoose.Schema(
//   {
//     username: {
//       type: String,
//       required: true,
//       uppercase: true,
//       trim: true,
//     },

//     date: {
//       type: String,
//       required: true,
//     },

//     // ------------------------------
//     // CHECK-IN
//     // ------------------------------

//     timeIn: {
//       type: String,
//       default: "",
//     },

//     locationIn: {
//       type: String,
//       default: "",
//     },

//     // GridFS file ID
//     photoIn: {
//       type: mongoose.Schema.Types.ObjectId,
//       default: null,
//     },

//     // ------------------------------
//     // CHECK-OUT
//     // ------------------------------

//     timeOut: {
//       type: String,
//       default: "Awaiting Log",
//     },

//     locationOut: {
//       type: String,
//       default: "Awaiting Log",
//     },

//     // GridFS file ID
//     photoOut: {
//       type: mongoose.Schema.Types.ObjectId,
//       default: null,
//     },

//     status: {
//       type: String,
//       enum: ["PENDING", "COMPLETED"],
//       default: "PENDING",
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// const Attendance = mongoose.model(
//   "Attendance",
//   AttendanceSchema
// );

// // --------------------------------------------------
// // POST ATTENDANCE
// // --------------------------------------------------

// app.post("/api/attendance", async (req, res) => {
//   try {
//     const {
//       username,
//       imageBase64,
//       latitude,
//       longitude,
//       actionType,
//     } = req.body;

//     // ----------------------------------------------
//     // VALIDATION
//     // ----------------------------------------------

//     if (!username) {
//       return res.status(400).json({
//         error: "Username is required.",
//       });
//     }

//     if (!imageBase64) {
//       return res.status(400).json({
//         error: "Selfie image is required.",
//       });
//     }

//     if (
//       latitude === undefined ||
//       latitude === null ||
//       longitude === undefined ||
//       longitude === null
//     ) {
//       return res.status(400).json({
//         error: "GPS location is required.",
//       });
//     }

//     if (!["in", "out"].includes(actionType)) {
//       return res.status(400).json({
//         error: "Invalid attendance action.",
//       });
//     }

//     const normalizedUsername = username
//       .toUpperCase()
//       .trim();

//     // ----------------------------------------------
//     // INDIA DATE & TIME
//     // ----------------------------------------------

//     const {
//       date: targetDate,
//       time: targetTime,
//     } = getIndiaDateTime();

//     console.log("-----------------------------------");
//     console.log("Attendance Request");
//     console.log("Employee:", normalizedUsername);
//     console.log("Action:", actionType);
//     console.log("India Date:", targetDate);
//     console.log("India Time:", targetTime);
//     console.log("Latitude:", latitude);
//     console.log("Longitude:", longitude);
//     console.log("-----------------------------------");

//     // ----------------------------------------------
//     // LOCATION
//     // ----------------------------------------------

//     const telemetryString =
//       `Lat: ${Number(latitude).toFixed(4)}, ` +
//       `Lon: ${Number(longitude).toFixed(4)}`;

//     // ==================================================
//     // CHECK-IN
//     // ==================================================

//     if (actionType === "in") {
//       // IMPORTANT:
//       // Check the database BEFORE uploading the image.
//       //
//       // This prevents unnecessary image storage when
//       // the employee has already checked in today.

//       const existingTodayLog = await Attendance.findOne({
//         username: normalizedUsername,
//         date: targetDate,
//       });

//       if (existingTodayLog) {
//         return res.status(400).json({
//           error: `You have already checked in today at ${existingTodayLog.timeIn}.`,
//         });
//       }

//       // ----------------------------------------------
//       // COMPRESS IMAGE
//       // ----------------------------------------------

//       const compressedImage = await compressImage(
//         imageBase64
//       );

//       // ----------------------------------------------
//       // SAVE IMAGE TO GRIDFS
//       // ----------------------------------------------

//       const imageId = await saveImageToGridFS(
//         compressedImage,
//         normalizedUsername,
//         "in"
//       );

//       // ----------------------------------------------
//       // CREATE ATTENDANCE RECORD
//       // ----------------------------------------------

//       const newRecord = new Attendance({
//         username: normalizedUsername,

//         date: targetDate,

//         timeIn: targetTime,

//         locationIn: telemetryString,

//         photoIn: imageId,

//         timeOut: "Awaiting Log",

//         locationOut: "Awaiting Log",

//         photoOut: null,

//         status: "PENDING",
//       });

//       await newRecord.save();

//       return res.status(201).json({
//         message: `Check-In documented successfully at ${targetTime}.`,

//         data: {
//           id: newRecord._id,
//           username: normalizedUsername,
//           date: targetDate,
//           time: targetTime,
//           location: telemetryString,

//           // URL to retrieve image
//           photo: `/api/images/${imageId}`,

//           status: "PENDING",
//         },
//       });
//     }

//     // ==================================================
//     // CHECK-OUT
//     // ==================================================

//     if (actionType === "out") {
//       // ----------------------------------------------
//       // FIND TODAY'S CHECK-IN
//       // ----------------------------------------------

//       const existingTodayLog = await Attendance.findOne({
//         username: normalizedUsername,
//         date: targetDate,
//       });

//       if (!existingTodayLog) {
//         return res.status(400).json({
//           error:
//             "No Check-In record found for today. Please Check-In first.",
//         });
//       }

//       // ----------------------------------------------
//       // PREVENT MULTIPLE CHECK-OUTS
//       // ----------------------------------------------

//       if (
//         existingTodayLog.timeOut &&
//         existingTodayLog.timeOut !== "Awaiting Log"
//       ) {
//         return res.status(400).json({
//           error: `You have already checked out today at ${existingTodayLog.timeOut}.`,
//         });
//       }

//       // ----------------------------------------------
//       // COMPRESS IMAGE
//       // ----------------------------------------------

//       const compressedImage = await compressImage(
//         imageBase64
//       );

//       // ----------------------------------------------
//       // SAVE IMAGE TO GRIDFS
//       // ----------------------------------------------

//       const imageId = await saveImageToGridFS(
//         compressedImage,
//         normalizedUsername,
//         "out"
//       );

//       // ----------------------------------------------
//       // UPDATE ATTENDANCE
//       // ----------------------------------------------

//       existingTodayLog.timeOut = targetTime;

//       existingTodayLog.locationOut =
//         telemetryString;

//       existingTodayLog.photoOut = imageId;

//       existingTodayLog.status = "COMPLETED";

//       await existingTodayLog.save();

//       return res.status(200).json({
//         message: `Check-Out documented successfully at ${targetTime}.`,

//         data: {
//           id: existingTodayLog._id,
//           username: normalizedUsername,
//           date: targetDate,
//           time: targetTime,
//           location: telemetryString,

//           photo: `/api/images/${imageId}`,

//           status: "COMPLETED",
//         },
//       });
//     }
//   } catch (error) {
//     console.error("Attendance Error:", error);

//     return res.status(500).json({
//       error: "Database tracking pipeline failure.",
//       details: error.message,
//     });
//   }
// });

// // --------------------------------------------------
// // GET IMAGE FROM GRIDFS
// // --------------------------------------------------

// app.get("/api/images/:id", async (req, res) => {
//   try {
//     if (!gridFSBucket) {
//       return res.status(503).json({
//         error: "Image storage is not ready.",
//       });
//     }

//     const fileId = new mongoose.Types.ObjectId(
//       req.params.id
//     );

//     // Find file information first
//     const files = await mongoose.connection.db
//       .collection("attendanceImages.files")
//       .find({
//         _id: fileId,
//       })
//       .toArray();

//     if (!files.length) {
//       return res.status(404).json({
//         error: "Image not found.",
//       });
//     }

//     const file = files[0];

//     // Tell browser what we're returning
//     res.set(
//       "Content-Type",
//       file.contentType || "image/webp"
//     );

//     // Allow browser to cache the image
//     res.set(
//       "Cache-Control",
//       "public, max-age=31536000, immutable"
//     );

//     const downloadStream =
//       gridFSBucket.openDownloadStream(fileId);

//     downloadStream.on("error", (error) => {
//       console.error("Image Stream Error:", error);

//       if (!res.headersSent) {
//         res.status(404).json({
//           error: "Unable to retrieve image.",
//         });
//       }
//     });

//     downloadStream.pipe(res);
//   } catch (error) {
//     console.error("Get Image Error:", error);

//     res.status(400).json({
//       error: "Invalid image ID.",
//     });
//   }
// });

// // --------------------------------------------------
// // GET ALL ATTENDANCE
// // --------------------------------------------------

// app.get("/api/attendance", async (req, res) => {
//   try {
//     const records = await Attendance.find({})
//       .sort({ _id: -1 })
//       .lean();

//     // Convert GridFS IDs into browser URLs
//     const recordsWithImageUrls = records.map(
//       (record) => ({
//         ...record,

//         photoIn: record.photoIn
//           ? `/api/images/${record.photoIn}`
//           : "",

//         photoOut: record.photoOut
//           ? `/api/images/${record.photoOut}`
//           : "",
//       })
//     );

//     res.status(200).json(recordsWithImageUrls);
//   } catch (error) {
//     console.error(
//       "Fetch Attendance Error:",
//       error
//     );

//     res.status(500).json({
//       error: "Failed to access database logs.",
//     });
//   }
// });

// // --------------------------------------------------
// // DELETE ATTENDANCE
// // --------------------------------------------------

// app.delete("/api/attendance/:id", async (req, res) => {
//   try {
//     const result =
//       await Attendance.findByIdAndDelete(
//         req.params.id
//       );

//     if (!result) {
//       return res.status(404).json({
//         error: "Record not located.",
//       });
//     }

//     // ----------------------------------------------
//     // DELETE CHECK-IN IMAGE
//     // ----------------------------------------------

//     if (result.photoIn) {
//       await deleteGridFSImage(result.photoIn);
//     }

//     // ----------------------------------------------
//     // DELETE CHECK-OUT IMAGE
//     // ----------------------------------------------

//     if (result.photoOut) {
//       await deleteGridFSImage(result.photoOut);
//     }

//     res.status(200).json({
//       message:
//         "Attendance record and associated images deleted successfully.",
//     });
//   } catch (error) {
//     console.error("Delete Error:", error);

//     res.status(500).json({
//       error: "Failed to delete attendance record.",
//     });
//   }
// });

// // --------------------------------------------------
// // HEALTH CHECK
// // --------------------------------------------------

// app.get("/", (req, res) => {
//   res.json({
//     status: "OK",
//     message:
//       "Attendance API running with MongoDB GridFS.",
//   });
// });

// // --------------------------------------------------
// // SERVER
// // --------------------------------------------------

// const PORT = process.env.PORT || 5000;

// app.listen(PORT, () => {
//   console.log(`Server live on port ${PORT}`);
//   console.log("Attendance timezone: Asia/Kolkata (IST)");
// });




// // const express = require('express');
// // const mongoose = require('mongoose');
// // const cloudinary = require('cloudinary').v2;
// // const indianTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
// // const recordDate = new Date(indianTime); 
// // const cors = require('cors');
// // require('dotenv').config();

// // const app = express();
// // app.use(cors());
// // app.use(express.json({ limit: '10mb' }));

// // // Cloudinary Configuration
// // cloudinary.config({
// //   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
// //   api_key: process.env.CLOUDINARY_API_KEY,
// //   api_secret: process.env.CLOUDINARY_API_SECRET,
// // });

// // // MongoDB Atlas Connection
// // mongoose.connect(process.env.MONGODB_URI)
// //   .then(() => console.log('MongoDB Atlas Linked Successfully'))
// //   .catch(err => console.error('MongoDB Connection Error:', err));

// // // Database schema tracking pairs of Check-In and Check-Out metrics together
// // const AttendanceSchema = new mongoose.Schema({
// //   username: { type: String, required: true, uppercase: true },
// //   date: { type: String, required: true },
// //   timeIn: { type: String, default: '' },
// //   locationIn: { type: String, default: '' },
// //   photoIn: { type: String, default: '' },
// //   timeOut: { type: String, default: 'Awaiting Log' },
// //   locationOut: { type: String, default: 'Awaiting Log' },
// //   photoOut: { type: String, default: '' },
// //   status: {
// //   type: String,
// //   default: "PENDING"
// // }
// // });

// // const Attendance = mongoose.model('Attendance', AttendanceSchema);

// // // Attendance Punch Processing Router
// // app.post('/api/attendance', async (req, res) => {
// //   try {
// //     const { username, imageBase64, latitude, longitude, actionType } = req.body;
    
// //     if (!username) return res.status(400).json({ error: 'Please enter an identity name string parameter.' });

// //     const targetDate = new Date().toLocaleDateString('en-IN');
// //     const targetTime = new Date().toLocaleTimeString('en-IN');
// //     const telemetryString = `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`;

// //     // Upload base64 stream directly to Cloudinary storage bucket
// //     const uploadResult = await cloudinary.uploader.upload(imageBase64, {
// //       folder: 'paired_attendance_system'
// //     });
// //     const photoUrl = uploadResult.secure_url;

// //     if (actionType === 'in') {
// //       // Create a fresh new document entry for Check-In activity
// //       const newRecord = new Attendance({
// //         username: username,
// //         date: targetDate,
// //         timeIn: targetTime,
// //         locationIn: telemetryString,
// //         photoIn: photoUrl
// //       });
// //       await newRecord.save();
// //       return res.status(201).json({ message: 'Check-In documented successfully.' });
// //     } else {
// //       // Find today's existing row document matching this employee signature to attach check-out metrics
// //       const existingTodayLog = await Attendance.findOne({
// //         username: username.toUpperCase(),
// //         date: targetDate
// //       });

// //       if (!existingTodayLog) {
// //         return res.status(400).json({ error: 'No active Check-In record captured today for this username.' });
// //       }

// //       // Update checkout properties in-place inside MongoDB Atlas
// //       existingTodayLog.timeOut = targetTime;
// //       existingTodayLog.locationOut = telemetryString;
// //       existingTodayLog.photoOut = photoUrl;
// //       await existingTodayLog.save();

// //       return res.status(200).json({ message: 'Check-Out documented successfully.' });
// //     }
// //   } catch (error) {
// //     console.error(error);
// //     res.status(500).json({ error: 'Database tracking pipeline failure.' });
// //   }
// // });

// // // Fetch all unified attendance logs
// // app.get('/api/attendance', async (req, res) => {
// //   try {
// //     const records = await Attendance.find({}).sort({ _id: -1 }); // Newest rows first
// //     res.status(200).json(records);
// //   } catch (error) {
// //     res.status(500).json({ error: 'Failed to access database logs.' });
// //   }
// // });

// // // Row deletion management endpoint
// // app.delete('/api/attendance/:id', async (req, res) => {
// //   try {
// //     const result = await Attendance.findByIdAndDelete(req.params.id);
// //     if (!result) return res.status(404).json({ error: 'Record not located.' });
// //     res.status(200).json({ message: 'Row data purged successfully.' });
// //   } catch (error) {
// //     res.status(500).json({ error: 'Failed to delete row item.' });
// //   }
// // });

// // const PORT = process.env.PORT || 5000;
// // app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
