import { Router, Request, Response, NextFunction } from "express";
import { getCanonicalData } from "../services/feedService";
import { buildLivFeed } from "../services/buildLivFeed";
import { basicAuth } from "../middleware/basicAuth";

const router = Router();

router.get("/liv-rent.xml", basicAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getCanonicalData();
    const xml = buildLivFeed(data, {
      available: req.query.available === "true",
    });

    res.type("application/xml");
    res.send(xml);
  } catch (err) {
    next(err);
  }
});

export default router;