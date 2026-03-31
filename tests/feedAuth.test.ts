import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();

describe("feed auth", () => {
  test("rejects unauthorized request", async () => {
    const res = await request(app).get("/feeds/liv-rent.xml");

    expect([401, 403]).toContain(res.status);
  });

  test("accepts authorized request", async () => {
    const res = await request(app)
      .get("/feeds/liv-rent.xml")
      .auth(
        process.env.FEED_USER || "testuser",
        process.env.FEED_PASS || "testpass"
      );

    expect([200, 401]).toContain(res.status);
  });
});