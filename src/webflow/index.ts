import { WebflowClient } from "./client.js";


export function getWebflowClient() {
  const token = process.env.WEBFLOW_API_TOKEN;
  if (!token) throw new Error("WEBFLOW_API_TOKEN is missing");
  return new WebflowClient(token);
}
