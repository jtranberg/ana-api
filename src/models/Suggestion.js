import mongoose from "mongoose";

const SuggestionSchema = new mongoose.Schema(
  {
    runId: { type: mongoose.Schema.Types.ObjectId, ref: "Run", required: true },
    entityType: { type: String },
    entityId: { type: String },
    kind: { type: String }, // copy|compliance|field_fix
    before: { type: Object },
    after: { type: Object },
    rationale: { type: String },
    confidence: { type: Number, min: 0, max: 1 },
  },
  { timestamps: true }
);

export const Suggestion = mongoose.model("Suggestion", SuggestionSchema);
