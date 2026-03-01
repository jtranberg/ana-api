import mongoose from "mongoose";

const ExportSchema = new mongoose.Schema(
  {
    runId: { type: mongoose.Schema.Types.ObjectId, ref: "Run", required: true },
    type: { type: String, enum: ["xml", "patch"], required: true },
    // For MVP we store a URL from syndicator or a local path
    url: { type: String },
    filename: { type: String },
  },
  { timestamps: true }
);

export const Export = mongoose.model("Export", ExportSchema);
