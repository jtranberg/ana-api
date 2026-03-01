import mongoose from "mongoose";

const IssueSchema = new mongoose.Schema(
  {
    runId: { type: mongoose.Schema.Types.ObjectId, ref: "Run", required: true },
    severity: { type: String, enum: ["low", "medium", "high"], default: "low" },
    entityType: { type: String },   // property|unit|floorplan
    entityId: { type: String },
    code: { type: String },
    message: { type: String },
    field: { type: String },
    suggestedFix: { type: Object },
  },
  { timestamps: true }
);

export const Issue = mongoose.model("Issue", IssueSchema);
