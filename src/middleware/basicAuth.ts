import { Request, Response, NextFunction } from "express";

export function basicAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;

  if (!auth) {
    return res.status(401).send("Unauthorized");
  }

  const [user, pass] = Buffer.from(auth.split(" ")[1], "base64")
    .toString()
    .split(":");

  const validUser = process.env.FEED_USER || "testuser";
  const validPass = process.env.FEED_PASS || "testpass";

  if (user === validUser && pass === validPass) {
    return next();
  }

  return res.status(403).send("Forbidden");
}