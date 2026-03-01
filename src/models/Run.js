import mongoose from "mongoose";

const RunSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true },
    status: {
      type: String,
      enum: ["queued", "running", "succeeded", "failed"],
      default: "queued",
    },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date },
    stats: { type: Object, default: {} },
    config: { type: Object, default: {} },
    error: { type: String },

    syndicator: {
      taskId: { type: String },
      exportId: { type: mongoose.Schema.Types.ObjectId, ref: "Export" },
      job: { type: mongoose.Schema.Types.Mixed }, // stores whatever syndicator returns
    },
  },
  { timestamps: true }
);

export const Run = mongoose.model("Run", RunSchema);
