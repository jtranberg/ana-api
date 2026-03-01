import express from "express";
import { WebflowClient } from "../webflow/client.js"; // adjust to your actual client path
import { config } from "../config.js";

export const webflowPropertiesRouter = express.Router();

const requireAdmin = (req, res, next) => {
  const key = req.header("x-admin-key");
  if (!key || key !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// GET /api/webflow/properties
webflowPropertiesRouter.get("/properties", async (req, res) => {
  try {
    const wf = new WebflowClient(config.webflowToken); // or however you instantiate
    const items = await wf.listItems(process.env.WEBFLOW_COLLECTION_PROPERTIES);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to fetch properties" });
  }
});

// POST /api/webflow/properties
webflowPropertiesRouter.post("/properties", requireAdmin, async (req, res) => {
  try {
    const { name, suite = "", photoUrl = "" } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: "name is required" });

    const wf = new WebflowClient(config.webflowToken);

    // IMPORTANT: fieldData keys must match your Webflow CMS slugs
    const created = await wf.createItem(process.env.WEBFLOW_COLLECTION_PROPERTIES, {
      fieldData: {
        name: name.trim(),
        "suite": suite.trim(),       // <- update slug if different
        "photo-url": photoUrl.trim() // <- update slug if different
      },
    });

    res.json({ property: created });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to create property" });
  }
});

// DELETE /api/webflow/properties/:id
webflowPropertiesRouter.delete("/properties/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const wf = new WebflowClient(config.webflowToken);
    await wf.deleteItem(process.env.WEBFLOW_COLLECTION_PROPERTIES, id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to delete property" });
  }
});