// src/routes/debugWebflow.js
import express from "express";
import { WebflowClient } from "../webflow/client.js";

const router = express.Router();

router.get("/debug/unit/:id", async (req, res) => {
  const client = new WebflowClient({ token: process.env.WEBFLOW_API_TOKEN });
  const collectionId = process.env.WEBFLOW_COLLECTION_UNITS; // 698a0e851a56b059fe14febd
  const itemId = req.params.id;

  const item = await client.getCollectionItem({
    collectionId,
    itemId,
  });

  res.json(item);
});

export default router;
