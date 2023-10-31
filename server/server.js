import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { createServer } from "http";
import cors from "cors";
import session from "express-session";
import errorHandler from "./middleware/errorMiddleware.js";
import userRoutes from "./routes/userRoutes.js";
import courseRoutes from "./routes/courseRoutes.js";

// Get environment variables
dotenv.config();

// Database
global.mongoose = mongoose;
const connectDB = async() => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      keepAlive: true
    });
    mongoose.connection.once("open", () => {
      console.log("MongoDB database connection established successfully");
    });
  }
  catch (err){
    console.log("Failed to connect to mongoDB.");
    console.log(err);
  }
}
connectDB();

// Initialize server
const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(errorHandler);

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

// Debug
// app.use(function(req, res, next){
//   req.email = req.session.email ? req.session.email : null;
//   console.log("HTTP request", {"email" : req.email}, req.method, req.url, req.body);
//   next();
// });

// Routes
app.use("/api/users", userRoutes);
app.use("/api/courses", courseRoutes);

// Assign port
const PORT = process.env.PORT || 8080;

// Start server
httpServer.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});