const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");

const userRoutes    = require("./routes/userRoutes");
const doctorRoutes  = require("./routes/doctorRoutes");
const ipfsRoutes    = require("./routes/ipfsRoutes");
const medicalRoutes = require("./routes/medicalRecords");
const requestRoutes = require("./routes/requestRoutes"); 
const viewHistoryRoutes = require("./routes/viewHistoryRoutes");
const complaintRoutes = require("./routes/complaintRoutes");

const app = express();

connectDB();
const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(",");
app.use(cors());
app.use(express.json());

// Railway pings this to know the server is up
app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/users",    userRoutes);
app.use("/api/doctors",  doctorRoutes);
app.use("/api/ipfs",     ipfsRoutes);
app.use("/api/records",  medicalRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/viewhistory", viewHistoryRoutes);
app.use("/api/complaints", complaintRoutes);

const PORT = process.env.PORT || 5010;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
